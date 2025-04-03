const LP = require('../models/LP');
const PaymentIntent = require('../models/PaymentIntent');

/**
 * LP注册
 * @route POST /api/lp/register
 * @access Public
 */
exports.registerLP = async (req, res) => {
  try {
    const {
      walletAddress,
      name,
      email,
      supportedPlatforms,
      totalQuota,
      perTransactionQuota
    } = req.body;
    
    // 验证请求数据
    if (!walletAddress || !supportedPlatforms || !totalQuota || !perTransactionQuota) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：钱包地址、支持平台、总额度和单笔额度必须提供'
      });
    }
    
    // 验证钱包地址格式
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: '无效的以太坊钱包地址'
      });
    }
    
    // 检查LP是否已存在
    let lp = await LP.findOne({ walletAddress });
    if (lp) {
      return res.status(400).json({
        success: false,
        message: '该钱包地址已注册为LP'
      });
    }
    
    // 创建新LP
    lp = await LP.create({
      walletAddress,
      name: name || '',
      email: email || '',
      supportedPlatforms: Array.isArray(supportedPlatforms) ? supportedPlatforms : [supportedPlatforms],
      quota: {
        total: parseFloat(totalQuota),
        available: parseFloat(totalQuota),
        locked: 0,
        perTransaction: parseFloat(perTransactionQuota)
      },
      isVerified: true, // MVP阶段简化验证流程
      isActive: true
    });
    
    return res.status(201).json({
      success: true,
      message: 'LP注册成功',
      data: {
        lpId: lp._id,
        walletAddress: lp.walletAddress,
        quota: lp.quota
      }
    });
    
  } catch (error) {
    console.error('LP注册失败:', error);
    return res.status(500).json({
      success: false,
      message: 'LP注册失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 更新LP额度
 * @route PUT /api/lp/quota
 * @access Public
 */
exports.updateQuota = async (req, res) => {
  try {
    const { walletAddress, totalQuota, perTransactionQuota } = req.body;
    
    // 验证请求数据
    if (!walletAddress || (!totalQuota && !perTransactionQuota)) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：钱包地址和至少一项额度必须提供'
      });
    }
    
    // 查找LP
    const lp = await LP.findOne({ walletAddress });
    if (!lp) {
      return res.status(404).json({
        success: false,
        message: '未找到该LP'
      });
    }
    
    // 更新额度
    if (totalQuota) {
      const newTotalQuota = parseFloat(totalQuota);
      // 确保新总额度不小于已锁定额度
      if (newTotalQuota < lp.quota.locked) {
        return res.status(400).json({
          success: false,
          message: `新总额度不能小于已锁定额度 ${lp.quota.locked}`
        });
      }
      
      // 计算可用额度的变化
      const availableDiff = newTotalQuota - lp.quota.total;
      
      lp.quota.total = newTotalQuota;
      lp.quota.available += availableDiff;
    }
    
    if (perTransactionQuota) {
      lp.quota.perTransaction = parseFloat(perTransactionQuota);
    }
    
    await lp.save();
    
    return res.status(200).json({
      success: true,
      message: 'LP额度更新成功',
      data: {
        quota: lp.quota
      }
    });
    
  } catch (error) {
    console.error('更新LP额度失败:', error);
    return res.status(500).json({
      success: false,
      message: '更新LP额度失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 获取LP详情
 * @route GET /api/lp/:walletAddress
 * @access Public
 */
exports.getLP = async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    const lp = await LP.findOne({ walletAddress });
    if (!lp) {
      return res.status(404).json({
        success: false,
        message: '未找到该LP'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: lp
    });
    
  } catch (error) {
    console.error('获取LP详情失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取LP详情失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * 获取任务池
 * @route GET /api/lp/task-pool
 * @access Public
 */
exports.getTaskPool = async (req, res) => {
  try {
    const { platform, minAmount, maxAmount, limit = 10, page = 1 } = req.query;
    
    // 构建查询条件
    const query = { status: 'created' };
    
    if (platform) {
      query.platform = platform;
    }
    
    if (minAmount) {
      query.amount = { ...query.amount, $gte: parseFloat(minAmount) };
    }
    
    if (maxAmount) {
      query.amount = { ...query.amount, $lte: parseFloat(maxAmount) };
    }
    
    // 分页
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // 查询任务池
    const tasks = await PaymentIntent.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // 获取总数
    const total = await PaymentIntent.countDocuments(query);
    
    return res.status(200).json({
      success: true,
      data: {
        tasks,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
    
  } catch (error) {
    console.error('获取任务池失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取任务池失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * LP接单
 * @route POST /api/lp/task/:id/claim
 * @access Public
 */
exports.claimTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { walletAddress } = req.body;
    
    // 验证请求数据
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：钱包地址必须提供'
      });
    }
    
    // 查找LP
    const lp = await LP.findOne({ walletAddress });
    if (!lp) {
      return res.status(404).json({
        success: false,
        message: '未找到该LP'
      });
    }
    
    // 检查LP状态
    if (!lp.isActive || !lp.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'LP账户未激活或未验证'
      });
    }
    
    // 查找支付意图
    const paymentIntent = await PaymentIntent.findById(id);
    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: '支付意图不存在'
      });
    }
    
    // 检查支付意图状态
    if (paymentIntent.status !== 'created') {
      return res.status(400).json({
        success: false,
        message: `当前状态 ${paymentIntent.status} 不可接单`
      });
    }
    
    // 检查LP是否支持该平台
    if (!lp.supportedPlatforms.includes(paymentIntent.platform)) {
      return res.status(400).json({
        success: false,
        message: `LP不支持 ${paymentIntent.platform} 平台`
      });
    }
    
    // 检查LP额度
    if (lp.quota.available < paymentIntent.amount) {
      return res.status(400).json({
        success: false,
        message: '可用额度不足'
      });
    }
    
    if (lp.quota.perTransaction < paymentIntent.amount) {
      return res.status(400).json({
        success: false,
        message: '超出单笔额度限制'
      });
    }
    
    // 匹配LP
    const matched = await paymentIntent.matchLP(lp);
    if (!matched) {
      return res.status(400).json({
        success: false,
        message: '接单失败，请重试'
      });
    }
    
    // 通知用户LP已接单
    req.io.emit('payment_intent_matched', {
      id: paymentIntent._id,
      status: 'matched',
      lp: {
        walletAddress: lp.walletAddress
      }
    });
    
    return res.status(200).json({
      success: true,
      message: '接单成功',
      data: {
        paymentIntentId: paymentIntent._id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        platform: paymentIntent.platform,
        merchantInfo: paymentIntent.merchantInfo
      }
    });
    
  } catch (error) {
    console.error('LP接单失败:', error);
    return res.status(500).json({
      success: false,
      message: 'LP接单失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

/**
 * LP标记已支付
 * @route POST /api/lp/task/:id/mark-paid
 * @access Public
 */
exports.markTaskPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { walletAddress, proofImage, note } = req.body;
    
    // 验证请求数据
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：钱包地址必须提供'
      });
    }
    
    // 查找支付意图
    const paymentIntent = await PaymentIntent.findById(id);
    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: '支付意图不存在'
      });
    }
    
    // 验证LP身份
    if (paymentIntent.lp.walletAddress !== walletAddress) {
      return res.status(403).json({
        success: false,
        message: '无权操作此支付意图'
      });
    }
    
    // 检查支付意图状态
    if (paymentIntent.status !== 'matched') {
      return res.status(400).json({
        success: false,
        message: `当前状态 ${paymentIntent.status} 不可标记为已支付`
      });
    }
    
    // 标记为LP已支付
    const marked = await paymentIntent.markLPPaid(
      note || `LP已完成支付${proofImage ? '，并上传了支付凭证' : ''}`
    );
    
    if (!marked) {
      return res.status(400).json({
        success: false,
        message: '标记支付失败，请重试'
      });
    }
    
    // 通知用户LP已支付
    req.io.emit('payment_intent_lp_paid', {
      id: paymentIntent._id,
      status: 'lp_paid',
      lp: {
        walletAddress
      }
    });
    
    return res.status(200).json({
      success: true,
      message: '标记支付成功',
      data: {
        paymentIntentId: paymentIntent._id,
        status: paymentIntent.status
      }
    });
    
  } catch (error) {
    console.error('标记支付失败:', error);
    return res.status(500).json({
      success: false,
      message: '标记支付失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};