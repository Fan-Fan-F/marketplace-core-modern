const path = require('path');

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  jwtSecret: process.env.JWT_SECRET || '<your-jwt-secret>',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  dataPath: process.env.DATA_PATH || path.join(__dirname, '../../.data'),
  platform: {
    name: 'Marketplace Core Modern',
    defaultCommissionRate: 0.10, // 默认 10% 平台抽成
    defaultFixedFee: 0.50,        // 默认 0.50 元固定交易费
    escrowHoldHours: 24,         // 默认 24 小时防退款争议锁定期
  }
};

module.exports = config;
