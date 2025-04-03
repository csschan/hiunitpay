/**
 * Link Card LP前端应用
 * 实现LP注册、额度管理和接单功能
 */

// 全局变量
let walletAddress = '';
let provider = null;
let signer = null;
let socket = null;
let lpInfo = null;
let currentTaskId = null;

// DOM元素
const connectWalletBtn = document.getElementById('connect-wallet-btn');
const walletConnectSection = document.getElementById('wallet-connect-section');
const lpRegister = document.getElementById('lp-register');
const lpDashboard = document.getElementById('lp-dashboard');
const walletAddressInput = document.getElementById('wallet-address');
const lpWalletAddressSpan = document.getElementById('lp-wallet-address');
const registerForm = document.getElementById('register-form');
const updateQuotaForm = document.getElementById('update-quota-form');
const updateQuotaBtn = document.getElementById('update-quota-btn');
const refreshTaskPoolBtn = document.getElementById('refresh-task-pool-btn');
const applyFilterBtn = document.getElementById('apply-filter-btn');
const taskPoolList = document.getElementById('task-pool-list');
const pendingTasksList = document.getElementById('pending-tasks-list');
const completedTasksList = document.getElementById('completed-tasks-list');
const noTasksMessage = document.getElementById('no-tasks-message');
const noPendingTasksMessage = document.getElementById('no-pending-tasks-message');
const noCompletedTasksMessage = document.getElementById('no-completed-tasks-message');

// API基础URL
const API_BASE_URL = '/api';

// 初始化应用
async function initApp() {
  // 检查是否已连接钱包
  const savedWalletAddress = localStorage.getItem('lpWalletAddress');
  if (savedWalletAddress) {
    try {
      await connectWallet(true);
    } catch (error) {
      console.error('自动连接钱包失败:', error);
      localStorage.removeItem('lpWalletAddress');
    }
  }
  
  // 初始化事件监听器
  initEventListeners();
}

// 初始化事件监听器
function initEventListeners() {
  // 连接钱包按钮
  connectWalletBtn.addEventListener('click', () => connectWallet());
  
  // 注册表单提交
  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    registerLP();
  });
  
  // 更新额度按钮
  updateQuotaBtn.addEventListener('click', updateQuota);
  
  // 刷新任务池按钮
  refreshTaskPoolBtn.addEventListener('click', loadTaskPool);
  
  // 应用筛选按钮
  applyFilterBtn.addEventListener('click', () => {
    const filterModal = bootstrap.Modal.getInstance(document.getElementById('filter-modal'));
    filterModal.hide();
    loadTaskPool();
  });
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
      localStorage.setItem('lpWalletAddress', walletAddress);
      
      // 更新UI
      walletAddressInput.value = walletAddress;
      lpWalletAddressSpan.textContent = walletAddress;
      walletConnectSection.classList.add('d-none');
      
      // 检查LP是否已注册
      await checkLPRegistration();
      
      // 连接Socket.io
      connectSocket();
      
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

