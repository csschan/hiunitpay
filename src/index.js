require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// 导入路由
const apiRoutes = require('./routes/api.routes');

// 导入结算服务
const SettlementService = require('./services/settlement.service');

// 初始化Express应用
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));

// 简单的内存队列（实际项目中应使用Redis等消息队列）
class SettlementQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.settlementService = new SettlementService();
  }
  
  add(task) {
    this.queue.push(task);
    if (!this.processing) {
      this.process();
    }
  }
  
  async process() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }
    
    this.processing = true;
    const task = this.queue.shift();
    
    try {
      const result = await this.settlementService.processSettlement(task);
      
      // 通知结果
      if (result.success) {
        io.emit('settlement_success', {
          paymentIntentId: result.paymentIntentId,
          txHash: result.txHash
        });
      } else {
        io.emit('settlement_failed', {
          paymentIntentId: result.paymentIntentId,
          error: result.error
        });
      }
    } catch (error) {
      console.error('处理结算任务失败:', error);
      io.emit('settlement_failed', {
        paymentIntentId: task.paymentIntentId,
        error: error.message
      });
    }
    
    // 处理下一个任务
    this.process();
  }
}

// 初始化结算队列
const settlementQueue = new SettlementQueue();

// 将Socket.io和结算队列添加到请求对象
app.use((req, res, next) => {
  req.io = io;
  req.settlementQueue = settlementQueue;
  next();
});

// 路由
app.use('/api', apiRoutes);

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '请求的资源不存在'
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 连接数据库
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => {
    console.log('数据库连接成功');
    
    // 启动服务器
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`服务器运行在端口 ${PORT}`);
    });
  })
  .catch(err => {
    console.error('数据库连接失败:', err);
    process.exit(1);
  });

// Socket.io连接处理
io.on('connection', (socket) => {
  console.log('新的Socket连接:', socket.id);
  
  // 监听钱包连接事件
  socket.on('wallet_connect', (data) => {
    const { walletAddress, userType } = data;
    
    // 将socket加入对应的房间
    socket.join(walletAddress);
    socket.join(userType === 'lp' ? 'lp_room' : 'user_room');
    
    console.log(`${userType === 'lp' ? 'LP' : '用户'} ${walletAddress} 已连接`);
  });
  
  // 监听断开连接事件
  socket.on('disconnect', () => {
    console.log('Socket断开连接:', socket.id);
  });
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('正在关闭服务器...');
  
  // 关闭HTTP服务器
  server.close(() => {
    console.log('HTTP服务器已关闭');
    
    // 关闭数据库连接
    mongoose.connection.close(false, () => {
      console.log('数据库连接已关闭');
      process.exit(0);
    });
  });
});