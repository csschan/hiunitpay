const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * LP模型
 * 流动性提供者，负责接单和实际支付
 */
const LPSchema = new Schema({
  // 钱包地址
  walletAddress: {
    type: String,
    required: true,
    unique: true
  },
  
  // 名称
  name: {
    type: String,
    default: ''
  },
  
  // 邮箱
  email: {
    type: String,
    default: ''
  },
  
  // 支持的支付平台
  supportedPlatforms: {
    type: [String],
    enum: ['PayPal', 'GCash', 'Alipay', 'WeChat', 'Other'],
    default: []
  },
  
  // 额度信息
  quota: {
    // 总额度
    total: {
      type: Number,
      required: true
    },
    // 可用额度
    available: {
      type: Number,
      required: true
    },
    // 锁定额度
    locked: {
      type: Number,
      default: 0
    },
    // 单笔额度上限
    perTransaction: {
      type: Number,
      required: true
    }
  },
  
  // 交易统计
  stats: {
    // 总交易次数
    totalTransactions: {
      type: Number,
      default: 0
    },
    // 总交易金额
    totalAmount: {
      type: Number,
      default: 0
    },
    // 成功交易次数
    successfulTransactions: {
      type: Number,
      default: 0
    },
    // 失败交易次数
    failedTransactions: {
      type: Number,
      default: 0
    },
    // 平均响应时间（分钟）
    averageResponseTime: {
      type: Number,
      default: 0
    }
  },
  
  // 是否已验证
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // 是否激活
  isActive: {
    type: Boolean,
    default: true
  },
  
  // 评分（1-5）
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 5
  }
}, {
  timestamps: true
});

/**
 * 锁定额度
 * @param {number} amount - 锁定金额
 * @returns {Promise<boolean>} - 是否锁定成功
 */
LPSchema.methods.lockQuota = async function(amount) {
  try {
    // 检查可用额度是否足够
    if (this.quota.available < amount) {
      return false;
    }
    
    // 检查单笔额度是否足够
    if (this.quota.perTransaction < amount) {
      return false;
    }
    
    // 锁定额度
    this.quota.available -= amount;
    this.quota.locked += amount;
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('锁定额度失败:', error);
    return false;
  }
};

/**
 * 释放锁定额度
 * @param {number} amount - 释放金额
 * @returns {Promise<boolean>} - 是否释放成功
 */
LPSchema.methods.releaseLockedQuota = async function(amount) {
  try {
    // 检查锁定额度是否足够
    if (this.quota.locked < amount) {
      // 如果锁定额度不足，释放所有锁定额度
      this.quota.available += this.quota.locked;
      this.quota.locked = 0;
    } else {
      // 释放指定金额
      this.quota.available += amount;
      this.quota.locked -= amount;
    }
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('释放锁定额度失败:', error);
    return false;
  }
};

/**
 * 增加可用额度
 * @param {number} amount - 增加金额
 * @returns {Promise<boolean>} - 是否增加成功
 */
LPSchema.methods.increaseAvailableQuota = async function(amount) {
  try {
    // 增加可用额度和总额度
    this.quota.available += amount;
    this.quota.total += amount;
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('增加可用额度失败:', error);
    return false;
  }
};

/**
 * 更新交易统计
 * @param {number} amount - 交易金额
 * @param {boolean} isSuccess - 是否成功
 * @param {number} responseTime - 响应时间（分钟）
 * @returns {Promise<boolean>} - 是否更新成功
 */
LPSchema.methods.updateTransactionStats = async function(amount, isSuccess = true, responseTime = 0) {
  try {
    // 更新总交易次数和金额
    this.stats.totalTransactions += 1;
    this.stats.totalAmount += amount;
    
    // 更新成功/失败交易次数
    if (isSuccess) {
      this.stats.successfulTransactions += 1;
    } else {
      this.stats.failedTransactions += 1;
    }
    
    // 更新平均响应时间
    if (responseTime > 0) {
      const totalResponseTime = this.stats.averageResponseTime * (this.stats.totalTransactions - 1);
      this.stats.averageResponseTime = (totalResponseTime + responseTime) / this.stats.totalTransactions;
    }
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('更新交易统计失败:', error);
    return false;
  }
};

module.exports = mongoose.model('LP', LPSchema);