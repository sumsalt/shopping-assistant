# 需求文档：Nuxt.js 库存监控前端

## 引言

本项目旨在基于 Nuxt.js 框架构建一个库存监控前端应用，用于操作和展示商品库存信息。该前端将调用已有的 `shopping-assistant` 核心库，提供用户友好的界面来进行库存查询、收藏夹监控和商品 SKU 查看等功能。

### 技术选型
- **框架**: Nuxt.js 3.x (Vue 3 + TypeScript)
- **样式**: TailwindCSS
- **UI 组件**: Shadcn-vue / Radix Vue
- **状态管理**: Pinia
- **HTTP 请求**: 核心库已封装，前端通过 API 路由调用

### 推荐项目结构

```
shopping-assistant/
├── src/                          # 现有核心库（保持不变）
│   ├── adapters/
│   ├── utils/
│   ├── types.ts
│   ├── stock-check.ts
│   └── index.ts
│
├── web/                          # Nuxt.js 前端应用（新增）
│   ├── nuxt.config.ts           # Nuxt 配置
│   ├── app.vue                  # 应用入口
│   ├── pages/                   # 页面目录
│   │   ├── index.vue           # 首页/仪表盘
│   │   ├── stock/              # 库存相关页面
│   │   │   ├── check.vue       # 单品库存查询
│   │   │   └── [productNo].vue # 商品SKU详情
│   │   ├── collection/         # 收藏夹相关
│   │   │   └── index.vue       # 收藏夹监控
│   │   └── settings.vue        # 配置页面
│   │
│   ├── components/              # 可复用组件
│   │   ├── ui/                  # 基础UI组件
│   │   │   ├── Button.vue
│   │   │   ├── Input.vue
│   │   │   ├── Card.vue
│   │   │   └── Badge.vue
│   │   ├── stock/              # 库存业务组件
│   │   │   ├── StockStatus.vue # 库存状态展示
│   │   │   ├── SkuTable.vue    # SKU列表表格
│   │   │   └── ProductCard.vue # 商品卡片
│   │   └── layout/             # 布局组件
│   │       ├── Header.vue
│   │       ├── Sidebar.vue
│   │       └── Footer.vue
│   │
│   ├── composables/            # 组合式函数
│   │   ├── useStock.ts         # 库存查询逻辑
│   │   ├── useCollection.ts    # 收藏夹逻辑
│   │   └── useConfig.ts        # 配置管理
│   │
│   ├── server/                 # Nuxt Server API
│   │   └── api/
│   │       ├── stock/
│   │       │   ├── check.post.ts      # 库存查询API
│   │       │   └── skus/[productNo].get.ts # SKU查询API
│   │       └── collection/
│   │           └── index.get.ts       # 收藏夹查询API
│   │
│   ├── stores/                 # Pinia 状态仓库
│   │   ├── config.ts           # 用户配置
│   │   └── stock.ts            # 库存数据缓存
│   │
│   ├── types/                  # 前端类型定义
│   │   └── index.ts
│   │
│   ├── assets/                 # 静态资源
│   │   └── css/
│   │       └── tailwind.css
│   │
│   └── public/                 # 公共资源
│       └── favicon.ico
│
├── package.json                # 根目录 package.json（monorepo 管理）
└── tsconfig.json
```

---

## 需求

### 需求 1：项目结构与基础框架

**用户故事：** 作为一名开发者，我希望有一个清晰、合理的项目结构，以便能够快速上手开发和维护代码。

#### 验收标准

1. WHEN 初始化项目 THEN 系统 SHALL 创建 `web/` 目录作为 Nuxt.js 前端根目录，与现有 `src/` 核心库平级
2. WHEN 配置 Nuxt THEN 系统 SHALL 正确配置 TypeScript、TailwindCSS、路径别名（`@/` 指向 `web/`）
3. WHEN 引用核心库 THEN 系统 SHALL 能够在 `server/api/` 中直接导入并使用 `../../../src` 中的核心函数
4. IF 使用 monorepo 结构 THEN 系统 SHALL 在根目录 `package.json` 中配置 workspaces 管理依赖

---

### 需求 2：用户配置管理

**用户故事：** 作为一名用户，我希望能够配置并保存我的平台认证信息（如 uid、token、openid 等），以便系统能够代我查询库存。

#### 验收标准

1. WHEN 首次访问应用 THEN 系统 SHALL 引导用户进入配置页面填写必要参数
2. WHEN 用户填写配置并保存 THEN 系统 SHALL 将配置持久化存储到 localStorage
3. WHEN 配置信息缺失或无效 THEN 系统 SHALL 在调用 API 前提示用户补全配置
4. IF 用户修改配置 THEN 系统 SHALL 立即更新内存中的状态并同步到存储
5. WHEN 用户查看配置 THEN 系统 SHALL 对敏感信息（如 token）进行部分隐藏显示

#### 配置字段
- `uid`: 用户 ID
- `token`: 用户 Token
- `openid`: 微信 OpenID
- `model`: 设备型号
- `version`: 版本号
- `version_name`: 版本名称
- `wx_version_name`: 微信版本名称（可选）

---

### 需求 3：单品库存查询

**用户故事：** 作为一名用户，我希望能够输入商品 ID 或货号来查询单个商品的库存状态，以便快速了解商品是否有货。

#### 验收标准

