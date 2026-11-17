# marketplace-core-modern 功能规格书（SPEC.md）

## 1. 项目定位与背景

- **项目名称**：marketplace-core-modern
- **开发路线**：B 路线（按思路与功能设计重写，代码全部独立实现）
- **参考来源**：[shamahoque/mern-marketplace](https://github.com/shamahoque/mern-marketplace) (MIT License)
- **核心目标**：针对原 MERN 教学市集项目依赖过时、与 MongoDB/Stripe 深度单体耦合、缺乏规范的多店铺拆单与独立结算分账引擎等痛点，全新构建一个结构清晰、现代化、高内聚、开箱即用的多供应商市集底座（Multi-Vendor Marketplace Core Engine），并将**卖家结算与分账（Settlement & Split Billing）流程封装为可插拔、可复用的独立业务模块**。

---

## 2. 借鉴的功能点清单（与原项目对比）

| 功能领域 | 原项目 (mern-marketplace) 功能设计 | 现代重构版 (marketplace-core-modern) 实现与增强 |
| :--- | :--- | :--- |
| **用户与鉴权** | 基础 JWT 认证，User 表内用 `seller: Boolean` 标记身份 | 模块化 RBAC 角色体系（`buyer`、`seller`、`admin`），支持基于标准 Bearer JWT 的安全认证与密码加盐哈希，支持动态店铺绑定与多租户权限校验 |
| **店铺系统** | 简单的 Shop 创建与基本资料更新，无状态流转 | 多供应商店铺生命周期管理（待审核 `pending`、营业中 `active`、冻结 `suspended`），支持费率策略覆盖、收款银行/渠道账户配置 |
| **商品管理** | 基础单品上架与类目，商品与 Shop 简单外键关联 | 分类目录管理、原子化库存追踪（扣减与防超卖回滚）、多状态检索、关联店铺元信息校验 |
| **购物车与下单** | 前端本地 Cart，后端单体订单无拆单，整单提交 | 跨店铺联合结算（Unified Checkout），后端自动按 Vendor 拆分店铺子订单（Sub-Orders），每个商家独立履约与跟踪状态 |
| **订单履约** | 简单枚举状态（Processing, Shipped, Delivered, Cancelled） | 严谨的状态机流转，支持买家收货或自动确认，子订单与主订单状态双向级联，严格防逆向状态跳跃 |
| **结算与分账** | 强绑定 Stripe Connect 接口，无内部账单流水与对账能力 | **可复用结算与分账引擎（Settlement & Split Engine）**：解耦第三方支付网关，支持平台阶梯/固定费率抽成、结算单生命周期（`accrued` -> `ready` -> `settled`）、冻结期防退款机制与账单对账导出 |
| **运行与环境** | 强依赖 MongoDB 实例与复杂 Webpack/Babel 构建环境，旧版 Node.js 易报错 | 现代化原生 Node.js (v18 ~ v24) 驱动，零外部数据库依赖（内置轻量可靠的高性能嵌入式持久化存储与内存自测模式），极简零配置快速启动 |
| **交互与演示** | 臃肿的前后端打包结构 | 内置交互式现代化控制台与 RESTful API 演示界面，支持全流程一键体验与端到端自动化测试验证 |

---

## 3. 系统架构与模块设计

系统采用高内聚、清晰分层的模块化架构：

```
marketplace-core-modern/
├── core/                       # 核心业务底座
│   ├── config/                 # 配置中心（无硬编码密钥，环境变量注入）
│   ├── db/                     # 数据访问层与持久化抽象
│   ├── middlewares/            # 鉴权中间件、请求验证、错误处理
│   └── utils/                  # 密码哈希、JWT 生成、统一响应格式
├── modules/                    # 业务领域模块
│   ├── auth/                   # 认证与用户服务 (Service, Controller, Routes)
│   ├── shop/                   # 商家与店铺管理
│   ├── product/                # 商品与库存管理
│   ├── order/                  # 购物车、拆单结算、履约状态机
│   └── settlement/             # ★ 可复用卖家结算与分账独立引擎
├── public/                     # 现代轻量静态控制台与交互式 Storefront
├── test/                       # 自动化测试套件（单元测试 + 完整端到端业务流）
├── server.js                   # HTTP 服务主入口
└── index.js                    # 模块导出入口（支持作为 npm 包二次引入核心底座）
```

---

## 4. 卖家结算/分账模块（Settlement & Split Engine）核心规格

作为本次任务的重点增强，`SettlementEngine` 独立封装为可移植、可单独测试复用的业务模块：

### 4.1 计费与分账规则
1. **抽成策略 (Commission Policy)**:
   - 默认平台抽成比率（例如默认 10% 佣金比率 `0.10`）。
   - 店铺级费率覆盖（可对重点商家设定 VIP 优惠比率）。
   - 固定手续费（Fixed Transaction Fee，如每笔子订单 0.50 元通道费）。
2. **结算计算公式**:
   - `gross_amount` = $\sum (\text{item.price} \times \text{item.quantity})$
   - `platform_fee` = $\text{round}(gross\_amount \times fee\_rate + fixed\_fee)$
   - `seller_net_amount` = $gross\_amount - platform\_fee$
3. **结算账期与状态机**:
   - `accrued` (已计提)：子订单支付成功后即刻生成预结算流水，进入安全锁定期（Escrow Window，防售后退款）。
   - `ready` (待结算)：订单标记为 `Delivered`（已送达/买家确认收货）且超过争议保护期，转为可打款状态。
   - `processing` (结算处理中)：出纳发起打款对账。
   - `settled` (已结清)：打款完成，记录结算批次号与出账凭证。
   - `disputed` (争议冻结)：若买家申请售后退款，自动拦截结算并冻结分账。

---

## 5. 核心 API 规格清单

### 5.1 认证与用户 (`/api/auth`)
- `POST /api/auth/register` - 用户注册（买家/商家）
- `POST /api/auth/login` - 账号登录，颁发 JWT Token
- `GET /api/auth/profile` - 查询当前登录用户信息

### 5.2 店铺管理 (`/api/shops`)
- `POST /api/shops` - 申请创建新店铺（卖家）
- `GET /api/shops` - 获取店铺公开列表
- `GET /api/shops/:id` - 查看店铺详情
- `PUT /api/shops/:id` - 更新店铺信息与结算账户配置
- `GET /api/shops/:id/metrics` - 店铺销售与结算数据大盘

### 5.3 商品管理 (`/api/products`)
- `POST /api/products` - 上架商品（需拥有对应店铺权限）
- `GET /api/products` - 分页检索与类目筛选商品
- `GET /api/products/:id` - 获取商品详情与库存
- `PUT /api/products/:id` - 编辑商品信息与库存补充
- `DELETE /api/products/:id` - 下架/删除商品

### 5.4 订单与多店铺拆单 (`/api/orders`)
- `POST /api/orders/checkout` - 联合结账（接收商品项，自动按商家拆分生成子订单与预结算单）
- `GET /api/orders/my-orders` - 买家查看购买订单与物流履约状态
- `GET /api/orders/shop/:shopId` - 商家查看自己店铺待发货与历史子订单
- `PATCH /api/orders/sub-orders/:id/status` - 商家流转子订单状态（`processing` -> `shipped` -> `delivered`）

### 5.5 卖家分账与结算引擎 API (`/api/settlements`)
- `GET /api/settlements/shop/:shopId/summary` - 查询店铺结算账户概览（已结算、冻结中、待出账金额）
- `GET /api/settlements/shop/:shopId/statements` - 分页查询店铺分账结算单流水明细
- `POST /api/settlements/statements/:id/settle` - 触发特定结算单出账打款（管理员/出纳角色或对账任务触发）
- `POST /api/settlements/simulate` - 分账计算模拟器（供开发者或前端实时预估分账与平台抽成）

---

## 6. 安全与合规性防护

1. **无敏感配置泄漏**：禁止在代码库与配置文件中硬编码任何真实私钥、Token、个人绝对路径；配置模板仅提供 `<your-jwt-secret>` 等占位符。
2. **轻量持久化与自测隔离**：自测数据存储在隔离环境或本地忽略文件（`.data/`、`*.db`），全量加入 `.gitignore`，不得随 Git 仓库提交。
3. **代码独立性**：100% 独立重写业务逻辑与数据访问，不引用或包含原项目的任何函数实现与代码片段。

---

## 7. 自测计划与验证指标

1. **环境安装与启动**：运行 `npm install` 与 `npm start`，服务正常监听端口无崩溃。
2. **自动化测试套件**：运行 `npm test`，全量执行覆盖鉴权、店铺、商品、跨店铺拆单、分账结算生命周期流转的端到端自动化测试，断言 100% 通过。
3. **接口端到端走通**：模拟完整商业链路：买家注册 -> 卖家开店 -> 上架商品 -> 跨店铺选品下单 -> 自动拆单与计提分账 -> 发货履约 -> 结算单生成与打款。

---

## 8. 自测记录（生产实测，2026-11-17）

### 8.1 依赖安装与启动验证
- **测试命令**：
  ```bash
  npm install
  node server.js
  ```
- **实测输出**：
  - `added 70 packages in 16s`
  - 服务成功监听 `http://localhost:3000`，输出启动 Banner；
  - 自动触发冷启动种子填充：`[Seed] Successfully seeded 4 demo users, 2 shops, and 4 products.`
  - 访问 `/api/health` 成功返回 `{"status":"ok","service":"marketplace-core-modern","version":"1.0.0", ...}`；
  - 访问 `http://localhost:3000/` 成功返回现代化控制台前端（HTTP 200）。

### 8.2 自动化测试套件执行（`npm test`）
- **测试命令**：
  ```bash
  npm test
  ```
- **实测结果**：
  - 执行测试文件：
    1. `test/settlement.test.js`：涵盖平台抽成计算、阶梯与特惠费率、固定交易费、边界防倒贴、预结算单计提、订单妥投就绪、出账打款、争议冻结与店铺指标汇总（12/12 通过）。
    2. `test/auth_shop_product.test.js`：涵盖密码加盐哈希防撞与时序保护、JWT 签发与防伪造校验、店铺创建、商品上架与库存原子扣减（5/5 通过）。
    3. `test/order_checkout_flow.test.js`：真实 HTTP 服务器环境下买卖双方完整端到端商业链路测试，包括跨店铺联合选品下单、自动按店铺拆分为 2 个独立子订单、预结算单自动计提、库存扣减、卖家发货、买家确认收货结算单流转为 ready、出账打款 settled、流水账本验证、健康检查（9/9 通过）。
  - **总计**：26 个测试用例，26 通过，0 失败，耗时约 1.5 秒。自测结论：**全部通过**。


- **主线复核（2026-11-17）**：主线重跑 `npm test` 原始输出为 tests 26 / pass 26 / fail 0（duration 约 1.6s），并逐文件核对：settlement 12、auth_shop_product 5、order_checkout_flow 9，合计 26，与总计一致（原记录 order 文件小计 8 系笔误，已更正为 9）。
