/**
 * Link Card 前端应用
 * 实现钱包连接、扫码支付和与后端API交互
 */

// 全局变量
let walletAddress = '';
let provider = null;
let signer = null;
let socket = null;
let currentPaymentIntentId = null;

// DOM元素
const connectWalletBtn = document.getElementById('connect-wallet-btn');
const walletConnectSection = document.getElementById('wallet-connect-section');
const userDashboard = document.getElementById('user-dashboard');
const walletAddressSpan = document.getElementById('wallet-address');
const scanQrBtn = document.getElementById('scan-qr-btn');
const qrFileInput = document.getElementById('qr-file-input');
const qrContent = document.getElementById('qr-content');
const paymentPlatform = document.getElementById('payment-platform');
const paymentAmount = document.getElementById('payment-amount');
const paymentDescription = document.getElementById('payment-description');
const createPaymentBtn = document.getElementById('create-payment-btn');
const paymentForm = document.getElementById('payment-form');
const paymentTasksList = document.getElementById('payment-tasks-list');
const noTasksMessage = document.getElementById('no-tasks-message');
const confirmPaymentModal = new bootstrap.Modal(document.getElementById('confirm-payment-modal'));
const confirmAmount = document.getElementById('confirm-amount');
const confirmReceivedBtn = document.getElementById('confirm-received-btn');

// API基础URL
const API_BASE_URL = '/api';

// 初始化应用
async function initApp() {
  // 检查是否已连接钱包
  const savedWalletAddress = localStorage.getItem('walletAddress');
  if (savedWalletAddress) {
    try {
      await connectWallet(true);
    } catch (error) {
      console.error('自动连接钱包失败:', error);
      localStorage.removeItem('walletAddress');
    }
  }
  
  // 初始化事件监听器
  initEventListeners();
}

// 初始化事件监听器
function initEventListeners() {
  // 连接钱包按钮
  connectWalletBtn.addEventListener('click', () => connectWallet());
  
  // 扫描二维码按钮
  scanQrBtn.addEventListener('click', () => qrFileInput.click());
  
  // 二维码文件输入
  qrFileInput.addEventListener('change', handleQrFileSelect);
  
  // 创建支付按钮
  createPaymentBtn.addEventListener('click', createPaymentIntent);
  
  // 确认收到按钮
  confirmReceivedBtn.addEventListener('click', confirmPaymentReceived);
}

// 连接钱包
async function connectWallet(autoConnect = false) {
  try {
    // 检查是否安装了MetaMask
    if (window.ethereum) {
      // 创建provider
      provider = new ethers.providers.Web3Provider(window.ethereum);
      
      // 请求账户访问
      const accounts = await provider.send('eth_requestAccounts', []);
      walletAddress = accounts[0];
      
      // 获取signer
      signer = provider.getSigner();
      
      // 保存钱包地址
      localStorage.setItem('walletAddress', walletAddress);
      
      // 更新UI
      walletAddressSpan.textContent = walletAddress;
      walletConnectSection.classList.add('d-none');
      userDashboard.classList.remove('d-none');
      
      // 连接Socket.io
      connectSocket();
      
      // 加载用户支付任务
      loadUserPaymentTasks();
      
      return true;
    } else {
      if (!autoConnect) {
        alert('请安装MetaMask钱包插件');
      }
      return false;
    }
  } catch (error) {
    console.error('连接钱包失败:', error);
    if (!autoConnect) {
      alert('连接钱包失败: ' + error.message);
    }
    return false;
  }
}

// 连接Socket.io
function connectSocket() {
  // 创建Socket连接
  socket = io();
  
  // 连接成功事件
  socket.on('connect', () => {
    console.log('Socket.io连接成功');
    
    // 发送钱包连接事件
    socket.emit('wallet_connect', {
      walletAddress,
      userType: 'user'
    });
  });
  
  // 监听LP已支付事件
  socket.on('payment_intent_lp_paid', (data) => {
    console.log('收到LP已支付通知:', data);
    
    // 更新任务状态
    updateTaskStatus(data.id, data.status);
    
    // 显示确认模态框
    showConfirmModal(data.id);
  });
  
  // 监听结算成功事件
  socket.on('settlement_success', (data) => {
    console.log('结算成功:', data);
    
    // 更新任务状态
    updateTaskStatus(data.paymentIntentId, 'settled');
    
    // 获取任务详情并显示成功界面
    fetch(`${API_BASE_URL}/payment-intent/${data.paymentIntentId}`)
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          const paymentIntent = result.data;
          // 显示交易成功界面
          showTransactionProcessingModal({
            status: 'success',
            message: '支付已成功结算',
            lpAddress: paymentIntent.lp.walletAddress,
            amount: paymentIntent.amount,
            txHash: data.txHash
          });
        }
      })
      .catch(error => {
        console.error('获取支付详情失败:', error);
        // 显示简化版成功界面
        showTransactionProcessingModal({
          status: 'success',
          message: '支付已成功结算',
          txHash: data.txHash
        });
      });
  });
  
  // 监听结算失败事件
  socket.on('settlement_failed', (data) => {
    console.log('结算失败:', data);
    
    // 显示失败界面
    showTransactionProcessingModal({
      status: 'error',
      message: `结算失败: ${data.error}`,
      paymentIntentId: data.paymentIntentId
    });
  });
  
  // 断开连接事件
  socket.on('disconnect', () => {
    console.log('Socket.io连接断开');
  });
}

