const crypto = require('crypto');
const { db } = require('../../core/db/storage');
const { success, error } = require('../../core/utils/response');
const { settlementEngine } = require('../settlement/settlementController');

class OrderController {
  /**
   * 跨店铺联合结算下单与自动拆单
   */
  checkout(req, res) {
    try {
      const { items, shippingAddress = {}, paymentMethod = 'simulated_instant' } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return error(res, 'Items array cannot be empty', 400);
      }

      if (!shippingAddress.recipientName || !shippingAddress.addressLine) {
        return error(res, 'shippingAddress (recipientName, addressLine) is required', 400);
      }

      // 1. 验证所有商品并检查库存
      const validatedItems = [];
      const shopMap = new Map();

      for (const reqItem of items) {
        const product = db.findById('products', reqItem.productId);
        if (!product || product.status !== 'active') {
          return error(res, `Product ${reqItem.productId} is not available`, 400);
        }

        const qty = parseInt(reqItem.quantity, 10);
        if (isNaN(qty) || qty <= 0) {
          return error(res, `Invalid quantity for product ${product.name}`, 400);
        }

        if (product.stock < qty) {
          return error(res, `Insufficient stock for "${product.name}". Available: ${product.stock}, requested: ${qty}`, 400);
        }

        const shop = db.findById('shops', product.shopId);
        if (!shop || shop.status !== 'active') {
          return error(res, `Shop for product "${product.name}" is currently inactive`, 400);
        }

        shopMap.set(shop.id, shop);

        validatedItems.push({
          product,
          quantity: qty,
          shopId: shop.id,
          unitPrice: product.price,
          subtotal: Math.round(product.price * qty * 100) / 100
        });
      }

      // 2. 扣减商品库存（防超卖）
      for (const item of validatedItems) {
        const currentStock = item.product.stock;
        db.updateById('products', item.product.id, {
          stock: currentStock - item.quantity
        });
      }

      // 3. 生成主订单 ID
      const masterOrderId = `ORD-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      let grandTotal = 0;
      const createdSubOrders = [];
      const createdStatements = [];

      // 4. 按店铺分组并拆分子订单
      const itemsByShop = {};
      for (const item of validatedItems) {
        if (!itemsByShop[item.shopId]) {
          itemsByShop[item.shopId] = [];
        }
        itemsByShop[item.shopId].push(item);
      }

      for (const [shopId, shopItems] of Object.entries(itemsByShop)) {
        const shop = shopMap.get(shopId);
        const shopTotal = shopItems.reduce((sum, it) => sum + it.subtotal, 0);
        const roundedShopTotal = Math.round(shopTotal * 100) / 100;
        grandTotal += roundedShopTotal;

        const subOrderId = `SUB-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

        const subOrderData = {
          id: subOrderId,
          masterOrderId,
          shopId: shop.id,
          shopName: shop.name,
          sellerId: shop.ownerId,
          buyerId: req.user.id,
          buyerName: req.user.name,
          status: 'paid', // 模拟支付成功
          totalAmount: roundedShopTotal,
          items: shopItems.map(it => ({
            productId: it.product.id,
            productName: it.product.name,
            imageUrl: it.product.imageUrl,
            price: it.unitPrice,
            quantity: it.quantity,
            subtotal: it.subtotal
          })),
          shippingAddress,
          paymentMethod,
          fulfillment: {
            carrier: null,
            trackingNumber: null,
            shippedAt: null,
            deliveredAt: null
          }
        };

        const savedSubOrder = db.insert('sub_orders', subOrderData);
        createdSubOrders.push(savedSubOrder);

        // 5. 核心联动：自动调用结算分账引擎计提预结算流水
        const statement = settlementEngine.accrueSubOrder(savedSubOrder, shop);
        createdStatements.push(statement);
      }

      // 6. 持久化主订单
      const masterOrder = db.insert('orders', {
        id: masterOrderId,
        buyerId: req.user.id,
        buyerName: req.user.name,
        totalAmount: Math.round(grandTotal * 100) / 100,
        subOrderIds: createdSubOrders.map(s => s.id),
        status: 'paid',
        paymentMethod,
        shippingAddress
      });

