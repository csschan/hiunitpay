const { ethers } = require('ethers');
const PaymentIntent = require('../models/PaymentIntent');
const LinkCardSettlementABI = require('../../contracts/LinkCardSettlement.json');

/**
 * 合约事件监听器服务
 * 监听LinkCardSettlement合约的PaymentSettled事件
 * 并更新对应任务的状态
 */
class ContractListenerService {
  constructor() {
    // 初始化以太坊提供者
    this.provider = new ethers.providers.JsonRpcProvider(
      process.env.ETH_PROVIDER_URL
    );
    
    // 初始化合约实例
    this.settlementContract = new ethers.Contract(
      process.env.CONTRACT_ADDRESS,
      LinkCardSettlementABI,
      this.provider
    );
    
    // 监听状态
    this.isListening = false;
  }
  
  /**
   * 开始监听合约事件
   */
  startListening() {
    if (this.isListening) {
      console.log('合约事件监听器已经在运行');
      return;
    }
    
    console.log('开始监听LinkCardSettlement合约事件...');
    
    // 监听PaymentSettled事件
    this.settlementContract.on('PaymentSettled', async (user, lp, amount, timestamp, event) => {
      try {
        console.log('捕获到PaymentSettled事件:');
        console.log('- 用户:', user);
        console.log('- LP:', lp);
        console.log('- 金额:', ethers.utils.formatUnits(amount, 6));
        console.log('- 时间戳:', new Date(timestamp.toNumber() * 1000).toISOString());
        console.log('- 交易哈希:', event.transactionHash);
        
        // 查找对应的支付意图
        const paymentIntent = await this.findPaymentIntentByAddresses(user, lp);
        
        if (paymentIntent) {
          // 更新支付意图状态
          await this.updatePaymentIntentStatus(paymentIntent, {
            txHash: event.transactionHash,
            blockNumber: event.blockNumber,
            amount: ethers.utils.formatUnits(amount, 6),
            timestamp: new Date(timestamp.toNumber() * 1000)
          });
        } else {
          console.log('未找到匹配的支付意图');
        }
      } catch (error) {
        console.error('处理PaymentSettled事件时出错:', error);
      }
    });
    
    this.isListening = true;
  }
  
  /**
   * 停止监听合约事件
   */
  stopListening() {
    if (!this.isListening) {
      console.log('合约事件监听器未运行');
      return;
    }
    
    // 移除所有事件监听器
    this.settlementContract.removeAllListeners('PaymentSettled');
    
    console.log('已停止监听LinkCardSettlement合约事件');
    this.isListening = false;
  }
  
  /**
   * 根据用户和LP地址查找支付意图
   * @param {string} userAddress - 用户钱包地址
   * @param {string} lpAddress - LP钱包地址
   * @returns {Promise<Object|null>} - 支付意图对象
   */
  async findPaymentIntentByAddresses(userAddress, lpAddress) {
    try {
      // 查找状态为user_confirmed的支付意图
      const paymentIntent = await PaymentIntent.findOne({
        'user.walletAddress': userAddress,
        'lp.walletAddress': lpAddress,
        'status': 'user_confirmed'
      });
      
      return paymentIntent;
    } catch (error) {
      console.error('查找支付意图失败:', error);
      return null;
    }
  }
  
  /**
   * 更新支付意图状态为已结算
   * @param {Object} paymentIntent - 支付意图对象
   * @param {Object} settlementInfo - 结算信息
   * @returns {Promise<boolean>} - 是否成功
   */
  async updatePaymentIntentStatus(paymentIntent, settlementInfo) {
    try {
      // 更新支付意图状态为已结算
      paymentIntent.status = 'settled';
      paymentIntent.settlement = {
        txHash: settlementInfo.txHash,
        blockNumber: settlementInfo.blockNumber,
        timestamp: settlementInfo.timestamp,
        amount: paymentIntent.amount,
        usdtAmount: settlementInfo.amount
      };
      
      paymentIntent.statusHistory.push({
        status: 'settled',
        timestamp: new Date(),
        note: `链上结算完成，交易哈希: ${settlementInfo.txHash}`
      });
      
      await paymentIntent.save();
      
      console.log(`支付意图 ${paymentIntent._id} 已更新为已结算状态`);
      return true;
    } catch (error) {
      console.error('更新支付意图状态失败:', error);
      return false;
    }
  }
}

module.exports = ContractListenerService;