// 处理二维码文件选择
function handleQrFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // 创建canvas用于解析二维码
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      context.drawImage(img, 0, 0, img.width, img.height);
      
      // 获取图像数据
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      
      // 使用jsQR解析二维码
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      if (code) {
        // 显示二维码内容
        qrContent.value = code.data;
        
        // 尝试识别支付平台
        identifyPaymentPlatform(code.data);
        
        // 显示支付表单
        paymentForm.classList.remove('d-none');
      } else {
        alert('无法识别二维码，请尝试其他图片');
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  
  // 重置文件输入，以便可以重新选择同一文件
  event.target.value = '';
}

// 识别支付平台
function identifyPaymentPlatform(content) {
  let platform = 'Unknown';
  
  // 简单的平台识别逻辑
  if (content.includes('paypal.com')) {
    platform = 'PayPal';
  } else if (content.includes('gcash.com') || content.includes('gcash.ph')) {
    platform = 'GCash';
  } else if (content.includes('alipay.com')) {
    platform = 'Alipay';
  } else if (content.includes('weixin.qq.com') || content.includes('wechat.com')) {
    platform = 'WeChat';
  } else {
    platform = 'Other';
  }
  
  paymentPlatform.value = platform;
  return platform;
}

// 创建支付意图
async function createPaymentIntent() {
  try {
    // 验证输入
    if (!qrContent.value) {
      alert('请先扫描二维码');
      return;
    }
    
    if (!paymentAmount.value || parseFloat(paymentAmount.value) <= 0) {
      alert('请输入有效的支付金额');
      return;
    }
    
    // 准备请求数据
    const data = {
      qrCodeContent: qrContent.value,
      amount: parseFloat(paymentAmount.value),
      description: paymentDescription.value,
      walletAddress
    };
    
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/payment-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // 重置表单
      paymentForm.classList.add('d-none');
      qrContent.value = '';
      paymentPlatform.value = '';
      paymentAmount.value = '';
      paymentDescription.value = '';
      
      // 显示成功消息
      alert('支付意图创建成功，等待LP接单');
      
      // 重新加载任务列表
      loadUserPaymentTasks();
    } else {
      alert('创建支付意图失败: ' + result.message);
    }
  } catch (error) {
    console.error('创建支付意图失败:', error);
    alert('创建支付意图失败: ' + error.message);
  }
}

