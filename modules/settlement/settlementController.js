const SettlementEngine = require('./settlementEngine');
const { db } = require('../../core/db/storage');
const { success, error } = require('../../core/utils/response');

const engine = new SettlementEngine({ store: db });

class SettlementController {
  /**
   * 模拟分账计算（不需要写库，方便调用方实时试算）
   */
  simulate(req, res) {
    try {
      const { grossAmount, shopCommissionRate, fixedFee } = req.body;
      if (typeof grossAmount !== 'number' || grossAmount < 0) {
        return error(res, 'Valid grossAmount is required', 400);
      }

      const result = engine.calculateSplit({
        grossAmount,
        shopCommissionRate,
        fixedFee
      });

      return success(res, result, 'Split calculation simulated');
    } catch (err) {
      return error(res, err.message, 400);
    }
  }

  /**
   * 获取店铺的结算资金全貌与指标汇总
   */
  getShopSummary(req, res) {
    try {
      const shopId = req.params.shopId;
      const summary = engine.getShopSummary(shopId);
      return success(res, summary, 'Shop settlement summary retrieved');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  /**
   * 查询店铺的结算单明细列表
   */
  listStatements(req, res) {
    try {
      const shopId = req.params.shopId;
      const { status } = req.query;

      let filter = { shopId };
      if (status) {
        filter.status = status;
      }

      const statements = db.find('settlement_statements', filter);
      return success(res, {
        total: statements.length,
        items: statements.reverse()
      }, 'Settlement statements retrieved');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  /**
   * 获取单笔结算单详情
   */
  getStatementById(req, res) {
    try {
      const statement = db.findById('settlement_statements', req.params.id);
      if (!statement) {
        return error(res, 'Settlement statement not found', 404);
      }
      return success(res, statement, 'Statement found');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  /**
   * 执行对账出账打款 (卖家确认或管理员打款)
   */
  executePayout(req, res) {
    try {
      const { id } = req.params;
      const { batchId, reference } = req.body;

      const updated = engine.executePayout(id, { batchId, reference });
      return success(res, updated, 'Payout disbursed successfully');
    } catch (err) {
      return error(res, err.message, 400);
    }
  }

  /**
   * 触发争议冻结
   */
  disputeStatement(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const updated = engine.freezeDispute(id, reason || 'Dispute triggered by admin');
      return success(res, updated, 'Statement dispute recorded and payout frozen');
    } catch (err) {
      return error(res, err.message, 400);
    }
  }
}

module.exports = {
  settlementController: new SettlementController(),
  settlementEngine: engine
};
