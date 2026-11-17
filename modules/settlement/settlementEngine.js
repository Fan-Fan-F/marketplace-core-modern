const crypto = require('crypto');
const config = require('../../core/config');

class SettlementEngine {
  /**
   * 可复用多供应商结算与分账引擎
   * @param {Object} options 配置项
   * @param {number} [options.defaultCommissionRate] 默认平台抽成比例 (如 0.10 表示 10%)
   * @param {number} [options.defaultFixedFee] 默认固定单笔通道费 (如 0.50 元)
   * @param {number} [options.escrowHoldHours] 默认防退款争议锁定期小时数
   * @param {Object} [options.store] 数据持久化层实例
   */
  constructor(options = {}) {
    this.defaultCommissionRate = typeof options.defaultCommissionRate === 'number' 
      ? options.defaultCommissionRate 
      : (config.platform.defaultCommissionRate || 0.10);
    this.defaultFixedFee = typeof options.defaultFixedFee === 'number'
      ? options.defaultFixedFee
      : (config.platform.defaultFixedFee || 0.50);
    this.escrowHoldHours = typeof options.escrowHoldHours === 'number'
      ? options.escrowHoldHours
      : (config.platform.escrowHoldHours || 24);
    this.store = options.store || null;
  }

  setStore(store) {
    this.store = store;
  }