// 加载用户支付任务
async function loadUserPaymentTasks() {
  try {
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/payment-intent/user/${walletAddress}`);
    const result = await response.json();
    
    if (result.success) {
      // 清空任务列表
      paymentTasksList.innerHTML = '';
      
      const tasks = result.data.paymentIntents;
      
      if (tasks.length === 0) {
        // 显示无任务消息
        noTasksMessage.classList.remove('d-none');
      } else {
        // 隐藏无任务消息
        noTasksMessage.classList.add('d-none');
        
        // 添加任务到列表
        tasks.forEach(task => {
          addTaskToList(task);
        });
      }
    } else {
      console.error('加载任务失败:', result.message);
    }
  } catch (error) {
    console.error('加载任务失败:', error);
  }
}

// 添加任务到列表
function addTaskToList(task) {
  const taskElement = document.createElement('div');
  taskElement.className = 'list-group-item';
  taskElement.id = `task-${task._id}`;
  
  // 获取状态标签样式
  const statusBadgeClass = getStatusBadgeClass(task.status);
  
  // 格式化创建时间
  const createdAt = new Date(task.createdAt).toLocaleString();
  
  taskElement.innerHTML = `
    <div class="d-flex w-100 justify-content-between">
      <h5 class="mb-1">${task.platform} 支付</h5>
      <small>${createdAt}</small>
    </div>
    <p class="mb-1">金额: ${task.amount} ${task.currency}</p>
    <p class="mb-1">描述: ${task.description || '无'}</p>
    <div class="d-flex justify-content-between align-items-center">
      <span class="badge ${statusBadgeClass}">${getStatusText(task.status)}</span>
      <div class="btn-group">
        ${task.status === 'lp_paid' ? `<button class="btn btn-sm btn-success confirm-btn" data-id="${task._id}" data-amount="${task.amount}">确认收到</button>` : ''}
        ${task.status === 'created' ? `<button class="btn btn-sm btn-danger cancel-btn" data-id="${task._id}">取消</button>` : ''}
      </div>
    </div>
  `;
  
  // 添加到列表
  paymentTasksList.appendChild(taskElement);
  
  // 添加确认按钮事件监听器
  const confirmBtn = taskElement.querySelector('.confirm-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      showConfirmModal(task._id, task.amount);
    });
  }
  
  // 添加取消按钮事件监听器
  const cancelBtn = taskElement.querySelector('.cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      cancelPaymentIntent(task._id);
    });
  }
}

// 获取状态标签样式
function getStatusBadgeClass(status) {
  switch (status) {
    case 'created':
      return 'bg-primary';
    case 'matched':
      return 'bg-info';
    case 'lp_paid':
      return 'bg-warning';
    case 'user_confirmed':
      return 'bg-info';
    case 'settled':
      return 'bg-success';
    case 'cancelled':
      return 'bg-danger';
    case 'expired':
      return 'bg-secondary';
    default:
      return 'bg-secondary';
  }
}

// 获取状态文本
function getStatusText(status) {
  switch (status) {
    case 'created':
      return '等待LP接单';
    case 'matched':
      return 'LP已接单';
    case 'lp_paid':
      return 'LP已支付';
    case 'user_confirmed':
      return '用户已确认';
    case 'settled':
      return '已结算';
    case 'cancelled':
      return '已取消';
    case 'expired':
      return '已过期';
    default:
      return status;
  }
}

// 更新任务状态
function updateTaskStatus(taskId, status) {
  const taskElement = document.getElementById(`task-${taskId}`);
  if (!taskElement) return;
  
  // 更新状态标签
  const statusBadge = taskElement.querySelector('.badge');
  statusBadge.className = `badge ${getStatusBadgeClass(status)}`;
  statusBadge.textContent = getStatusText(status);
  
  // 更新按钮
  const btnGroup = taskElement.querySelector('.btn-group');
  btnGroup.innerHTML = '';
  
  if (status === 'lp_paid') {
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-sm btn-success confirm-btn';
    confirmBtn.dataset.id = taskId;
    confirmBtn.textContent = '确认收到';
    confirmBtn.addEventListener('click', () => {
      showConfirmModal(taskId);
    });
    btnGroup.appendChild(confirmBtn);
  } else if (status === 'created') {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm btn-danger cancel-btn';
    cancelBtn.dataset.id = taskId;
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
      cancelPaymentIntent(taskId);
    });
    btnGroup.appendChild(cancelBtn);
  }
}

// 显示确认模态框
async function showConfirmModal(taskId, amount) {
  try {
    currentPaymentIntentId = taskId;
    
    // 如果没有提供金额，则从API获取任务详情
    if (!amount) {
      const response = await fetch(`${API_BASE_URL}/payment-intent/${taskId}`);
      const result = await response.json();
      
      if (result.success) {
        amount = result.data.amount;
      } else {
        throw new Error(result.message);
      }
    }
    
    // 设置确认金额
    confirmAmount.textContent = amount;
    
    // 显示模态框
    confirmPaymentModal.show();
  } catch (error) {
    console.error('获取任务详情失败:', error);
    alert('获取任务详情失败: ' + error.message);
  }
}

// 确认收到服务
async function confirmPaymentReceived() {
  try {
    if (!currentPaymentIntentId) {
      alert('无效的支付ID');
      return;
    }
    
    // 显示处理中提示
    confirmReceivedBtn.disabled = true;
    confirmReceivedBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 处理中...';
    
    // 获取支付意图详情
    const response = await fetch(`${API_BASE_URL}/payment-intent/${currentPaymentIntentId}`);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || '获取支付详情失败');
    }
    
    const paymentIntent = result.data;
    const lpWalletAddress = paymentIntent.lp.walletAddress;
    const amount = paymentIntent.amount;
    
    // 转换为USDT金额（6位小数）
    const usdtAmount = ethers.utils.parseUnits(amount.toString(), 6);
    
    try {
      // 1. 获取结算合约地址
      const contractResponse = await fetch(`${API_BASE_URL}/contract-info`);
      const contractResult = await contractResponse.json();
      
      if (!contractResult.success) {
        throw new Error('获取合约信息失败');
      }
      
      const contractAddress = contractResult.data.contractAddress;
      const usdtAddress = contractResult.data.usdtAddress;
      
      // 2. 创建USDT合约实例
      const usdtContract = new ethers.Contract(
        usdtAddress,
        [
          'function approve(address spender, uint256 amount) returns (bool)'
        ],
        signer
      );
      
      // 3. 授权结算合约转移用户的USDT
      const approveTx = await usdtContract.approve(contractAddress, usdtAmount);
      
      // 显示授权中提示
      confirmReceivedBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 授权中...';
      
      // 等待授权交易确认
      const approveReceipt = await approveTx.wait();
      console.log('授权成功，交易哈希:', approveReceipt.transactionHash);
      
      // 4. 准备请求数据
      const data = {
        walletAddress,
        txHash: approveReceipt.transactionHash
      };
      
      // 显示确认中提示
      confirmReceivedBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 确认中...';
      
      // 5. 发送确认请求
      const confirmResponse = await fetch(`${API_BASE_URL}/payment-intent/${currentPaymentIntentId}/confirm`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      const confirmResult = await confirmResponse.json();
      
      if (confirmResult.success) {
        // 关闭模态框
        confirmPaymentModal.hide();
        
        // 更新任务状态
        updateTaskStatus(currentPaymentIntentId, 'user_confirmed');
        
        // 显示成功消息
        showTransactionProcessingModal({
          status: 'processing',
          message: '确认成功，正在进行链上结算',
          lpAddress: lpWalletAddress,
          amount: amount
        });
      } else {
        throw new Error(confirmResult.message || '确认失败');
      }
    } catch (txError) {
      console.error('交易失败:', txError);
      alert('交易失败: ' + (txError.message || '未知错误'));
    }
  } catch (error) {
    console.error('确认失败:', error);
    alert('确认失败: ' + (error.message || '未知错误'));
  } finally {
    // 恢复按钮状态
    confirmReceivedBtn.disabled = false;
    confirmReceivedBtn.textContent = '确认收到';
    currentPaymentIntentId = null;
  }
}

// 取消支付意图
async function cancelPaymentIntent(taskId) {
  try {
    if (!confirm('确定要取消此支付任务吗？')) {
      return;
    }
    
    // 准备请求数据
    const data = {
      walletAddress,
      reason: '用户主动取消'
    };
    
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/payment-intent/${taskId}/cancel`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // 更新任务状态
      updateTaskStatus(taskId, 'cancelled');
      
      // 显示成功消息
      alert('支付任务已取消');
    } else {
      alert('取消失败: ' + result.message);
    }
  } catch (error) {
    console.error('取消失败:', error);
    alert('取消失败: ' + error.message);
  }
}

