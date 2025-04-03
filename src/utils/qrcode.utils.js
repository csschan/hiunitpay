/**
 * 二维码解析和支付平台识别工具
 */

/**
 * 解析二维码内容
 * @param {string} qrCodeContent - 二维码内容
 * @returns {Promise<Object>} - 解析结果
 */
exports.parseQRCode = async (qrCodeContent) => {
  try {
    // 这里是简化的实现，实际项目中可能需要使用专门的二维码解析库
    // 或者调用外部API来解析更复杂的二维码
    
    if (!qrCodeContent || typeof qrCodeContent !== 'string') {
      return {
        success: false,
        error: '无效的二维码内容'
      };
    }
    
    // 尝试解析URL格式的二维码
    let data = qrCodeContent;
    
    // 如果是URL，尝试提取查询参数
    if (qrCodeContent.startsWith('http')) {
      try {
        const url = new URL(qrCodeContent);
        data = {
          url: qrCodeContent,
          host: url.hostname,
          path: url.pathname,
          params: Object.fromEntries(url.searchParams)
        };
      } catch (error) {
        // 如果不是有效URL，保持原始内容
        console.log('非标准URL格式，使用原始内容');
      }
    }
    
    return {
      success: true,
      data
    };
    
  } catch (error) {
    console.error('解析二维码失败:', error);
    return {
      success: false,
      error: '解析二维码失败: ' + error.message
    };
  }
};

/**
 * 识别支付平台类型
 * @param {Object|string} parsedData - 解析后的二维码数据
 * @returns {Object} - 支付平台信息
 */
exports.identifyPaymentPlatform = (parsedData) => {
  try {
    // 默认平台信息
    const defaultResult = {
      success: false,
      error: '无法识别的支付平台'
    };
    
    // 如果是字符串，尝试直接匹配
    if (typeof parsedData === 'string') {
      const content = parsedData.toLowerCase();
      
      // PayPal
      if (content.includes('paypal.com')) {
        return {
          success: true,
          platform: 'PayPal',
          merchantId: extractMerchantInfo(content, 'paypal')
        };
      }
      
      // GCash
      if (content.includes('gcash.com') || content.includes('gcash.ph')) {
        return {
          success: true,
          platform: 'GCash',
          merchantId: extractMerchantInfo(content, 'gcash')
        };
      }
      
      // Alipay
      if (content.includes('alipay.com') || content.includes('alipaydev.com')) {
        return {
          success: true,
          platform: 'Alipay',
          merchantId: extractMerchantInfo(content, 'alipay')
        };
      }
      
      // WeChat Pay
      if (content.includes('weixin.qq.com') || content.includes('wechat.com')) {
        return {
          success: true,
          platform: 'WeChat',
          merchantId: extractMerchantInfo(content, 'wechat')
        };
      }
      
      return defaultResult;
    }
    
    // 如果是对象（URL解析结果）
    if (typeof parsedData === 'object') {
      const url = parsedData.url ? parsedData.url.toLowerCase() : '';
      const host = parsedData.host ? parsedData.host.toLowerCase() : '';
      const params = parsedData.params || {};
      
      // PayPal
      if (host.includes('paypal.com')) {
        return {
          success: true,
          platform: 'PayPal',
          merchantId: params.business || params.receiver || '',
          merchantName: params.name || ''
        };
      }
      
      // GCash
      if (host.includes('gcash.com') || host.includes('gcash.ph')) {
        return {
          success: true,
          platform: 'GCash',
          merchantId: params.account || params.id || '',
          merchantName: params.name || ''
        };
      }
      
      // Alipay
      if (host.includes('alipay.com')) {
        return {
          success: true,
          platform: 'Alipay',
          merchantId: params.uid || params.user_id || '',
          merchantName: params.name || ''
        };
      }
      
      // WeChat Pay
      if (host.includes('weixin.qq.com') || host.includes('wechat.com')) {
        return {
          success: true,
          platform: 'WeChat',
          merchantId: params.u || params.uid || '',
          merchantName: params.n || params.name || ''
        };
      }
      
      return defaultResult;
    }
    
    return defaultResult;
    
  } catch (error) {
    console.error('识别支付平台失败:', error);
    return {
      success: false,
      error: '识别支付平台失败: ' + error.message
    };
  }
};

/**
 * 从二维码内容中提取商户信息
 * @private
 * @param {string} content - 二维码内容
 * @param {string} platform - 支付平台
 * @returns {string} - 商户ID
 */
function extractMerchantInfo(content, platform) {
  // 简化实现，实际项目中需要根据各平台的二维码格式进行更精确的提取
  switch (platform) {
    case 'paypal':
      // 尝试匹配PayPal商户ID格式
      const paypalMatch = content.match(/business=([^&]+)/) || content.match(/receiver=([^&]+)/);
      return paypalMatch ? paypalMatch[1] : '';
      
    case 'gcash':
      // 尝试匹配GCash商户ID格式
      const gcashMatch = content.match(/account=([^&]+)/) || content.match(/id=([^&]+)/);
      return gcashMatch ? gcashMatch[1] : '';
      
    case 'alipay':
      // 尝试匹配支付宝商户ID格式
      const alipayMatch = content.match(/uid=([^&]+)/) || content.match(/user_id=([^&]+)/);
      return alipayMatch ? alipayMatch[1] : '';
      
    case 'wechat':
      // 尝试匹配微信支付商户ID格式
      const wechatMatch = content.match(/u=([^&]+)/) || content.match(/uid=([^&]+)/);
      return wechatMatch ? wechatMatch[1] : '';
      
    default:
      return '';
  }
}