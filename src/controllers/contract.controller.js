/**
 * 合约控制器
 * 提供合约相关的API
 */

/**
 * 获取合约信息
 * @route GET /api/contract-info
 * @access Public
 */
exports.getContractInfo = async (req, res) => {
  try {
    // 从环境变量中获取合约地址
    const contractAddress = process.env.CONTRACT_ADDRESS;
    const usdtAddress = process.env.USDT_CONTRACT_ADDRESS;
    
    if (!contractAddress || !usdtAddress) {
      return res.status(500).json({
        success: false,
        message: '合约地址未配置'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: {
        contractAddress,
        usdtAddress
      }
    });
  } catch (error) {
    console.error('获取合约信息失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取合约信息失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};