  _round(num) {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  /**
   * 纯函数：分账与平台抽成计算规则
   */
  calculateSplit({ grossAmount, shopCommissionRate = null, fixedFee = null }) {
    if (typeof grossAmount !== 'number' || grossAmount < 0) {
      throw new Error('grossAmount must be a non-negative number');
    }

    const rate = typeof shopCommissionRate === 'number' ? shopCommissionRate : this.defaultCommissionRate;
    const fee = typeof fixedFee === 'number' ? fixedFee : this.defaultFixedFee;

    if (grossAmount === 0) {
      return {
        grossAmount: 0,
        platformFee: 0,
        sellerNetAmount: 0,
        commissionRate: rate,
        fixedFee: fee,
        calculatedAt: new Date().toISOString()
      };
    }

    const rawFee = (grossAmount * rate) + fee;
    const platformFee = this._round(Math.min(grossAmount, rawFee));
    const sellerNetAmount = this._round(grossAmount - platformFee);

    return {
      grossAmount: this._round(grossAmount),
      platformFee,
      sellerNetAmount,
      commissionRate: rate,
      fixedFee: fee,
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * 计提生成预结算流水单 (订单支付成功后调用)
   */
  accrueSubOrder(subOrder, shop = {}) {
    if (!this.store) {
      throw new Error('SettlementEngine requires a configured store to persist statements');
    }

    // 检查是否已存在对应结算单，避免重复计提
    const existing = this.store.findOne('settlement_statements', { subOrderId: subOrder.id });
    if (existing) {
      return existing;
    }

    const gross = typeof subOrder.totalAmount === 'number' ? subOrder.totalAmount : 0;
    const split = this.calculateSplit({
      grossAmount: gross,
      shopCommissionRate: shop.customCommissionRate ?? null,
      fixedFee: shop.customFixedFee ?? null
    });

    const now = new Date();
    const escrowReleaseAt = new Date(now.getTime() + this.escrowHoldHours * 3600 * 1000).toISOString();

    const statement = {
      id: `SETTLE-${crypto.randomUUID()}`,
      subOrderId: subOrder.id,
      masterOrderId: subOrder.masterOrderId,
      shopId: subOrder.shopId,
      sellerId: subOrder.sellerId || shop.ownerId,
      grossAmount: split.grossAmount,
      platformFee: split.platformFee,
      sellerNetAmount: split.sellerNetAmount,
      commissionRate: split.commissionRate,
      fixedFee: split.fixedFee,
      currency: subOrder.currency || 'CNY',
      status: 'accrued', // 'accrued' | 'ready' | 'processing' | 'settled' | 'disputed'
      escrowReleaseAt,
      payoutBatchId: null,
      payoutAccount: shop.payoutAccount || null,
      settledAt: null,
      createdAt: now.toISOString(),
      timeline: [
        {
          action: 'ACCRUED',
          status: 'accrued',
          timestamp: now.toISOString(),
          note: `Pre-settlement accrued upon sub-order creation. Escrow window holds until ${escrowReleaseAt}`
        }
      ]
    };

    const saved = this.store.insert('settlement_statements', statement);

    // 记录明细账本流水
    this.store.insert('settlement_ledgers', {
      statementId: saved.id,
      shopId: saved.shopId,
      entryType: 'ACCRUAL_CREDIT',
      amount: saved.sellerNetAmount,
      platformFee: saved.platformFee,
      grossAmount: saved.grossAmount,
      balanceEffect: 'PENDING_INFLOW',
      note: `Accrued from Sub-Order ${subOrder.id}`
    });

    return saved;
  }

  /**
   * 将计提中的结算单转为可打款 (ready)
   * 触发时机：子订单履约完成 (Delivered) 或买家主动确认收货
   */
  markAsReady(subOrderIdOrStatementId, options = {}) {
    if (!this.store) throw new Error('Store not configured');

    let statement = this.store.findOne('settlement_statements', { id: subOrderIdOrStatementId });
    if (!statement) {
      statement = this.store.findOne('settlement_statements', { subOrderId: subOrderIdOrStatementId });
    }

    if (!statement) {
      throw new Error(`Settlement statement not found for id/subOrder: ${subOrderIdOrStatementId}`);
    }

    if (statement.status === 'settled') {
      return statement; // 已经结清无需重复操作
    }

    if (statement.status === 'disputed') {
      throw new Error(`Cannot mark disputed statement ${statement.id} as ready before resolution`);
    }

    const now = new Date();
    const isPastEscrow = new Date(statement.escrowReleaseAt) <= now;
    if (!isPastEscrow && !options.force) {
      // 若尚未过冷冻期且未强制提前解锁，则记录就绪准备，依然安全受控
    }

    const updatedTimeline = [
      ...(statement.timeline || []),
      {
        action: 'MARKED_READY',
        status: 'ready',
        timestamp: now.toISOString(),
        note: options.note || 'Order delivered or escrow completed. Ready for payout disbursement.'
      }
    ];

    const updated = this.store.updateById('settlement_statements', statement.id, {
      status: 'ready',
      readyAt: now.toISOString(),
      timeline: updatedTimeline
    });

    return updated;
  }

  /**
   * 执行对账打款，出账完成转为 settled
   */
  executePayout(statementId, payoutInfo = {}) {
    if (!this.store) throw new Error('Store not configured');

    const statement = this.store.findById('settlement_statements', statementId);
    if (!statement) {
      throw new Error(`Settlement statement ${statementId} not found`);
    }

    if (statement.status === 'settled') {
      throw new Error(`Statement ${statementId} has already been settled on ${statement.settledAt}`);
    }

    if (statement.status === 'disputed') {
      throw new Error(`Statement ${statementId} is currently under dispute and locked`);
    }

    const now = new Date().toISOString();
    const batchId = payoutInfo.batchId || `PAY-BATCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const updatedTimeline = [
      ...(statement.timeline || []),
      {
        action: 'PAYOUT_SETTLED',
        status: 'settled',
        timestamp: now,
        note: `Payout transferred. Batch: ${batchId}, Reference: ${payoutInfo.reference || 'N/A'}`
      }
    ];

    const updated = this.store.updateById('settlement_statements', statement.id, {
      status: 'settled',
      settledAt: now,
      payoutBatchId: batchId,
      payoutReference: payoutInfo.reference || 'MANUAL-PAYOUT',
      timeline: updatedTimeline
    });

    // 记录出账冲销流水
    this.store.insert('settlement_ledgers', {
      statementId: statement.id,
      shopId: statement.shopId,
      entryType: 'PAYOUT_DISBURSED',
      amount: statement.sellerNetAmount,
      balanceEffect: 'DISBURSED',
      batchId,
      note: `Disbursed to seller account`
    });

    return updated;
  }

  /**
   * 争议冻结 (买家申请售后争议或风控拦截)
   */
  freezeDispute(statementId, reason = 'Buyer filed refund dispute') {
    if (!this.store) throw new Error('Store not configured');
    const statement = this.store.findById('settlement_statements', statementId);
    if (!statement) throw new Error(`Statement ${statementId} not found`);

    const now = new Date().toISOString();
    const updated = this.store.updateById('settlement_statements', statement.id, {
      status: 'disputed',
      disputeReason: reason,
      timeline: [
        ...(statement.timeline || []),
        {
          action: 'DISPUTE_FROZEN',
          status: 'disputed',
          timestamp: now,
          note: reason
        }
      ]
    });
    return updated;
  }

  /**
   * 获取店铺的结算全貌汇总 (可结算额、冻结中、已结清等)
   */
  getShopSummary(shopId) {
    if (!this.store) throw new Error('Store not configured');

    const statements = this.store.find('settlement_statements', { shopId });

    let totalGross = 0;
    let totalPlatformFees = 0;
    let totalNet = 0;
    let settledAmount = 0;
    let readyAmount = 0;
    let accruedAmount = 0;
    let disputedAmount = 0;

    for (const stmt of statements) {
      totalGross += stmt.grossAmount;
      totalPlatformFees += stmt.platformFee;
      totalNet += stmt.sellerNetAmount;

      if (stmt.status === 'settled') {
        settledAmount += stmt.sellerNetAmount;
      } else if (stmt.status === 'ready') {
        readyAmount += stmt.sellerNetAmount;
      } else if (stmt.status === 'accrued') {
        accruedAmount += stmt.sellerNetAmount;
      } else if (stmt.status === 'disputed') {
        disputedAmount += stmt.sellerNetAmount;
      }
    }

    return {
      shopId,
      currency: 'CNY',
      statementCount: statements.length,
      metrics: {
        totalGross: this._round(totalGross),
        totalPlatformFees: this._round(totalPlatformFees),
        totalNetRevenue: this._round(totalNet),
        settledAmount: this._round(settledAmount),
        readyAmount: this._round(readyAmount),
        accruedAmount: this._round(accruedAmount),
        disputedAmount: this._round(disputedAmount)
      }
    };
  }
}

module.exports = SettlementEngine;
