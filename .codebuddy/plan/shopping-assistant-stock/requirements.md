# 需求文档

## 引言

本文档定义了「购物助手」项目的库存查询与到货提醒功能需求。该项目基于 [Molt Bot Plugin](https://docs.molt.bot/plugin) 开发，帮助用户便捷地查询购物平台商品库存状态，并在商品到货时自动通知用户。

### 技术架构概述

采用 **Molt Bot Plugin** 架构设计：
- **Shopping Assistant Plugin**：购物助手插件，包含库存查询和到货提醒功能
- **Platform Adapters（内置模块）**：封装各平台 API 调用逻辑，支持多平台扩展
- **Molt Bot Cron Jobs**：负责定时触发轮询检测
- **Molt Bot 消息推送**：负责向用户发送到货通知

```
┌─────────────────────────────────────────────────────────────┐
│                      Molt Bot Platform                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐         ┌─────────────────────────┐   │
│  │   Cron Jobs     │ 定时触发 │    Message Push         │   │
│  │   (轮询调度)     │ ──────> │    (到货通知推送)        │   │
│  └─────────────────┘         └─────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│              Shopping Assistant Plugin                       │
│  ┌───────────────────┬─────────────────────────────────┐   │
│  │  Stock Check      │       Restock Alert             │   │
│  │  Tool             │       Tool                      │   │
│  │  (库存查询)        │  (订阅管理 + 到货检测)           │   │
│  └───────────────────┴─────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Platform Adapters                       │   │
│  │                 (平台适配器)                          │   │
│  ├─────────┬─────────┬─────────┬───────────────────────┤   │
│  │  一手   │   京东   │  拼多多  │         ...           │   │
│  └─────────┴─────────┴─────────┴───────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 功能调用关系

```
┌──────────────────────────────────────────────────────────────────┐
│                    Molt Bot Cron Jobs                            │
│                   (定时任务，按用户配置的间隔执行)                   │
│                            │                                     │
│                            ▼ 触发                                │
├──────────────────────────────────────────────────────────────────┤
│              Shopping Assistant Plugin                           │
│                                                                  │
│  ┌───────────────┐                    ┌─────────────────────┐   │
│  │ 检测时间范围   │  在有效时间内        │  Stock Check Tool   │   │
│  │ (是否在轮询    │ ─────────────────> │  (查询库存状态)      │   │
│  │  时间窗口内)   │                    └─────────────────────┘   │
│  └───────────────┘                              │                │
│         │ 不在时间范围内                          │ 返回库存状态    │
│         ▼                                       ▼                │
│  ┌───────────────┐                    ┌─────────────────────┐   │
│  │   跳过本次     │                    │   状态变化检测       │   │
│  │   检测        │                    │ (无货→有货)         │   │
│  └───────────────┘                    └─────────────────────┘   │
│                                                 │ 检测到到货     │
│                                                 ▼                │
│                                       ┌─────────────────────┐   │
│                                       │  Molt Bot 消息推送   │   │
│                                       │  (通知用户商品到货)   │   │
│                                       └─────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**核心流程说明**：
1. **Molt Bot Cron Jobs** 按照用户配置的轮询间隔定时触发插件的到货检测功能
2. 插件首先检查当前时间是否在用户设定的轮询时间范围内
3. 如果在有效时间范围内，则调用库存查询功能获取商品库存状态
4. 当检测到商品从"无货"变为"有货"时，通过 **Molt Bot 消息推送** 通知用户

### 项目结构

```
shopping-assistant/
├── src/
│   ├── index.ts                    # 插件入口，注册 Tools
│   ├── tools/
│   │   ├── stock-check.ts          # 库存查询 Tool
│   │   └── restock-alert.ts        # 到货提醒 Tool（订阅/取消/检测）
│   ├── adapters/
│   │   ├── types.ts                # 适配器类型定义
│   │   ├── base-adapter.ts         # 基础适配器抽象类
│   │   ├── yishou/                 # 一手适配器（首期实现）
│   │   │   ├── index.ts
│   │   │   ├── api.ts              # API 调用封装
│   │   │   └── types.ts            # 一手平台类型定义
│   │   └── index.ts                # 适配器注册与导出
│   ├── store/
│   │   └── subscription.ts         # 订阅数据存储
│   ├── utils/
│   │   ├── time.ts                 # 时间工具函数
│   │   └── http.ts                 # HTTP 请求工具
│   └── types.ts                    # 通用类型定义
├── package.json
├── tsconfig.json
└── README.md
```

---

## 需求

### 需求 1：库存查询功能

**用户故事：** 作为一名购物用户，我希望能够查询指定商品在购物平台上的库存状态，以便决定是否购买或等待补货。

#### 验收标准

1. WHEN 用户提供商品链接或商品ID THEN 系统 SHALL 解析出平台类型和商品标识
2. WHEN 用户请求查询库存 THEN 系统 SHALL 调用对应平台的适配器获取库存信息
3. WHEN 商品有货 THEN 系统 SHALL 返回库存状态为"有货"，并显示可购买数量（如平台支持）
4. WHEN 商品无货 THEN 系统 SHALL 返回库存状态为"无货"，并提示用户可以设置到货提醒
5. IF 用户指定了商品规格（SKU，如颜色、尺寸） THEN 系统 SHALL 查询该特定规格的库存状态
6. IF 平台暂不支持 THEN 系统 SHALL 返回明确的错误提示，说明当前支持的平台列表
7. IF 商品ID无效或商品不存在 THEN 系统 SHALL 返回"商品不存在"的错误提示

### 需求 2：到货提醒订阅功能

**用户故事：** 作为一名购物用户，我希望在商品无货时能够订阅到货提醒，以便在商品补货后第一时间收到通知。

#### 验收标准

1. WHEN 用户请求订阅到货提醒 THEN 系统 SHALL 记录订阅信息（平台、商品ID、SKU、用户标识、轮询配置）
2. WHEN 用户订阅成功 THEN 系统 SHALL 返回订阅确认信息，包含订阅ID，并在 Molt Bot 中创建对应的 Cron Job
3. IF 用户已订阅同一商品 THEN 系统 SHALL 提示"已存在相同订阅"，避免重复订阅
4. WHEN 用户请求查看订阅列表 THEN 系统 SHALL 返回该用户所有的到货提醒订阅
5. WHEN 用户请求取消订阅 THEN 系统 SHALL 删除对应的订阅记录、取消 Cron Job 并返回确认信息
6. IF 订阅ID不存在 THEN 系统 SHALL 返回"订阅不存在"的错误提示

### 需求 3：到货通知功能

**用户故事：** 作为一名已订阅到货提醒的用户，我希望在商品到货后能够及时收到通知，以便快速下单购买。

#### 验收标准

1. WHEN 系统检测到已订阅商品恢复有货状态 THEN 系统 SHALL 通过 Molt Bot 向订阅用户发送到货通知消息
2. WHEN 发送到货通知 THEN 系统 SHALL 包含商品名称、平台、商品链接、当前价格等关键信息
3. WHEN 通知发送成功 THEN 系统 SHALL 自动将该订阅标记为"已通知"状态，并停止该订阅的 Cron Job
4. IF 用户设置了多个规格的订阅 AND 其中部分规格到货 THEN 系统 SHALL 仅通知到货的规格
5. WHEN 执行库存检测 THEN 系统 SHALL 复用库存查询功能

### 需求 4：轮询配置功能

**用户故事：** 作为一名购物用户，我希望能够自定义到货检测的轮询间隔和执行时间范围，以便在合适的时间段内更高效地监控商品库存。

#### 验收标准

1. WHEN 用户创建订阅 THEN 系统 SHALL 支持设置自定义轮询间隔（单位：秒），并据此配置 Molt Bot Cron Job 的执行频率
2. IF 用户未指定轮询间隔 THEN 系统 SHALL 使用默认值 300 秒（5分钟）
3. IF 用户指定的轮询间隔小于 1 秒 THEN 系统 SHALL 拒绝并提示"轮询间隔不能小于 1 秒"
4. WHEN 用户创建订阅 THEN 系统 SHALL 支持设置轮询时间范围（开始时间、结束时间）
5. IF 用户设置了轮询时间范围 THEN 系统 SHALL 仅在该时间范围内执行库存检测
6. IF 当前时间不在轮询时间范围内 THEN 系统 SHALL 跳过本次检测，等待下一个有效时间窗口
7. IF 用户未设置轮询时间范围 THEN 系统 SHALL 全天候（24小时）执行检测
8. WHEN 用户修改订阅配置 THEN 系统 SHALL 支持更新轮询间隔和时间范围，并同步更新 Cron Job 配置

### 需求 5：平台适配器扩展性

**用户故事：** 作为一名开发者，我希望系统能够方便地扩展支持新的购物平台，以便后续接入更多平台。

#### 验收标准

1. WHEN 需要添加新平台支持 THEN 开发者 SHALL 只需实现 `PlatformAdapter` 接口并注册即可
2. WHEN 适配器注册完成 THEN 系统 SHALL 自动识别并支持该平台的库存查询
3. IF 适配器实现不完整 THEN 系统 SHALL 在编译期给出类型错误提示

---

## 技术规格

### Molt Bot Plugin 集成说明

基于 [Molt Bot Plugin 文档](https://docs.molt.bot/plugin) 开发：

#### Plugin 结构

```typescript
import { Plugin, Tool } from '@moltbot/sdk';

// 创建插件实例
const shoppingAssistant = new Plugin({
  name: 'shopping-assistant',
  description: '购物助手 - 支持库存查询和到货提醒',
  version: '1.0.0',
});

// 注册 Tool：库存查询
shoppingAssistant.registerTool(stockCheckTool);

// 注册 Tool：到货提醒（订阅/取消/检测）
shoppingAssistant.registerTool(restockAlertTool);

export default shoppingAssistant;
```

#### Cron Jobs（定时任务）

基于 Molt Bot Cron Jobs 实现轮询调度：

- **创建订阅时**：为每个订阅创建一个独立的 Cron Job，按照用户配置的轮询间隔执行
- **执行检测时**：Cron Job 触发到货检测逻辑
- **取消订阅时**：删除对应的 Cron Job

#### 消息推送

到货通知通过 Molt Bot 的消息推送功能发送给用户：

- **通知内容**：商品名称、货号、价格、库存状态、商品链接
- **通知时机**：当检测到商品从"无货"变为"有货"时立即推送

### 一手平台 API 说明

#### 商品详情接口

- **接口地址**：`POST https://api.yishouapp.com/goods/get_goods_info_v2`
- **Content-Type**：`application/x-www-form-urlencoded`

#### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| goods_id | string | 是 | 商品ID |
| goods_no | string | 否 | 商品货号 |
| uid | string | 是 | 用户ID |
| token | string | 是 | 用户Token |
| t_t | string | 是 | 时间戳 |
| sign | string | 是 | 签名（放在Header中） |

#### 请求头

| Header | 说明 |
|--------|------|
| sign | 请求签名 |
| Content-Type | application/x-www-form-urlencoded |

### 核心类型定义

```typescript
// ==================== 平台通用类型 ====================

// 支持的平台类型（首期仅支持一手）
type Platform = 'yishou' | 'jd' | 'pdd';

// 库存查询请求
interface StockCheckRequest {
  platform: Platform;
  productId: string;      // 商品ID（一手平台对应 goods_id）
  sku?: string;           // 可选的商品规格（颜色+尺码）
}

// 库存查询结果
interface StockCheckResult {
  platform: Platform;
  productId: string;
  productName: string;    // 商品名称
  productNo: string;      // 商品货号
  sku?: string;
  inStock: boolean;       // 是否有货
  price: number;          // 价格
  productUrl: string;     // 商品链接
  productImage: string;   // 商品主图
  message: string;        // 状态描述信息
}

// ==================== 一手平台专用类型 ====================

// 一手平台 API 响应（仅定义用到的字段）
interface YishouGoodsResponse {
  code: string;           // 响应码，"200" 表示成功
  msg: string;            // 响应消息
  data: YishouGoodsData;
}

// 一手商品数据（精简版，仅包含需要的字段）
interface YishouGoodsData {
  goods_id: string;           // 商品ID
  goods_no: string;           // 商品货号
  goods_name: string;         // 商品名称
  shop_price: string;         // 拿货价
  goods_thumb: string;        // 商品缩略图
  goods_status: string;       // 商品状态：1-正常，2-下架
  is_on_sale: string;         // 是否在售：1-在售，0-停售
  is_stockout: string;        // 是否缺货：1-缺货，0-有货
  color: string;              // 颜色（可能为空）
  size: string;               // 尺码（可能为空）
  remind_off_sale: string;    // 下架提示信息
}

// ==================== 轮询配置类型 ====================

// 轮询时间范围配置
interface PollingTimeRange {
  startTime: string;          // 格式: "HH:mm"，如 "09:00"
  endTime: string;            // 格式: "HH:mm"，如 "22:00"
}

// 轮询配置
interface PollingConfig {
  intervalSeconds: number;    // 轮询间隔（秒），默认 300，最小 1
  timeRange?: PollingTimeRange; // 可选的轮询时间范围，不设置则全天候轮询
}

// ==================== 订阅管理类型 ====================

// 到货提醒订阅
interface RestockSubscription {
  id: string;                 // 订阅ID
  cronJobId: string;          // Molt Bot Cron Job ID（用于管理定时任务）
  userId: string;             // 用户标识
  platform: Platform;         // 平台类型
  productId: string;          // 商品ID
  productName?: string;       // 商品名称（冗余存储，方便展示）
  productNo?: string;         // 商品货号
  sku?: string;               // 商品规格
  pollingConfig: PollingConfig; // 轮询配置
  status: 'active' | 'notified' | 'cancelled'; // 订阅状态
  lastCheckedAt?: Date;       // 上次检测时间
  lastStockStatus?: boolean;  // 上次库存状态（用于检测状态变化）
  createdAt: Date;            // 创建时间
  notifiedAt?: Date;          // 通知时间
}

// ==================== 通知类型 ====================

// 到货通知内容
interface RestockNotification {
  subscriptionId: string;     // 订阅ID
  userId: string;             // 用户标识
  productName: string;        // 商品名称
  productNo: string;          // 商品货号
  productUrl: string;         // 商品链接
  productImage: string;       // 商品图片
  price: number;              // 当前价格
  platform: string;           // 平台名称
  sku?: string;               // 商品规格
  message: string;            // 通知消息
}

// ==================== 平台适配器接口 ====================

// 平台适配器接口
interface PlatformAdapter {
  platform: Platform;
  checkStock(productId: string, sku?: string): Promise<StockCheckResult>;
}
```

### 库存状态判断逻辑

根据一手平台 API 响应，库存状态判断规则如下：

```typescript
// 判断商品是否有货
const isInStock = (data: YishouGoodsData): boolean => {
  // 以下任一条件满足则视为无货：
  // 1. is_stockout === "1"（缺货）
  // 2. is_on_sale === "0"（停售）
  // 3. goods_status === "2"（下架）
  
  if (data.is_stockout === "1") return false;
  if (data.is_on_sale === "0") return false;
  if (data.goods_status === "2") return false;
  
  return true;
};
```

### 首期实现范围

| 功能 | 首期支持 | 后续扩展 |
|------|---------|---------|
| 一手平台库存查询 | ✅ | - |
| 京东平台库存查询 | ❌ | ✅ |
| 拼多多平台库存查询 | ❌ | ✅ |
| 到货提醒订阅 | ✅ | - |
| 到货提醒取消 | ✅ | - |
| 到货通知（Molt Bot Cron Jobs） | ✅ | - |
| 到货通知（Molt Bot 消息推送） | ✅ | - |
| 自定义轮询间隔 | ✅ | - |
| 轮询时间范围设置 | ✅ | - |
| 到货通知（平台 Webhook） | ❌ | ✅ |

---

## 边界情况与限制

1. **API 限流**：平台可能对 API 请求频率有限制，需实现请求限流机制
2. **登录态**：一手平台需要 `uid`、`token`、`sign` 等认证参数，需要用户提供有效的登录凭证
3. **数据存储**：到货提醒订阅数据首期使用本地存储（JSON 文件或 SQLite），后续可扩展为数据库
4. **轮询间隔限制**：最小轮询间隔为 1 秒，避免设置为 0 导致的死循环
5. **订阅上限**：单用户订阅数量上限为 50 个，防止滥用
6. **时间范围校验**：开始时间必须早于结束时间，跨天时间范围（如 22:00 - 06:00）暂不支持
7. **签名机制**：一手平台请求需要携带 `sign` 签名，具体签名算法需根据抓包分析或官方文档确定
8. **Molt Bot 依赖**：轮询和通知功能依赖 Molt Bot 平台，需确保 Cron Jobs 和消息推送功能可用

---

## 成功标准

1. 用户能够成功查询一手平台商品的库存状态
2. 用户能够订阅/取消到货提醒，并自定义轮询配置
3. 商品到货时用户能够通过 Molt Bot 收到通知消息（在设定的时间范围内）
4. 系统架构支持后续扩展更多平台
