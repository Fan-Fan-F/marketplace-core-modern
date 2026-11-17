const express = require('express');
const router = express.Router();
const orderController = require('./orderController');
const { authenticate, requireShopOwner } = require('../../core/middlewares/auth');

// 买家联合下单与拆单
router.post('/checkout', authenticate, (req, res) => orderController.checkout(req, res));

// 买家查看我的订单列表
router.get('/my-orders', authenticate, (req, res) => orderController.getMyOrders(req, res));

// 卖家查看店铺名下的子订单列表
router.get('/shop/:shopId', authenticate, requireShopOwner(req => req.params.shopId), (req, res) => {
  orderController.getShopSubOrders(req, res);
});

// 卖家发货
router.patch('/sub-orders/:id/ship', authenticate, (req, res) => {
  orderController.shipSubOrder(req, res);
});

// 确认收货（触发结算单就绪）
router.patch('/sub-orders/:id/deliver', authenticate, (req, res) => {
  orderController.deliverSubOrder(req, res);
});

// 获取主订单详情
router.get('/:id', authenticate, (req, res) => {
  orderController.getOrderById(req, res);
});

module.exports = router;