// 检查LP是否已注册
async function checkLPRegistration() {
  try {
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/lp/${walletAddress}`);
    const result = await response.json();
    
    if (result.success) {
      // LP已注册
      lpInfo = result.data;
      
      // 显示LP仪表板
      lpRegister.classList.add('d-none');
      lpDashboard.classList.remove('d-none');
      
      // 更新LP信息
      updateLPInfo();
      
      // 加载任务池和LP任务
      loadTaskPool();
      loadLPTasks();
    } else {
      // LP未注册
      lpRegister.classList.remove('d-none');
      lpDashboard.classList.add('d-none');
    }
  } catch (error) {
    console.error('检查LP注册失败:', error);
    
    // 假设未注册
    lpRegister.classList.remove('d-none');
    lpDashboard.classList.add('d-none');
  }
}

// 更新LP信息
function updateLPInfo() {
  if (!lpInfo) return;
  
  // 更新额度信息
  document.getElementById('lp-total-quota').textContent = lpInfo.quota.total;
  document.getElementById('lp-available-quota').textContent = lpInfo.quota.available;
  document.getElementById('lp-locked-quota').textContent = lpInfo.quota.locked;
  document.getElementById('lp-per-transaction-quota').textContent = lpInfo.quota.perTransaction;
  
  // 更新交易统计
  document.getElementById('lp-total-transactions').textContent = lpInfo.stats.totalTransactions;
  document.getElementById('lp-total-amount').textContent = lpInfo.stats.totalAmount;
  document.getElementById('lp-successful-transactions').textContent = lpInfo.stats.successfulTransactions;
  document.getElementById('lp-failed-transactions').textContent = lpInfo.stats.failedTransactions;
  
  // 更新评分
  document.getElementById('lp-rating').textContent = lpInfo.rating;
  
  // 更新更新额度表单
  document.getElementById('update-total-quota').value = lpInfo.quota.total;
  document.getElementById('update-per-transaction-quota').value = lpInfo.quota.perTransaction;
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
      userType: 'lp'
    });
  });
  
  // 监听新支付意图事件
  socket.on('new_payment_intent', (data) => {
    console.log('收到新支付意图通知:', data);
    
    // 刷新任务池
    loadTaskPool();
  });
  
  // 监听用户确认事件
  socket.on('payment_intent_confirmed', (data) => {
    console.log('收到用户确认通知:', data);
    
    // 更新任务状态
    updateTaskStatus(data.id, data.status);
  });
  
  // 监听结算成功事件
  socket.on('settlement_success', (data) => {
    console.log('结算成功:', data);
    
    // 更新任务状态
    updateTaskStatus(data.paymentIntentId, 'settled');
    
    // 刷新LP信息
    checkLPRegistration();
  });
  
  // 断开连接事件
  socket.on('disconnect', () => {
    console.log('Socket.io连接断开');
  });
}

// 注册LP
async function registerLP() {
  try {
    // 获取表单数据
    const name = document.getElementById('lp-name').value;
    const email = document.getElementById('lp-email').value;
    const totalQuota = document.getElementById('total-quota').value;
    const perTransactionQuota = document.getElementById('per-transaction-quota').value;
    
    // 获取支持的平台
    const supportedPlatforms = [];
    if (document.getElementById('platform-paypal').checked) supportedPlatforms.push('PayPal');
    if (document.getElementById('platform-gcash').checked) supportedPlatforms.push('GCash');
    if (document.getElementById('platform-alipay').checked) supportedPlatforms.push('Alipay');
    if (document.getElementById('platform-wechat').checked) supportedPlatforms.push('WeChat');
    if (document.getElementById('platform-other').checked) supportedPlatforms.push('Other');
    
    // 验证输入
    if (!totalQuota || parseFloat(totalQuota) <= 0) {
      alert('请输入有效的总额度');
      return;
    }
    
    if (!perTransactionQuota || parseFloat(perTransactionQuota) <= 0) {
      alert('请输入有效的单笔额度上限');
      return;
    }
    
    if (parseFloat(perTransactionQuota) > parseFloat(totalQuota)) {
      alert('单笔额度上限不能大于总额度');
      return;
    }
    
    if (supportedPlatforms.length === 0) {
      alert('请至少选择一个支持的支付平台');
      return;
    }
    
    // 准备请求数据
    const data = {
      walletAddress,
      name,
      email,
      supportedPlatforms,
      totalQuota: parseFloat(totalQuota),
      perTransactionQuota: parseFloat(perTransactionQuota)
    };
    
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/lp/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // 注册成功
      alert('LP注册成功');
      
      // 检查LP注册状态
      await checkLPRegistration();
    } else {
      alert('LP注册失败: ' + result.message);
    }
  } catch (error) {
    console.error('LP注册失败:', error);
    alert('LP注册失败: ' + error.message);
  }
}

// 更新额度
async function updateQuota() {
  try {
    // 获取表单数据
    const totalQuota = document.getElementById('update-total-quota').value;
    const perTransactionQuota = document.getElementById('update-per-transaction-quota').value;
    
    // 验证输入
    if ((!totalQuota || totalQuota === '') && (!perTransactionQuota || perTransactionQuota === '')) {
      alert('请至少输入一项要更新的额度');
      return;
    }
    
    if (totalQuota && parseFloat(totalQuota) < 0) {
      alert('总额度不能为负数');
      return;
    }
    
    if (perTransactionQuota && parseFloat(perTransactionQuota) < 0) {
      alert('单笔额度上限不能为负数');
      return;
    }
    
    if (totalQuota && perTransactionQuota && parseFloat(perTransactionQuota) > parseFloat(totalQuota)) {
      alert('单笔额度上限不能大于总额度');
      return;
    }
    
    // 准备请求数据
    const data = {
      walletAddress
    };
    
    if (totalQuota && totalQuota !== '') {
      data.totalQuota = parseFloat(totalQuota);
    }
    
    if (perTransactionQuota && perTransactionQuota !== '') {
      data.perTransactionQuota = parseFloat(perTransactionQuota);
    }
    
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/lp/quota`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // 更新成功
      alert('额度更新成功');
      
      // 关闭模态框
      const modal = bootstrap.Modal.getInstance(document.getElementById('update-quota-modal'));
      modal.hide();
      
      // 刷新LP信息
      await checkLPRegistration();
    } else {
      alert('额度更新失败: ' + result.message);
    }
  } catch (error) {
    console.error('更新额度失败:', error);
    alert('更新额度失败: ' + error.message);
  }
}

