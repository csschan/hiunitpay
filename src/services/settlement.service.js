const { ethers } = require('ethers');
const PaymentIntent = require('../models/PaymentIntent');
const LP = require('../models/LP');
const User = require('../models/User');
const LinkCardSettlementABI = require('../../contracts/LinkCardSettlement.json');

/**
 * 结算服务
 * 处理用户确认后的链上USDT转账操作
 */
class SettlementService {
  constructor() {
    // 初始化以太坊提供者
    this.provider = new ethers.providers.JsonRpcProvider(
      process.env.ETH_PROVIDER_URL
    );
    
    // 初始化管理员钱包
    this.adminWallet = new ethers.Wallet(
      process.env.ADMIN_WALLET_PRIVATE_KEY,
      this.provider
    );
    
    // 初始化USDT合约
    this.usdtContract = new ethers.Contract(
      process.env.USDT_CONTRACT_ADDRESS,
      [
        // ERC20 ABI 片段
        'function balanceOf(address owner) view returns (uint256)',
        'function transfer(address to, uint256 amount) returns (bool)',
        'function approve(address spender, uint256 amount) returns (bool)',
        'function transferFrom(address from, address to, uint256 amount) returns (bool)'
      ],
      this.adminWallet
    );
    
    // 初始化结算合约
    this.settlementContract = new ethers.Contract(
      process.env.CONTRACT_ADDRESS,
      LinkCardSettlementABI,
      this.adminWallet
    );
  }
  
  /**
   * 处理结算任务
   * @param {Object} task - 结算任务
   * @returns {Promise<Object>} - 结算结果
   */
  async processSettlement(task) {
    try {
      const { paymentIntentId, amount, userWallet, lpWallet } = task;
      
      // 查找支付意图
      const paymentIntent = await PaymentIntent.findById(paymentIntentId);
      if (!paymentIntent) {
        throw new Error(`支付意图 ${paymentIntentId} 不存在`);
      }
      
      // 检查状态是否为用户已确认
      if (paymentIntent.status !== 'user_confirmed') {
        throw new Error(`支付意图状态 ${paymentIntent.status} 不可结算`);
      }
      
      // 检查钱包地址是否匹配
      if (paymentIntent.user.walletAddress !== userWallet) {
        throw new Error('用户钱包地址不匹配');
      }
      
      if (paymentIntent.lp.walletAddress !== lpWallet) {
        throw new Error('LP钱包地址不匹配');
      }
      
      // 计算USDT金额（假设1:1兑换，实际项目中可能需要汇率转换）
      const usdtAmount = ethers.utils.parseUnits(
        amount.toString(),
        6 // USDT的小数位数
      );
      
      // 检查用户USDT余额
      const userBalance = await this.usdtContract.balanceOf(userWallet);
      if (userBalance.lt(usdtAmount)) {
        throw new Error('用户USDT余额不足');
      }
      
      // 调用结算合约的settlePayment方法
      // 注意：用户必须事先授权结算合约可以转移其USDT
      // 在前端用户确认收货时，需要先进行授权操作
      const tx = await this.settlementContract.settlePayment(
        lpWallet,
        usdtAmount
      );
      
      // 等待交易确认
      const receipt = await tx.wait();
      
      // 更新支付意图状态为已结算
      paymentIntent.status = 'settled';
      paymentIntent.settlement = {
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        timestamp: new Date(),
        amount: amount,
        usdtAmount: ethers.utils.formatUnits(usdtAmount, 6)
      };
      
      paymentIntent.statusHistory.push({
        status: 'settled',
        timestamp: new Date(),
        note: `链上结算完成，交易哈希: ${receipt.transactionHash}`
      });
      
      await paymentIntent.save();
      
      // 更新LP的可用额度（补回锁定的额度）
      const lp = await LP.findById(paymentIntent.lp.lpId);
      if (lp) {
        await lp.releaseLockedQuota(amount);
        await lp.increaseAvailableQuota(amount);
        
        // 更新LP的交易统计
        await lp.updateTransactionStats(amount);
      }
      
      // 更新用户的交易统计
      const user = await User.findById(paymentIntent.user.userId);
      if (user) {
        await user.updateTransactionStats(amount);
      }
      
      return {
        success: true,
        txHash: receipt.transactionHash,
        paymentIntentId: paymentIntent._id
      };
    } catch (error) {
      console.error('结算失败:', error);
      
      // 如果支付意图存在，记录错误信息
      if (task.paymentIntentId) {
        try {
          const paymentIntent = await PaymentIntent.findById(task.paymentIntentId);
          if (paymentIntent) {
            paymentIntent.statusHistory.push({
              status: 'settlement_failed',
              timestamp: new Date(),
              note: `结算失败: ${error.message}`
            });
            await paymentIntent.save();
          }
        } catch (logError) {
          console.error('记录结算失败状态时出错:', logError);
        }
      }
      
      return {
        success: false,
        error: error.message,
        paymentIntentId: task.paymentIntentId
      };
    }
  }
}

module.exports = SettlementService;