1. WHEN 用户输入商品 ID/货号并点击查询 THEN 系统 SHALL 调用 `checkStock` API 并展示库存状态
2. WHEN 查询成功 THEN 系统 SHALL 显示商品名称、价格、库存状态（有货/无货）、商品图片
3. WHEN 商品有货 THEN 系统 SHALL 以绿色标识显示"有货"状态
4. WHEN 商品无货 THEN 系统 SHALL 以红色标识显示"无货"状态，并显示具体原因
5. IF 查询失败 THEN 系统 SHALL 显示友好的错误提示信息
6. WHEN 用户点击商品卡片 THEN 系统 SHALL 跳转到商品 SKU 详情页

---

### 需求 4：商品 SKU 详情查看

**用户故事：** 作为一名用户，我希望能够查看商品的所有 SKU（颜色、尺码）的库存详情，以便选择我需要的规格。

#### 验收标准

1. WHEN 用户访问 SKU 详情页 THEN 系统 SHALL 调用 `getProductSkus` API 获取完整 SKU 信息
2. WHEN 数据加载完成 THEN 系统 SHALL 展示商品基本信息（名称、价格、总销量）
3. WHEN 展示 SKU 列表 THEN 系统 SHALL 以表格形式展示每个 SKU 的颜色、尺码、库存数量、是否有货
4. WHEN SKU 有货 THEN 系统 SHALL 以绿色背景高亮显示该行
5. WHEN SKU 无货 THEN 系统 SHALL 以灰色背景显示该行并标记"缺货"
6. IF 存在限购 THEN 系统 SHALL 显示限购数量提示
7. WHEN 用户筛选颜色 THEN 系统 SHALL 只显示该颜色下的所有尺码

---

### 需求 5：收藏夹库存监控

**用户故事：** 作为一名用户，我希望能够监控我收藏夹中所有商品的库存状态，以便及时发现补货的商品。

#### 验收标准

1. WHEN 用户访问收藏夹页面 THEN 系统 SHALL 调用 `checkCollectionStock` API 获取收藏夹商品列表
2. WHEN 数据加载完成 THEN 系统 SHALL 分组展示有货商品和无货商品
3. WHEN 展示商品列表 THEN 系统 SHALL 以卡片形式展示商品图片、名称、价格、库存状态
4. WHEN 有货商品存在 THEN 系统 SHALL 优先展示有货商品并以醒目样式标识
5. IF 列表过长 THEN 系统 SHALL 支持分页加载（每页 20 条）
6. WHEN 用户点击商品卡片 THEN 系统 SHALL 跳转到商品 SKU 详情页
7. WHEN 用户刷新页面 THEN 系统 SHALL 重新获取最新库存状态

---

### 需求 6：UI/UX 设计规范

**用户故事：** 作为一名用户，我希望应用界面美观、响应迅速，以便获得良好的使用体验。

#### 验收标准

1. WHEN 用户访问任意页面 THEN 系统 SHALL 在 200ms 内完成首屏渲染（骨架屏）
2. WHEN 数据加载中 THEN 系统 SHALL 显示加载指示器（Skeleton 或 Spinner）
3. WHEN 操作成功 THEN 系统 SHALL 使用 Toast 组件显示成功提示
4. WHEN 操作失败 THEN 系统 SHALL 使用 Toast 组件显示错误提示
5. IF 用户使用移动设备访问 THEN 系统 SHALL 提供响应式布局适配
6. WHEN 展示库存状态 THEN 系统 SHALL 使用统一的颜色规范：
   - 有货：绿色 (`text-green-500`)
   - 无货：红色 (`text-red-500`)
   - 加载中：灰色 (`text-gray-400`)

---

### 需求 7：API 路由设计

**用户故事：** 作为一名开发者，我希望 API 路由设计清晰、RESTful，以便前后端协作和后期维护。

#### 验收标准

1. WHEN 调用库存查询 THEN 系统 SHALL 提供 `POST /api/stock/check` 接口
2. WHEN 调用 SKU 查询 THEN 系统 SHALL 提供 `GET /api/stock/skus/:productNo` 接口
3. WHEN 调用收藏夹查询 THEN 系统 SHALL 提供 `GET /api/collection?page=1&pageSize=20` 接口
4. IF API 调用成功 THEN 系统 SHALL 返回统一格式 `{ success: true, data: {...} }`
5. IF API 调用失败 THEN 系统 SHALL 返回统一格式 `{ success: false, error: { code: string, message: string } }`
6. WHEN Server API 处理请求 THEN 系统 SHALL 直接调用核心库函数，不重复封装 HTTP 请求逻辑

---

## 边界情况与技术限制

### 边界情况
1. **网络异常**：API 请求超时或网络断开时，应显示重试按钮
2. **Token 过期**：当 API 返回认证错误时，应引导用户重新配置
3. **商品不存在**：查询的商品 ID/货号不存在时，应显示友好提示
4. **空数据状态**：收藏夹为空或搜索无结果时，应显示空状态插图

### 技术限制
1. 核心库使用 `spark-md5` 计算签名，需确保在 Node.js Server 端可用
2. 一手平台 API 存在请求频率限制，前端应避免频繁重复请求
3. 配置信息存储在 localStorage，清除浏览器数据会导致配置丢失

---

## 成功标准

1. 用户能够在 5 秒内完成配置并开始使用
2. 单品库存查询响应时间 < 2 秒
3. 收藏夹页面支持平滑滚动和分页加载
4. 应用在主流浏览器（Chrome、Safari、Firefox）正常运行
5. 代码结构清晰，符合 Nuxt.js 最佳实践
