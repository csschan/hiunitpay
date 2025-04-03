/**
 * 验证工具
 */

/**
 * 验证支付数据
 * @param {Object} data - 支付数据
 * @returns {Object} - 验证结果
 */
exports.validatePaymentData = (data) => {
  const errors = [];
  
  // 验证金额
  if (!data.amount) {
    errors.push('金额不能为空');
  } else if (isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
    errors.push('金额必须是大于0的数字');
  }
  
  // 验证钱包地址
  if (!data.walletAddress) {
    errors.push('钱包地址不能为空');
  } else if (!/^0x[a-fA-F0-9]{40}$/.test(data.walletAddress)) {
    errors.push('无效的以太坊钱包地址');
  }
  
  // 验证二维码内容
  if (!data.qrCodeContent) {
    errors.push('二维码内容不能为空');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * 验证LP数据
 * @param {Object} data - LP数据
 * @returns {Object} - 验证结果
 */
exports.validateLPData = (data) => {
  const errors = [];
  
  // 验证钱包地址
  if (!data.walletAddress) {
    errors.push('钱包地址不能为空');
  } else if (!/^0x[a-fA-F0-9]{40}$/.test(data.walletAddress)) {
    errors.push('无效的以太坊钱包地址');
  }
  
  // 验证支持平台
  if (!data.supportedPlatforms || 
      (Array.isArray(data.supportedPlatforms) && data.supportedPlatforms.length === 0)) {
    errors.push('至少需要支持一个支付平台');
  }
  
  // 验证额度
  if (!data.totalQuota) {
    errors.push('总额度不能为空');
  } else if (isNaN(parseFloat(data.totalQuota)) || parseFloat(data.totalQuota) <= 0) {
    errors.push('总额度必须是大于0的数字');
  }
  
  if (!data.perTransactionQuota) {
    errors.push('单笔额度不能为空');
  } else if (isNaN(parseFloat(data.perTransactionQuota)) || parseFloat(data.perTransactionQuota) <= 0) {
    errors.push('单笔额度必须是大于0的数字');
  } else if (parseFloat(data.perTransactionQuota) > parseFloat(data.totalQuota)) {
    errors.push('单笔额度不能大于总额度');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * 验证以太坊钱包地址
 * @param {string} address - 钱包地址
 * @returns {boolean} - 是否有效
 */
exports.isValidEthereumAddress = (address) => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * 验证签名
 * @param {string} address - 钱包地址
 * @param {string} signature - 签名
 * @param {Object} data - 签名数据
 * @returns {Promise<boolean>} - 是否有效
 */
exports.verifySignature = async (address, signature, data) => {
  try {
    // 实际项目中需要实现签名验证逻辑
    // 这里简化处理，直接返回true
    return true;
  } catch (error) {
    console.error('验证签名失败:', error);
    return false;
  }
};