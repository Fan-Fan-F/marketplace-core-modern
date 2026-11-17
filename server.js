const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./core/config');
const { db } = require('./core/db/storage');
const { seedDatabaseIfEmpty } = require('./core/db/seed');

const authRoutes = require('./modules/auth/authRoutes');
const shopRoutes = require('./modules/shop/shopRoutes');
const productRoutes = require('./modules/product/productRoutes');
const orderRoutes = require('./modules/order/orderRoutes');
const settlementRoutes = require('./modules/settlement/settlementRoutes');

const app = express();

// 基础中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态前端演示资源
app.use(express.static(path.join(__dirname, 'public')));

// 自动种子数据填充（首次冷启动时）
seedDatabaseIfEmpty();

// 路由挂载
app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/settlements', settlementRoutes);

// 系统健康检查与运行概览
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'marketplace-core-modern',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    stats: {
      users: db.count('users'),
      shops: db.count('shops'),
      products: db.count('products'),
      orders: db.count('orders'),
      subOrders: db.count('sub_orders'),
      settlementStatements: db.count('settlement_statements')
    }
  });
});

// 全局 404 处理
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.method} ${req.originalUrl} not found`
  });
});

// 默认 SPA 首页兜底
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 全局异常捕获中间件
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error occurred',
    error: config.env === 'development' ? err.message : undefined
  });
});

if (require.main === module) {
  const server = app.listen(config.port, () => {
    console.log(`=======================================================`);
    console.log(` Marketplace Core Modern (Multi-Vendor Platform)`);
    console.log(` Server running on http://localhost:${config.port}`);
    console.log(` Settlement & Split Billing Engine active`);
    console.log(` Environment: ${config.env}`);
    console.log(`=======================================================`);
  });

  const shutdown = () => {
    console.log('Shutting down server gracefully...');
    server.close(() => {
      console.log('Server terminated.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app;
