const express = require('express');
const router = express.Router();
const shopController = require('./shopController');
const { authenticate, requireShopOwner } = require('../../core/middlewares/auth');

router.post('/', authenticate, (req, res) => shopController.createShop(req, res));
router.get('/', (req, res) => shopController.listShops(req, res));
router.get('/:id', (req, res) => shopController.getShopById(req, res));
router.put('/:id', authenticate, requireShopOwner(req => req.params.id), (req, res) => {
  shopController.updateShop(req, res);
});
router.get('/:id/metrics', authenticate, requireShopOwner(req => req.params.id), (req, res) => {
  shopController.getShopMetrics(req, res);
});

module.exports = router;
