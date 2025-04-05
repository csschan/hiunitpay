const PaymentIntent = require('../models/PaymentIntent');
const User = require('../models/User');
const LP = require('../models/LP');
const { parseQRCode, identifyPaymentPlatform } = require('../utils/qrcode.utils');
const { validatePaymentData } = require('../utils/validation.utils');

/**
 * 创建支付意图
 * @route POST /api/payment-intent
 * @access Public
 */
exports.createPaymentIntent = async (req, res) => {
  try {
    const { qrCodeContent, amount, currency, description, walletAddress } = req.body;
    
    // 验证请求数据
    if (!qrCodeContent || !amount || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：二维码内容、金额和钱包地址必须提供'
      });
    }
    
    // 验证钱包地址格式
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: '无效的以太坊钱包地址'
      });
    }
    
    // 解析二维码内容
    const parsedQRData = await parseQRCode(qrCodeContent);
    if (!parsedQRData.success) {
      return res.status(400).json({
        success: false,
        message: '无法解析二维码内容',
        error: parsedQRData.error
      });
    }
    
    // 识别支付平台
    const platformInfo = identifyPaymentPlatform(parsedQRData.data);
    if (!platformInfo.success) {
      return res.status(400).json({
        success: false,
        message: '无法识别支付平台',
        error: platformInfo.error
      });
    }
    
    // 查找或创建用户
    let user = await User.findOne({ walletAddress });
    if (!user) {
      user = await User.create({
        walletAddress,
        isWalletVerified: true
      });
    }
    
    // 创建支付意图
    const paymentIntent = await PaymentIntent.create({
      amount: parseFloat(amount),
      currency: currency || 'CNY',
      description: description || '通过UnitPay支付',
      platform: platformInfo.platform,
      merchantInfo: {
        id: platformInfo.merchantId || '',
        name: platformInfo.merchantName || '',
        accountId: platformInfo.accountId || '',
        qrCodeContent
      },
      user: {
        walletAddress,
        userId: user._id
      },
      status: 'created',
      statusHistory: [{
        status: 'created',
        timestamp: new Date(),
        note: '用户创建支付意图'
      }]
    });
    
    // 通过Socket.io通知LP有新的支付意图
    req.io.emit('new_payment_intent', {
      id: paymentIntent._id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      platform: paymentIntent.platform
    });
    
    // 更新用户交易统计
    await user.updateTransactionStats(0); // 初始金额为0，结算后更新
    
    return res.status(201).json({
      success: true,
      message: '支付意图创建成功',
      data: {
        paymentIntentId: paymentIntent._id,
        status: paymentIntent.status,
        expiresAt: paymentIntent.expiresAt
      }
    });
    
  } catch (error) {
    console.error('创建支付意图失败:', error);
    return res.status(500).json({
      success: false,
      message: '创建支付意图失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 获取支付意图详情
 * @route GET /api/payment-intent/:id
 * @access Public
 */
exports.getPaymentIntent = async (req, res) => {
  try {
    const { id } = req.params;
    
    const paymentIntent = await PaymentIntent.findById(id);
    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: '支付意图不存在'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: paymentIntent
    });
    
  } catch (error) {
    console.error('获取支付意图失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取支付意图失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 获取用户的支付意图列表
 * @route GET /api/payment-intent/user/:walletAddress
 * @access Public
 */
exports.getUserPaymentIntents = async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { status, limit = 10, page = 1 } = req.query;
    
    // 构建查询条件
    const query = { 'user.walletAddress': walletAddress };
    if (status) {
      query.status = status;
    }
    
    // 分页
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // 查询支付意图
    const paymentIntents = await PaymentIntent.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // 获取总数
    const total = await PaymentIntent.countDocuments(query);
    
    return res.status(200).json({
      success: true,
      data: {
        paymentIntents,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
    
  } catch (error) {
    console.error('获取用户支付意图列表失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取用户支付意图列表失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 取消支付意图
 * @route PUT /api/payment-intent/:id/cancel
 * @access Public
 */
exports.cancelPaymentIntent = async (req, res) => {
  try {
    const { id } = req.params;
    const { walletAddress, reason } = req.body;
    
    // 查找支付意图
    const paymentIntent = await PaymentIntent.findById(id);
    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: '支付意图不存在'
      });
    }
    
    // 验证用户身份
    if (paymentIntent.user.walletAddress !== walletAddress) {
      return res.status(403).json({
        success: false,
        message: '无权操作此支付意图'
      });
    }
    
    // 检查状态是否可取消
    const cancelableStatuses = ['created', 'matched'];
    if (!cancelableStatuses.includes(paymentIntent.status)) {
      return res.status(400).json({
        success: false,
        message: `当前状态 ${paymentIntent.status} 不可取消`
      });
    }
    
    // 如果已匹配LP，释放LP的锁定额度
    if (paymentIntent.status === 'matched' && paymentIntent.lp) {
      const lp = await LP.findById(paymentIntent.lp.lpId);
      if (lp) {
        // 释放锁定额度
        await lp.releaseLockedQuota(paymentIntent.amount);
      }
    }
    
    // 更新支付意图状态
    paymentIntent.status = 'cancelled';
    paymentIntent.statusHistory.push({
      status: 'cancelled',
      timestamp: new Date(),
      note: reason || '用户取消支付'
    });
    
    await paymentIntent.save();
    
    // 通知相关方支付已取消
    req.io.emit('payment_intent_cancelled', {
      id: paymentIntent._id,
      status: 'cancelled'
    });
    
    return res.status(200).json({
      success: true,
      message: '支付意图已取消',
      data: {
        status: paymentIntent.status
      }
    });
    
  } catch (error) {
    console.error('取消支付意图失败:', error);
    return res.status(500).json({
      success: false,
      message: '取消支付意图失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 用户确认收到服务
 * @route PUT /api/payment-intent/:id/confirm
 * @access Public
 */
exports.confirmPaymentIntent = async (req, res) => {
  try {
    const { id } = req.params;
    const { walletAddress, signature } = req.body;
    
    // 查找支付意图
    const paymentIntent = await PaymentIntent.findById(id);
    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: '支付意图不存在'
      });
    }
    
    // 验证用户身份
    if (paymentIntent.user.walletAddress !== walletAddress) {
      return res.status(403).json({
        success: false,
        message: '无权操作此支付意图'
      });
    }
    
    // 检查状态是否为LP已支付
    if (paymentIntent.status !== 'lp_paid') {
      return res.status(400).json({
        success: false,
        message: `当前状态 ${paymentIntent.status} 不可确认`
      });
    }
    
    // 验证授权交易哈希（如果提供）
    const { txHash } = req.body;
    if (txHash) {
      // 记录授权交易哈希
      console.log(`用户 ${walletAddress} 已授权USDT转账，交易哈希: ${txHash}`);
    }
    
    // 更新支付意图状态为用户已确认
    paymentIntent.status = 'user_confirmed';
    paymentIntent.statusHistory.push({
      status: 'user_confirmed',
      timestamp: new Date(),
      note: '用户确认收到服务'
    });
    
    await paymentIntent.save();
    
    // 通知相关方用户已确认
    req.io.emit('payment_intent_confirmed', {
      id: paymentIntent._id,
      status: 'user_confirmed'
    });
    
    // 触发链上结算流程
    // 这里应该是异步的，不应该阻塞响应
    req.settlementQueue.add({
      paymentIntentId: paymentIntent._id,
      amount: paymentIntent.amount,
      userWallet: paymentIntent.user.walletAddress,
      lpWallet: paymentIntent.lp.walletAddress
    });
    
    return res.status(200).json({
      success: true,
      message: '确认成功，正在进行链上结算',
      data: {
        status: paymentIntent.status
      }
    });
    
  } catch (error) {
    console.error('确认支付意图失败:', error);
    return res.status(500).json({
      success: false,
      message: '确认支付意图失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 获取LP的支付意图列表
 * @route GET /api/payment-intent/lp/:walletAddress
 * @access Public
 */
exports.getLPPaymentIntents = async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { status, limit = 10, page = 1 } = req.query;
    
    // 构建查询条件
    const query = { 'lp.walletAddress': walletAddress };
    if (status) {
      query.status = status;
    }
    
    // 分页
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // 查询支付意图
    const paymentIntents = await PaymentIntent.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // 获取总数
    const total = await PaymentIntent.countDocuments(query);
    
    return res.status(200).json({
      success: true,
      data: {
        paymentIntents,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
    
  } catch (error) {
    console.error('获取LP支付意图列表失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取LP支付意图列表失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};