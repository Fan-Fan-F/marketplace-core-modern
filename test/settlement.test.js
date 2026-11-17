const test = require('node:test');
const assert = require('node:assert/strict');
const SettlementEngine = require('../modules/settlement/settlementEngine');
const { StorageEngine } = require('../core/db/storage');

test('SettlementEngine - 基础分账试算与抽成计算', async (t) => {
  const engine = new SettlementEngine({
    defaultCommissionRate: 0.10, // 10%
    defaultFixedFee: 0.50        // 0.50 元
  });

  await t.test('正常商品金额分账计算', () => {
    // 1000 元订单：平台抽成 = 1000 * 0.10 + 0.50 = 100.50，卖家净得 = 899.50
    const result = engine.calculateSplit({ grossAmount: 1000 });
    assert.equal(result.grossAmount, 1000);
    assert.equal(result.platformFee, 100.50);
    assert.equal(result.sellerNetAmount, 899.50);
    assert.equal(result.commissionRate, 0.10);
    assert.equal(result.fixedFee, 0.50);
  });

  await t.test('自定义店铺特惠费率与零固定费', () => {
    // 500 元订单，店铺 VIP 费率 5%，无固定费
    const result = engine.calculateSplit({
      grossAmount: 500,
      shopCommissionRate: 0.05,
      fixedFee: 0
    });
    assert.equal(result.platformFee, 25.00);
    assert.equal(result.sellerNetAmount, 475.00);
  });

  await t.test('0 元订单与边界值保护', () => {
    const result = engine.calculateSplit({ grossAmount: 0 });
    assert.equal(result.grossAmount, 0);
    assert.equal(result.platformFee, 0);
    assert.equal(result.sellerNetAmount, 0);
  });

  await t.test('平台抽成不得超过交易总额（防止商家倒贴）', () => {
    // 小额 0.20 元订单，若按固定费 0.50 会产生负收益，需封顶
    const result = engine.calculateSplit({ grossAmount: 0.20, shopCommissionRate: 0.1, fixedFee: 0.50 });
    assert.ok(result.platformFee <= 0.20);
    assert.ok(result.sellerNetAmount >= 0);
  });
});

test('SettlementEngine - 订单结算生命周期与状态流转', async (t) => {
  const mockStore = new StorageEngine({ memoryOnly: true });
  const engine = new SettlementEngine({ store: mockStore, escrowHoldHours: 24 });

  const mockShop = {
    id: 'shop-test-1',
    name: 'Test Shop',
    ownerId: 'seller-1',
    customCommissionRate: 0.08, // 8%
    customFixedFee: 0.20,
    payoutAccount: 'ACCT-TEST-999'
  };

  const mockSubOrder = {
    id: 'sub-ord-001',
    masterOrderId: 'ord-main-001',
    shopId: mockShop.id,
    sellerId: mockShop.ownerId,
    totalAmount: 200.00,
    currency: 'CNY'
  };

  let statementId = null;

  await t.test('步骤 1: 计提预结算单 (accrueSubOrder)', () => {
    const stmt = engine.accrueSubOrder(mockSubOrder, mockShop);
    assert.ok(stmt);
    assert.equal(stmt.subOrderId, mockSubOrder.id);
    assert.equal(stmt.status, 'accrued');
    assert.equal(stmt.grossAmount, 200.00);
    // 200 * 0.08 + 0.20 = 16.20
    assert.equal(stmt.platformFee, 16.20);
    assert.equal(stmt.sellerNetAmount, 183.80);
    statementId = stmt.id;

    // 检查账本流水是否生成
    const ledgers = mockStore.find('settlement_ledgers', { statementId: stmt.id });
    assert.equal(ledgers.length, 1);
    assert.equal(ledgers[0].entryType, 'ACCRUAL_CREDIT');
  });

  await t.test('步骤 2: 重复计提幂等性防范', () => {
    const duplicate = engine.accrueSubOrder(mockSubOrder, mockShop);
    assert.equal(duplicate.id, statementId);
    const count = mockStore.count('settlement_statements', { subOrderId: mockSubOrder.id });
    assert.equal(count, 1);
  });

  await t.test('步骤 3: 订单妥投，流转为就绪可打款 (markAsReady)', () => {
    const readyStmt = engine.markAsReady(statementId, { force: true });
    assert.equal(readyStmt.status, 'ready');
    assert.ok(readyStmt.readyAt);
  });

  await t.test('步骤 4: 执行出账打款 (executePayout)', () => {
    const settledStmt = engine.executePayout(statementId, { reference: 'TEST-TRANSFER-101' });
    assert.equal(settledStmt.status, 'settled');
    assert.ok(settledStmt.payoutBatchId);
    assert.ok(settledStmt.settledAt);

    // 再次打款应该抛错
    assert.throws(() => {
      engine.executePayout(statementId);
    }, /already been settled/);
  });

  await t.test('步骤 5: 商家结算指标汇总计算 (getShopSummary)', () => {
    const summary = engine.getShopSummary(mockShop.id);
    assert.equal(summary.shopId, mockShop.id);
    assert.equal(summary.metrics.totalGross, 200.00);
    assert.equal(summary.metrics.totalPlatformFees, 16.20);
    assert.equal(summary.metrics.settledAmount, 183.80);
    assert.equal(summary.metrics.readyAmount, 0);
  });
});

test('SettlementEngine - 争议冻结机制 (freezeDispute)', async () => {
  const mockStore = new StorageEngine({ memoryOnly: true });
  const engine = new SettlementEngine({ store: mockStore });

  const shop = { id: 'shop-disp', ownerId: 'seller-d' };
  const subOrder = { id: 'sub-disp-1', masterOrderId: 'ord-m', shopId: shop.id, totalAmount: 100 };

  const stmt = engine.accrueSubOrder(subOrder, shop);
  assert.equal(stmt.status, 'accrued');

  // 冻结争议
  const frozen = engine.freezeDispute(stmt.id, 'Buyer claimed counterfeit goods');
  assert.equal(frozen.status, 'disputed');
  assert.equal(frozen.disputeReason, 'Buyer claimed counterfeit goods');

  // 冻结状态下禁止出账打款
  assert.throws(() => {
    engine.executePayout(stmt.id);
  }, /currently under dispute/);
});
