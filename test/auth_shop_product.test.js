const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, createToken, verifyToken } = require('../core/utils/security');
const { StorageEngine } = require('../core/db/storage');

test('Security & Auth Utilities', async (t) => {
  const secret = 'test-secret-key-placeholder';

  await t.test('密码安全哈希与校验', () => {
    const raw = 'SuperSecret123!';
    const hashed = hashPassword(raw);
    assert.notEqual(raw, hashed);
    assert.ok(hashed.includes(':'));

    assert.equal(verifyPassword(raw, hashed), true);
    assert.equal(verifyPassword('WrongPassword', hashed), false);
    assert.equal(verifyPassword('', hashed), false);
  });

  await t.test('JWT 生成与有效性校验', () => {
    const token = createToken({ userId: 'u101', role: 'seller' }, secret, 60);
    assert.ok(typeof token === 'string');

    const decoded = verifyToken(token, secret);
    assert.equal(decoded.userId, 'u101');
    assert.equal(decoded.role, 'seller');
    assert.ok(decoded.exp > decoded.iat);
  });

  await t.test('过期与伪造 Token 拦截', () => {
    const expiredToken = createToken({ userId: 'u102' }, secret, -10);
    assert.throws(() => {
      verifyToken(expiredToken, secret);
    }, /Token has expired/);

    const tampered = expiredToken.slice(0, -5) + 'fakee';
    assert.throws(() => {
      verifyToken(tampered, secret);
    }, /signature verification failed/);
  });
});

test('Shop & Product Lifecycle via StorageEngine', async (t) => {
  const store = new StorageEngine({ memoryOnly: true });

  // 1. 创建卖家与买家
  const seller = store.insert('users', {
    name: 'Seller One',
    email: 's1@shop.local',
    password: hashPassword('Secret123'),
    role: 'seller',
    isSeller: true
  });

  // 2. 创建店铺
  const shop = store.insert('shops', {
    name: 'Cyberpunk Workshop',
    description: 'Custom mod keyboards and artisanal caps',
    ownerId: seller.id,
    status: 'active',
    payoutAccount: 'CN-PAY-888',
    customCommissionRate: 0.09
  });

  assert.ok(shop.id);
  assert.equal(shop.name, 'Cyberpunk Workshop');

  // 3. 上架商品
  const product = store.insert('products', {
    shopId: shop.id,
    shopName: shop.name,
    name: 'Artisan Keycap (Dragon)',
    category: 'Peripherals',
    price: 299.00,
    stock: 15,
    status: 'active'
  });

  assert.ok(product.id);
  assert.equal(product.stock, 15);

  // 4. 库存扣减
  store.updateById('products', product.id, {
    stock: product.stock - 2
  });

  const updatedProd = store.findById('products', product.id);
  assert.equal(updatedProd.stock, 13);

  // 5. 检索过滤
  const searchResults = store.find('products', doc => doc.category === 'Peripherals');
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].name, 'Artisan Keycap (Dragon)');
});
