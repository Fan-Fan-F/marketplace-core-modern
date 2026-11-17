const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../server');
const { db } = require('../core/db/storage');

let server;
let baseUrl = '';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    const req = http.request(url, {
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

test('End-to-End Multi-Vendor Checkout, Order Splitting & Settlement Flow', async (t) => {
  // 启动服务在动态随机端口
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  let buyerToken = '';
  let seller1Token = '';
  let shop1Product = null;
  let shop2Product = null;
  let masterOrderId = null;
  let subOrder1 = null;
  let subOrder2 = null;
  let statement1Id = null;

  await t.test('1. 买家与卖家分别登录获取 Token', async () => {
    const resBuyer = await request('POST', '/api/auth/login', {
      email: 'buyer@example.local',
      password: 'Pass12345!'
    });
    assert.equal(resBuyer.status, 200);
    assert.equal(resBuyer.body.success, true);
    assert.ok(resBuyer.body.data.token);
    buyerToken = resBuyer.body.data.token;

    const resSeller = await request('POST', '/api/auth/login', {
      email: 'alice@seller.local',
      password: 'Pass12345!'
    });
    assert.equal(resSeller.status, 200);
    assert.equal(resSeller.body.success, true);
    assert.ok(resSeller.body.data.token);
    seller1Token = resSeller.body.data.token;
  });

  await t.test('2. 查询商品并挑选来自不同店铺的两个商品', async () => {
    const res = await request('GET', '/api/products');
    assert.equal(res.status, 200);
    const items = res.body.data.items;
    assert.ok(items.length >= 2);

    shop1Product = items.find(i => i.shopId === 'shop-geek-01');
    shop2Product = items.find(i => i.shopId === 'shop-eco-02');
    assert.ok(shop1Product, 'Should find product from Shop 1');
    assert.ok(shop2Product, 'Should find product from Shop 2');
    assert.notEqual(shop1Product.shopId, shop2Product.shopId);
  });

  await t.test('3. 跨店铺联合结算 (Checkout) 并验证自动拆单与计提分账', async () => {
    const initialStock1 = shop1Product.stock;
    const initialStock2 = shop2Product.stock;

    const res = await request('POST', '/api/orders/checkout', {
      items: [
        { productId: shop1Product.id, quantity: 1 },
        { productId: shop2Product.id, quantity: 2 }
      ],
      shippingAddress: {
        recipientName: '测试用户',
        phone: '13900000000',
        addressLine: '北京市海淀区中关村南大街 1 号'
      }
    }, {
      'Authorization': `Bearer ${buyerToken}`
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    const { masterOrder, subOrders, settlements } = res.body.data;
    assert.ok(masterOrder);
    assert.equal(subOrders.length, 2, 'Should be split into 2 sub-orders');
    assert.equal(settlements.length, 2, 'Should create 2 settlement statements');

    masterOrderId = masterOrder.id;
    subOrder1 = subOrders.find(s => s.shopId === 'shop-geek-01');
    subOrder2 = subOrders.find(s => s.shopId === 'shop-eco-02');

    assert.ok(subOrder1);
    assert.ok(subOrder2);

    // 验证库存已扣减
    const updatedProd1 = db.findById('products', shop1Product.id);
    const updatedProd2 = db.findById('products', shop2Product.id);
    assert.equal(updatedProd1.stock, initialStock1 - 1);
    assert.equal(updatedProd2.stock, initialStock2 - 2);

    // 验证计提状态
    const stmt1 = settlements.find(st => st.subOrderId === subOrder1.id);
    assert.ok(stmt1);
    assert.equal(stmt1.status, 'accrued');
    statement1Id = stmt1.id;
  });

  await t.test('4. 店铺卖家发货 (Ship Sub-Order)', async () => {
    const res = await request('PATCH', `/api/orders/sub-orders/${subOrder1.id}/ship`, {
      carrier: '顺丰速运',
      trackingNumber: 'SF999888777'
    }, {
      'Authorization': `Bearer ${seller1Token}`
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'shipped');
    assert.equal(res.body.data.fulfillment.trackingNumber, 'SF999888777');
  });

  await t.test('5. 买家确认送达收货，结算单自动流转为 ready', async () => {
    const res = await request('PATCH', `/api/orders/sub-orders/${subOrder1.id}/deliver`, {}, {
      'Authorization': `Bearer ${buyerToken}`
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'delivered');

    // 检查结算单状态
    const stmt = db.findById('settlement_statements', statement1Id);
    assert.equal(stmt.status, 'ready');
  });

  await t.test('6. 执行出账打款 (Payout Disbursement)', async () => {
    const res = await request('POST', `/api/settlements/statements/${statement1Id}/payout`, {
      reference: 'E2E-PAY-BANK-TX'
    }, {
      'Authorization': `Bearer ${buyerToken}`
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'settled');
    assert.ok(res.body.data.payoutBatchId);

    // 检查账本流水是否记入出账
    const ledgers = db.find('settlement_ledgers', { statementId: statement1Id, entryType: 'PAYOUT_DISBURSED' });
    assert.equal(ledgers.length, 1);
  });

  await t.test('7. 商家结算报表与汇总指标验证', async () => {
    const res = await request('GET', '/api/settlements/shop/shop-geek-01/summary', null, {
      'Authorization': `Bearer ${seller1Token}`
    });

    assert.equal(res.status, 200);
    const metrics = res.body.data.metrics;
    assert.ok(metrics.totalGross > 0);
    assert.ok(metrics.totalPlatformFees > 0);
    assert.ok(metrics.settledAmount > 0);
  });

  await t.test('8. 系统健康检查接口', async () => {
    const res = await request('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.service, 'marketplace-core-modern');
    assert.ok(res.body.stats.orders >= 1);
    assert.ok(res.body.stats.subOrders >= 2);
  });
});
