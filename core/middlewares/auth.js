const { verifyToken } = require('../utils/security');
const { error } = require('../utils/response');
const { db } = require('../db/storage');
const config = require('../config');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, 'Authorization header missing or invalid format', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyToken(token, config.jwtSecret);
    const user = db.findById('users', payload.userId);
    if (!user) {
      return error(res, 'User referenced in token no longer exists', 401);
    }
    // 隐藏敏感字段
    const { password, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch (err) {
    return error(res, `Authentication failed: ${err.message}`, 401);
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, 'Unauthenticated', 401);
    }
    if (!allowedRoles.includes(req.user.role)) {
      return error(res, `Forbidden: Required role [${allowedRoles.join(', ')}]`, 403);
    }
    next();
  };
}

function requireShopOwner(shopIdExtractor) {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, 'Unauthenticated', 401);
    }
    if (req.user.role === 'admin') {
      return next(); // 管理员跳过店铺归属限制
    }

    const shopId = shopIdExtractor ? shopIdExtractor(req) : (req.params.shopId || req.params.id);
    if (!shopId) {
      return error(res, 'Shop ID is required for verification', 400);
    }

    const shop = db.findById('shops', shopId);
    if (!shop) {
      return error(res, 'Shop not found', 404);
    }

    if (shop.ownerId !== req.user.id) {
      return error(res, 'Forbidden: You are not the owner of this shop', 403);
    }

    req.targetShop = shop;
    next();
  };
}

module.exports = {
  authenticate,
  requireRole,
  requireShopOwner
};
