// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LinkCardSettlement
 * @dev 用于Link Card支付系统的清算合约
 */
contract LinkCardSettlement is Ownable {
    // USDT合约地址
    IERC20 public usdtToken;
    
    // 事件：支付已结算
    event PaymentSettled(
        address indexed user,
        address indexed lp,
        uint256 amount,
        uint256 timestamp
    );
    
    /**
     * @dev 构造函数
     * @param _usdtAddress USDT合约地址
     */
    constructor(address _usdtAddress) {
        usdtToken = IERC20(_usdtAddress);
    }
    
    /**
     * @dev 更新USDT合约地址
     * @param _usdtAddress 新的USDT合约地址
     */
    function setUsdtToken(address _usdtAddress) external onlyOwner {
        usdtToken = IERC20(_usdtAddress);
    }
    
    /**
     * @dev 结算支付，将USDT从用户转账给LP
     * @param lp LP的钱包地址
     * @param amount USDT金额（以最小单位计算，6位小数）
     * @return 是否成功
     */
    function settlePayment(address lp, uint256 amount) external returns (bool) {
        require(lp != address(0), "Invalid LP address");
        require(amount > 0, "Amount must be greater than 0");
        
        // 从用户地址转账USDT到LP地址
        // 注意：用户必须事先授权本合约可以转移其USDT
        bool success = usdtToken.transferFrom(msg.sender, lp, amount);
        require(success, "Transfer failed");
        
        // 触发支付结算事件
        emit PaymentSettled(msg.sender, lp, amount, block.timestamp);
        
        return true;
    }
    
    /**
     * @dev 紧急提款，用于从合约中提取意外发送的代币
     * @param token 代币合约地址
     * @param amount 提取金额
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }
}