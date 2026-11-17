const { db } = require('./storage');
const { hashPassword } = require('../utils/security');

function seedDatabaseIfEmpty() {
  const userCount = db.count('users');
  if (userCount > 0) {
    return; // 已经存在数据，不覆盖
  }

  console.log('[Seed] Database is empty, populating initial demo marketplace data...');

  // 1. 初始化预设用户
  const defaultPasswordHash = hashPassword('Pass12345!');

  const admin = db.insert('users', {
    id: 'usr-admin-01',
    name: 'Platform Administrator',
    email: 'admin@marketplace.local',
    password: defaultPasswordHash,
    role: 'admin',
    isSeller: true
  });

  const seller1 = db.insert('users', {
    id: 'usr-seller-01',
    name: 'Alice (Geek Tech)',
    email: 'alice@seller.local',
    password: defaultPasswordHash,
    role: 'seller',
    isSeller: true
  });

  const seller2 = db.insert('users', {
    id: 'usr-seller-02',
    name: 'Bob (Eco Lifestyle)',
    email: 'bob@seller.local',
    password: defaultPasswordHash,
    role: 'seller',
    isSeller: true
  });

  const buyer = db.insert('users', {
    id: 'usr-buyer-01',
    name: 'Charlie Buyer',
    email: 'buyer@example.local',
    password: defaultPasswordHash,
    role: 'buyer',
    isSeller: false
  });

  // 2. 初始化两个不同类别的店铺
  const shop1 = db.insert('shops', {
    id: 'shop-geek-01',
    name: '极客数码工坊 (Geek Tech)',
    description: '前沿数码与开源硬件优选店铺',
    logoUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200&auto=format&fit=crop&q=60',
    ownerId: seller1.id,
    ownerName: seller1.name,
    status: 'active',
    payoutAccount: 'CN-BANK-6228480011223344',
    customCommissionRate: 0.08 // VIP 商家特惠 8% 抽成
  });

  const shop2 = db.insert('shops', {
    id: 'shop-eco-02',
    name: '轻氧原创生活 (Eco Life)',
    description: '环保、极简与自然美学生活好物',
    logoUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=200&auto=format&fit=crop&q=60',
    ownerId: seller2.id,
    ownerName: seller2.name,
    status: 'active',
    payoutAccount: 'CN-ALIPAY-BOB@ECO.LOCAL',
    customCommissionRate: 0.10 // 默认 10%
  });

  // 3. 上架演示商品
  db.insert('products', {
    id: 'prod-01',
    shopId: shop1.id,
    shopName: shop1.name,
    name: 'HHKB 机械键盘 (无线静电容)',
    description: '纯粹极客手感，支持双模连接与全键可编程',
    category: 'Electronics',
    price: 1899.00,
    stock: 25,
    imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&auto=format&fit=crop&q=60',
    status: 'active'
  });

  db.insert('products', {
    id: 'prod-02',
    shopId: shop1.id,
    shopName: shop1.name,
    name: 'Type-C 多功能扩展坞 8-in-1',
    description: '4K@60Hz 视频输出，100W PD 闪充，全铝合金散热',
    category: 'Electronics',
    price: 199.00,
    stock: 120,
    imageUrl: 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500&auto=format&fit=crop&q=60',
    status: 'active'
  });

  db.insert('products', {
    id: 'prod-03',
    shopId: shop2.id,
    shopName: shop2.name,
    name: '手工冷萃咖啡随行杯 450ml',
    description: '食品级高硼硅玻璃，双层防烫，便携不漏水',
    category: 'Home & Living',
    price: 89.00,
    stock: 60,
    imageUrl: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=500&auto=format&fit=crop&q=60',
    status: 'active'
  });

  db.insert('products', {
    id: 'prod-04',
    shopId: shop2.id,
    shopName: shop2.name,
    name: '亚麻棉透气居家拖鞋',
    description: '纯天然原麻编织，吸汗透气，防滑静音鞋底',
    category: 'Home & Living',
    price: 45.00,
    stock: 80,
    imageUrl: 'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=500&auto=format&fit=crop&q=60',
    status: 'active'
  });

  console.log('[Seed] Successfully seeded 4 demo users, 2 shops, and 4 products.');
}

module.exports = {
  seedDatabaseIfEmpty
};
