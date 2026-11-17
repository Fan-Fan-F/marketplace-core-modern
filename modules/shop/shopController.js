const { db } = require('../../core/db/storage');
const { success, error } = require('../../core/utils/response');
const { settlementEngine } = require('../settlement/settlementController');

class ShopController {
  createShop(req, res) {
    try {
      const { name, description = '', logoUrl = '', payoutAccount = '', customCommissionRate = null } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return error(res, 'Shop name is required', 400);
      }

      const existing = db.findOne('shops', { name: name.trim() });
      if (existing) {
        return error(res, 'A shop with this name already exists', 409);
      }

      // 如果创建者不是卖家角色，自动晋升为卖家
      if (req.user.role === 'buyer') {
        db.updateById('users', req.user.id, { role: 'seller', isSeller: true });
      }

      const shop = db.insert('shops', {
        name: name.trim(),
        description: description.trim(),
        logoUrl: logoUrl.trim(),
        ownerId: req.user.id,
        ownerName: req.user.name,
        status: 'active',
        payoutAccount: payoutAccount || `BANK-ACCT-${req.user.id.slice(0, 6)}`,
        customCommissionRate: typeof customCommissionRate === 'number' ? customCommissionRate : null
      });

      return success(res, shop, 'Shop created successfully', 201);
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  listShops(req, res) {
    try {
      const { status = 'active', search } = req.query;
      let shops = db.find('shops', doc => {
        if (status && doc.status !== status) return false;
        if (search) {
          const match = doc.name.toLowerCase().includes(search.toLowerCase()) ||
            (doc.description && doc.description.toLowerCase().includes(search.toLowerCase()));
          if (!match) return false;
        }
        return true;
      });

      // 附加每个店铺的在售商品数
      const enriched = shops.map(shop => {
        const productCount = db.count('products', { shopId: shop.id, status: 'active' });
        return {
          ...shop,
          productCount
        };
      });

      return success(res, enriched, 'Shops list retrieved');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  getShopById(req, res) {
    try {
      const shop = db.findById('shops', req.params.id);
      if (!shop) {
        return error(res, 'Shop not found', 404);
      }

      const products = db.find('products', { shopId: shop.id });
      const responseData = {
        ...shop,
        products
      };

      return success(res, responseData, 'Shop retrieved');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  updateShop(req, res) {
    try {
      const shopId = req.params.id;
      const { name, description, logoUrl, payoutAccount, customCommissionRate, status } = req.body;

      const updates = {};
      if (name) updates.name = name.trim();
      if (description !== undefined) updates.description = description;
      if (logoUrl !== undefined) updates.logoUrl = logoUrl;
      if (payoutAccount !== undefined) updates.payoutAccount = payoutAccount;
      if (customCommissionRate !== undefined) updates.customCommissionRate = customCommissionRate;
      if (status && req.user.role === 'admin') updates.status = status;

      const updated = db.updateById('shops', shopId, updates);
      return success(res, updated, 'Shop updated successfully');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  getShopMetrics(req, res) {
    try {
      const shopId = req.params.id;
      const shop = db.findById('shops', shopId);
      if (!shop) {
        return error(res, 'Shop not found', 404);
      }

      const productsCount = db.count('products', { shopId });
      const subOrders = db.find('sub_orders', { shopId });
      const settlement = settlementEngine.getShopSummary(shopId);

      const metrics = {
        shopId,
        shopName: shop.name,
        productsCount,
        subOrdersCount: subOrders.length,
        settlementSummary: settlement.metrics
      };

      return success(res, metrics, 'Shop metrics retrieved');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }
}

module.exports = new ShopController();
