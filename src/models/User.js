const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * 用户模型
 */
const UserSchema = new Schema({
  // 钱包地址
  walletAddress: {
    type: String,
    required: true,
    unique: true
  },
  
  // 用户名
  username: {
    type: String,
    default: ''
  },
  
  // 邮箱
  email: {
    type: String,
    default: ''
  },
  
  // 钱包是否已验证
  isWalletVerified: {
    type: Boolean,
    default: false
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
    }
  },
  
  // 是否激活
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

/**
 * 更新交易统计
 * @param {number} amount - 交易金额
 * @param {boolean} isSuccess - 是否成功
 * @returns {Promise<boolean>} - 是否更新成功
 */
UserSchema.methods.updateTransactionStats = async function(amount, isSuccess = true) {
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
    
    await this.save();
    return true;
    
  } catch (error) {
    console.error('更新交易统计失败:', error);
    return false;
  }
};

module.exports = mongoose.model('User', UserSchema);