      return success(res, {
        masterOrder,
        subOrders: createdSubOrders,
        settlements: createdStatements
      }, 'Order placed, split by vendor and pre-settlement accrued successfully', 201);
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  /**
   * 买家查询我的历史订单
   */
  getMyOrders(req, res) {
    try {
      const orders = db.find('orders', { buyerId: req.user.id });
      const enriched = orders.map(ord => {
        const subOrders = db.find('sub_orders', { masterOrderId: ord.id });
        return {
          ...ord,
          subOrders
        };
      });

      return success(res, enriched.reverse(), 'Buyer orders retrieved');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  /**
   * 卖家查询自己店铺名下的子订单列表
   */
  getShopSubOrders(req, res) {
    try {
      const shopId = req.params.shopId;
      const { status } = req.query;

      let subOrders = db.find('sub_orders', doc => {
        if (doc.shopId !== shopId) return false;
        if (status && doc.status !== status) return false;
        return true;
      });

      // 关联结算单状态
      const enriched = subOrders.map(sub => {
        const statement = db.findOne('settlement_statements', { subOrderId: sub.id });
        return {
          ...sub,
          settlement: statement ? {
            id: statement.id,
            status: statement.status,
            grossAmount: statement.grossAmount,
            platformFee: statement.platformFee,
            sellerNetAmount: statement.sellerNetAmount
          } : null
        };
      });

      return success(res, enriched.reverse(), 'Shop sub-orders retrieved');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  /**
   * 卖家发货履约
   */
  shipSubOrder(req, res) {
    try {
      const subOrderId = req.params.id;
      const { carrier = 'SF Express', trackingNumber } = req.body;

      if (!trackingNumber) {
        return error(res, 'trackingNumber is required to fulfill the sub-order', 400);
      }

      const subOrder = db.findById('sub_orders', subOrderId);
      if (!subOrder) {
        return error(res, 'Sub-order not found', 404);
      }

      const shop = db.findById('shops', subOrder.shopId);
      if (shop && shop.ownerId !== req.user.id && req.user.role !== 'admin') {
        return error(res, 'Forbidden: You do not own the shop for this order', 403);
      }

      if (subOrder.status !== 'paid' && subOrder.status !== 'processing') {
        return error(res, `Cannot ship order in current status "${subOrder.status}"`, 400);
      }

      const now = new Date().toISOString();
      const updated = db.updateById('sub_orders', subOrderId, {
        status: 'shipped',
        fulfillment: {
          ...subOrder.fulfillment,
          carrier,
          trackingNumber,
          shippedAt: now
        }
      });

      return success(res, updated, 'Sub-order marked as shipped');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  /**
   * 订单确认收货或妥投送达（买家确认或系统自动妥投）
   */
  deliverSubOrder(req, res) {
    try {
      const subOrderId = req.params.id;
      const subOrder = db.findById('sub_orders', subOrderId);
      if (!subOrder) {
        return error(res, 'Sub-order not found', 404);
      }

      const now = new Date().toISOString();
      const updated = db.updateById('sub_orders', subOrderId, {
        status: 'delivered',
        fulfillment: {
          ...subOrder.fulfillment,
          deliveredAt: now
        }
      });

      // 核心联动：流转结算单状态为 ready
      settlementEngine.markAsReady(subOrderId, { force: true, note: 'Buyer confirmed receipt' });

      return success(res, updated, 'Sub-order marked as delivered; settlement status updated to ready');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  /**
   * 获取单笔订单详情
   */
  getOrderById(req, res) {
    try {
      const order = db.findById('orders', req.params.id);
      if (!order) {
        return error(res, 'Order not found', 404);
      }

      const subOrders = db.find('sub_orders', { masterOrderId: order.id });
      return success(res, { ...order, subOrders }, 'Order found');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }
}

module.exports = new OrderController();