// 加载任务池
async function loadTaskPool() {
  try {
    // 获取筛选条件
    const platform = document.getElementById('filter-platform').value;
    const minAmount = document.getElementById('filter-min-amount').value;
    const maxAmount = document.getElementById('filter-max-amount').value;
    
    // 构建查询参数
    let queryParams = '';
    if (platform) queryParams += `platform=${platform}&`;
    if (minAmount) queryParams += `minAmount=${minAmount}&`;
    if (maxAmount) queryParams += `maxAmount=${maxAmount}&`;
    
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/lp/task-pool?${queryParams}`);
    const result = await response.json();
    
    if (result.success) {
      // 清空任务池列表
      taskPoolList.innerHTML = '';
      
      const tasks = result.data.tasks;
      
      if (tasks.length === 0) {
        // 显示无任务消息
        noTasksMessage.classList.remove('d-none');
      } else {
        // 隐藏无任务消息
        noTasksMessage.classList.add('d-none');
        
        // 添加任务到列表
        tasks.forEach(task => {
          addTaskToPool(task);
        });
      }
    } else {
      console.error('加载任务池失败:', result.message);
    }
  } catch (error) {
    console.error('加载任务池失败:', error);
  }
}

// 加载LP任务
async function loadLPTasks() {
  try {
    // 发送请求获取LP的所有任务
    const response = await fetch(`${API_BASE_URL}/payment-intent/lp/${walletAddress}`);
    const result = await response.json();
    
    if (result.success) {
      // 清空任务列表
      pendingTasksList.innerHTML = '';
      completedTasksList.innerHTML = '';
      
      const tasks = result.data.paymentIntents;
      const pendingTasks = [];
      const completedTasks = [];
      
      // 分类任务
      tasks.forEach(task => {
        if (task.status === 'matched') {
          pendingTasks.push(task);
        } else {
          completedTasks.push(task);
        }
      });
      
      // 处理待支付任务
      if (pendingTasks.length === 0) {
        // 显示无任务消息
        noPendingTasksMessage.classList.remove('d-none');
      } else {
        // 隐藏无任务消息
        noPendingTasksMessage.classList.add('d-none');
        
        // 添加任务到列表
        pendingTasks.forEach(task => {
          addTaskToLPList(task, pendingTasksList);
        });
      }
      
      // 处理已完成任务
      if (completedTasks.length === 0) {
        // 显示无任务消息
        noCompletedTasksMessage.classList.remove('d-none');
      } else {
        // 隐藏无任务消息
        noCompletedTasksMessage.classList.add('d-none');
        
        // 添加任务到列表
        completedTasks.forEach(task => {
          addTaskToLPList(task, completedTasksList);
        });
      }
    } else {
      console.error('加载LP任务失败:', result.message);
    }
  } catch (error) {
    console.error('加载LP任务失败:', error);
  }
}

// 添加任务到任务池
function addTaskToPool(task) {
  const taskElement = document.createElement('div');
  taskElement.className = 'list-group-item';
  taskElement.id = `pool-task-${task._id}`;
  
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
      <button class="btn btn-sm btn-success claim-btn" data-id="${task._id}">接单</button>
    </div>
  `;
  
  // 添加到列表
  taskPoolList.appendChild(taskElement);
  
  // 添加接单按钮事件监听器
  const claimBtn = taskElement.querySelector('.claim-btn');
  claimBtn.addEventListener('click', () => {
    claimTask(task._id);
  });
}

// 添加任务到LP任务列表
function addTaskToLPList(task, listElement) {
  const taskElement = document.createElement('div');
  taskElement.className = 'list-group-item';
  taskElement.id = `lp-task-${task._id}`;
  
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
        ${task.status === 'matched' ? `<button class="btn btn-sm btn-success mark-paid-btn" data-id="${task._id}">标记已支付</button>` : ''}
      </div>
    </div>
  `;
  
  // 添加到列表
  listElement.appendChild(taskElement);
  
  // 添加标记已支付按钮事件监听器
  const markPaidBtn = taskElement.querySelector('.mark-paid-btn');
  if (markPaidBtn) {
    markPaidBtn.addEventListener('click', () => {
      markTaskPaid(task._id);
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
  // 更新LP任务列表中的任务状态
  const taskElement = document.getElementById(`lp-task-${taskId}`);
  if (taskElement) {
    // 更新状态标签
    const statusBadge = taskElement.querySelector('.badge');
    statusBadge.className = `badge ${getStatusBadgeClass(status)}`;
    statusBadge.textContent = getStatusText(status);
    
    // 更新按钮
    const btnGroup = taskElement.querySelector('.btn-group');
    btnGroup.innerHTML = '';
    
    if (status === 'matched') {
      const markPaidBtn = document.createElement('button');
      markPaidBtn.className = 'btn btn-sm btn-success mark-paid-btn';
      markPaidBtn.dataset.id = taskId;
      markPaidBtn.textContent = '标记已支付';
      markPaidBtn.addEventListener('click', () => {
        markTaskPaid(taskId);
      });
      btnGroup.appendChild(markPaidBtn);
    }
    
    // 如果状态变为已完成，移动任务到已完成列表
    if (status === 'user_confirmed' || status === 'settled') {
      const parentElement = taskElement.parentElement;
      if (parentElement === pendingTasksList) {
        pendingTasksList.removeChild(taskElement);
        completedTasksList.appendChild(taskElement);
        
        // 检查待支付列表是否为空
        if (pendingTasksList.children.length === 0) {
          noPendingTasksMessage.classList.remove('d-none');
        }
        
        // 隐藏已完成列表的无任务消息
        noCompletedTasksMessage.classList.add('d-none');
      }
    }
  }
  
  // 从任务池中移除已接单的任务
  const poolTaskElement = document.getElementById(`pool-task-${taskId}`);
  if (poolTaskElement && status !== 'created') {
    poolTaskElement.remove();
    
    // 检查任务池是否为空
    if (taskPoolList.children.length === 0) {
      noTasksMessage.classList.remove('d-none');
    }
  }
}

// 接单
async function claimTask(taskId) {
  try {
    // 准备请求数据
    const data = {
      walletAddress
    };
    
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/lp/task/${taskId}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // 接单成功
      alert('接单成功');
      
      // 从任务池中移除任务
      const taskElement = document.getElementById(`pool-task-${taskId}`);
      if (taskElement) {
        taskElement.remove();
      }
      
      // 刷新LP信息和任务列表
      await checkLPRegistration();
      await loadLPTasks();
    } else {
      alert('接单失败: ' + result.message);
    }
  } catch (error) {
    console.error('接单失败:', error);
    alert('接单失败: ' + error.message);
  }
}

// 标记任务已支付
async function markTaskPaid(taskId) {
  try {
    // 准备请求数据
    const data = {
      walletAddress,
      note: '已完成支付'
    };
    
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/lp/task/${taskId}/mark-paid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // 标记成功
      alert('标记支付成功，等待用户确认');
      
      // 更新任务状态
      updateTaskStatus(taskId, 'lp_paid');
    } else {
      alert('标记支付失败: ' + result.message);
    }
  } catch (error) {
    console.error('标记支付失败:', error);
    alert('标记支付失败: ' + error.message);
  }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', initApp);