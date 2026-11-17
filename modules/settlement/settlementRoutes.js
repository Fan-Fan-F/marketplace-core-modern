const express = require('express');
const router = express.Router();
const { settlementController } = require('./settlementController');
const { authenticate, requireRole, requireShopOwner } = require('../../core/middlewares/auth');

// 模拟分账计算（公共端点，支持前端/SDK 快速测算）
router.post('/simulate', (req, res) => settlementController.simulate(req, res));

// 店铺结算概览
router.get('/shop/:shopId/summary', authenticate, requireShopOwner(req => req.params.shopId), (req, res) => {
  settlementController.getShopSummary(req, res);
});

// 店铺结算单列表
router.get('/shop/:shopId/statements', authenticate, requireShopOwner(req => req.params.shopId), (req, res) => {
  settlementController.listStatements(req, res);
});

// 单条结算单详情
router.get('/statements/:id', authenticate, (req, res) => {
  settlementController.getStatementById(req, res);
});

// 执行出账打款
router.post('/statements/:id/payout', authenticate, (req, res) => {
  settlementController.executePayout(req, res);
});

// 标记争议冻结
router.post('/statements/:id/dispute', authenticate, requireRole('admin'), (req, res) => {
  settlementController.disputeStatement(req, res);
});

module.exports = router;
