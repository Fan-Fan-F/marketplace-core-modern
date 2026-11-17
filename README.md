# Marketplace Core Modern (市集核心底座与卖家结算分账系统)

> 现代化多供应商电商市集底座，内置跨店铺联合拆单结算与高内聚、可复用的独立卖家分账引擎。  
> A modern multi-vendor marketplace core platform featuring cross-vendor checkout, automatic order splitting, and an extensible standalone settlement & split billing engine.

---

## 🇨🇳 中文说明

### 功能与改进点（与原设计思路的关系）

本项目属于 **B 路线（按思路与功能设计重写，代码全部独立实现）**。参考了经典多供应商市集原型系统的功能设计，针对其技术栈严重陈旧、代码与单体 MongoDB/Stripe 深度强耦合、缺乏多商户联合拆单以及没有独立分账流水等痛点，进行了彻底的现代化重构与架构升级：

1. **可复用的独立卖家结算与分账引擎 (`SettlementEngine`)**：
   - 告别对特定第三方支付网关 SDK 的散乱硬编码依赖，封装为高内聚、可独立抽离在其他电商系统复用的业务引擎。
   - 支持平台可配置抽成比例（默认 10%）、店铺级 VIP 优惠费率覆盖、以及每笔订单固定交易手续费。
   - 完备的结算单生命周期管理：已计提（`accrued`，支持 Escrow 争议锁定期防售后退款） $\rightarrow$ 待结算（`ready`，订单妥投后就绪） $\rightarrow$ 打款完成（`settled`，出账冲销流水记录） $\rightarrow$ 争议冻结（`disputed`）。
2. **多供应商联合下单与自动拆单机制 (Order Splitting)**：
   - 买家可在一个购物车内添加来自不同商家的商品进行联合结账；
   - 系统原子化校验并扣减各商品库存，自动按商家拆分为多个独立的子订单（Sub-Orders）；
   - 各入驻商家拥有独立的履约与发货面板，各子订单独立流转物流单号与收发状态，不互相干扰。
3. **轻量、零外部数据库依赖与极速冷启动**：
   - 原生支持零外部繁琐配置即可运行的轻量存储层，无需单独部署 MongoDB 实例即可开箱即测。
   - 初次冷启动自动安全注入演示商户、演示商品及初始用户，支持秒级体验全链路商业闭环。
4. **开箱即用的现代化控制台前端**：
   - 内置响应式、无外部 CDN/npm 构建依赖的交互式 Web 控制台（商城选品、商家履约、分账结算大盘、分账试算模拟器）。
5. **健壮的现代化代码架构与测试覆盖**：
   - 原生支持 Node.js 18+ / 20+ / 22+ / 24+，采用清晰分层架构（`core/`、`modules/`、`public/`、`test/`）。
   - 内置 26 项端到端业务与单元测试用例，`npm test` 自动化断言 100% 通过。

---

### 快速开始

#### 环境要求
- Node.js >= 18.0.0
- npm >= 9.0.0

#### 1. 安装依赖
```bash
npm install
```

#### 2. 运行自动化测试套件
```bash
npm test
```

#### 3. 启动开发与生产服务
```bash
npm start
```
启动后终端将输出监听地址，在浏览器中打开：
```
http://localhost:3000
```
即可直接体验跨店铺选品下单、商家发货、买家确认送达以及卖家结算出账的全流程演示。

#### 4. 环境配置参数（可选）
支持通过环境变量注入系统配置，所有敏感项均支持占位符重载：

| 环境变量 | 说明 | 示例 / 默认值 |
| :--- | :--- | :--- |
| `PORT` | HTTP 服务监听端口 | `3000` |
| `NODE_ENV` | 运行环境模式 (`development` / `production`) | `development` |
| `JWT_SECRET` | 用户身份验证 JWT 密钥 | `<your-jwt-secret>` |
| `JWT_EXPIRES_IN` | 令牌过期时效 | `24h` |
| `DATA_PATH` | 数据存储目录路径 | `./.data` |

---

### 来源与致谢

本项目基于 [mern-marketplace](https://github.com/shamahoque/mern-marketplace) 二次开发，原项目由 shamahoque 以 MIT 许可证开源；本仓库为独立实现的重写版本，同样以 MIT 许可证发布。

---

### 许可证

沿用原项目 MIT 许可证开源，全文详见根目录 [LICENSE](LICENSE)。

---

## 🇬🇧 English Documentation

### Features & Architectural Highlights

This repository is developed under **Route B (rebuilt from scratch based on conceptual designs with 100% independent code)**. Inspired by the functional architecture of multi-vendor marketplace prototypes, this project completely redesigns the core engine into a modern, decoupled platform:

1. **Reusable Standalone Settlement & Split Billing Engine (`SettlementEngine`)**:
   - Decoupled from rigid payment gateway vendor lock-in. Can be imported as an independent module.
   - Configurable commission structures: platform baseline take rates, vendor-specific VIP rates, and fixed per-order fees.
   - Comprehensive statement lifecycles: `accrued` (under escrow lock) $\rightarrow$ `ready` (upon delivery) $\rightarrow$ `settled` (disbursed) $\rightarrow$ `disputed` (chargeback protection).
2. **Unified Cart & Vendor Order Splitting**:
   - Buyers can check out items from multiple independent vendors in a single master transaction.
   - Atomic inventory deduction ensures zero overselling. Orders are cleanly partitioned into vendor-owned sub-orders for independent logistics and tracking.
3. **Zero External Database Configuration**:
   - Embedded storage abstraction eliminates the need for separate MongoDB clusters for local preview and testing.
   - Includes automatic seed data for demo shops, products, and user accounts.
4. **Out-of-the-Box Web Console & Storefront**:
   - Responsive, zero-build client dashboard to demonstrate cross-vendor purchasing, seller fulfillment, and settlement ledger tracking.
5. **Modern Test Suite**:
   - Powered by Node.js native test runner. 26 comprehensive automated test cases with 100% pass rate.

---

### Quick Start

#### Requirements
- Node.js >= 18.0.0
- npm >= 9.0.0

#### 1. Installation
```bash
npm install
```

#### 2. Run Test Suite
```bash
npm test
```

#### 3. Start the Server
```bash
npm start
```
Open your browser and navigate to:
```
http://localhost:3000
```

#### 4. Configuration

| Environment Variable | Description | Default / Placeholder |
| :--- | :--- | :--- |
| `PORT` | Listening port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `JWT_SECRET` | Secret key for JWT signing | `<your-jwt-secret>` |
| `JWT_EXPIRES_IN` | Token duration | `24h` |
| `DATA_PATH` | Path for data persistence | `./.data` |

---

### Attribution & Acknowledgements

本项目基于 [mern-marketplace](https://github.com/shamahoque/mern-marketplace) 二次开发，原项目由 shamahoque 以 MIT 许可证开源；本仓库为独立实现的重写版本，同样以 MIT 许可证发布。  
*(The architectural ideas and functional requirements of this project were inspired by [mern-marketplace](https://github.com/shamahoque/mern-marketplace); all code was independently written from scratch.)*

---

### License

Released under the MIT License. See [LICENSE](LICENSE) for details.
