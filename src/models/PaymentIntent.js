const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * 支付意图模型
 * 记录用户扫码创建的支付任务
 */
const PaymentIntentSchema = new Schema({
  // 支付金额
  amount: {
    type: Number,
    required: true
  },
  
  // 货币类型
  currency: {
    type: String,
    required: true,
    default: 'CNY'
  },
  
  // 支付描述
  description: {
    type: String,
    default: ''
  },
  
  // 支付平台
  platform: {
    type: String,
    required: true,
    enum: ['PayPal', 'GCash', 'Alipay', 'WeChat', 'Other']
  },
  
  // 商户信息
  merchantInfo: {
    id: String,
    name: String,
    accountId: String,
    qrCodeContent: String
  },
  
  // 用户信息
  user: {
    walletAddress: {
      type: String,
      required: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // LP信息
  lp: {
    walletAddress: String,
    lpId: {
      type: Schema.Types.ObjectId,
      ref: 'LP'
    },
    matchedAt: Date
  },
  
  // 支付状态
  // created: 创建支付意图
  // matched: LP已匹配
  // lp_paid: LP已支付
  // user_confirmed: 用户已确认
  // settled: 已结算
  // cancelled: 已取消
  // expired: 已过期
  status: {
    type: String,
    required: true,
    enum: ['created', 'matched', 'lp_paid', 'user_confirmed', 'settled', 'cancelled', 'expired'],
    default: 'created'
  },
  
  // 状态历史
  statusHistory: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: String
  }],
  
  // 结算信息
  settlement: {
    txHash: String,
    blockNumber: Number,
    timestamp: Date,
    amount: Number,
    usdtAmount: String
  },
  
  // 过期时间
  expiresAt: {
    type: Date,
    default: function() {
      // 默认24小时后过期
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
  }
}, {
  timestamps: true
});

/**
 * 匹配LP
 * @param {Object} lp - LP对象
 * @returns {Promise<boolean>} - 是否匹配成功
 */
PaymentIntentSchema.methods.matchLP = async function(lp) {
  try {
    // 检查状态是否为created
    if (this.status !== 'created') {
      return false;
    }
    
    // 锁定LP额度
    const locked = await lp.lockQuota(this.amount);
    if (!locked) {
      return false;
    }
    
    // 更新支付意图状态
    this.status = 'matched';
    this.lp = {
      walletAddress: lp.walletAddress,
      lpId: lp._id,
      matchedAt: new Date()
    };
    
    this.statusHistory.push({
      status: 'matched',
      timestamp: new Date(),
      note: `匹配LP: ${lp.walletAddress}`
    });
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('匹配LP失败:', error);
    return false;
  }
};

/**
 * 标记LP已支付
 * @param {string} note - 备注
 * @returns {Promise<boolean>} - 是否标记成功
 */
PaymentIntentSchema.methods.markLPPaid = async function(note) {
  try {
    // 检查状态是否为matched
    if (this.status !== 'matched') {
      return false;
    }
    
    // 更新支付意图状态
    this.status = 'lp_paid';
    this.statusHistory.push({
      status: 'lp_paid',
      timestamp: new Date(),
      note: note || 'LP已完成支付'
    });
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('标记LP已支付失败:', error);
    return false;
  }
};

module.exports = mongoose.model('PaymentIntent', PaymentIntentSchema);