// 显示交易处理模态框
function showTransactionProcessingModal(data) {
  const modal = document.getElementById('transaction-status-modal');
  const statusProcessing = document.getElementById('status-processing');
  const statusSuccess = document.getElementById('status-success');
  const statusError = document.getElementById('status-error');
  const txLpAddress = document.getElementById('tx-lp-address');
  const txAmount = document.getElementById('tx-amount');
  const txHashContainer = document.getElementById('tx-hash-container');
  const txHash = document.getElementById('tx-hash');
  const viewExplorerBtn = document.getElementById('view-explorer-btn');
  const closeBtn = document.querySelector('.close-transaction');
  const closeTransactionBtn = document.getElementById('close-transaction-btn');
  
  // 重置所有状态
  statusProcessing.style.display = 'none';
  statusSuccess.style.display = 'none';
  statusError.style.display = 'none';
  txHashContainer.style.display = 'none';
  viewExplorerBtn.style.display = 'none';
  
  // 设置LP地址和金额
  if (data.lpAddress) {
    txLpAddress.textContent = data.lpAddress;
  } else {
    txLpAddress.textContent = '未知';
  }
  
  if (data.amount) {
    txAmount.textContent = `${data.amount} USDT`;
  } else {
    txAmount.textContent = '未知';
  }
  
  // 根据状态显示不同内容
  if (data.status === 'processing') {
    statusProcessing.style.display = 'block';
  } else if (data.status === 'success') {
    statusSuccess.style.display = 'block';
    
    // 显示交易哈希
    if (data.txHash) {
      txHashContainer.style.display = 'flex';
      txHash.textContent = data.txHash;
      
      // 设置区块浏览器链接
      const explorerUrl = `https://goerli.etherscan.io/tx/${data.txHash}`;
      viewExplorerBtn.href = explorerUrl;
      viewExplorerBtn.style.display = 'inline-block';
    }
  } else if (data.status === 'error') {
    statusError.style.display = 'block';
  }
  
  // 显示模态框
  modal.style.display = 'block';
  
  // 关闭按钮事件
  closeBtn.onclick = function() {
    modal.style.display = 'none';
  };
  
  closeTransactionBtn.onclick = function() {
    modal.style.display = 'none';
  };
  
  // 点击模态框外部关闭
  window.onclick = function(event) {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  };
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', initApp);