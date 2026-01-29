# 实施计划：Nuxt.js 库存监控前端

## 任务清单

- [ ] 1. 初始化 Nuxt.js 项目结构
  - 在项目根目录创建 `web/` 文件夹
  - 使用 `nuxi init` 初始化 Nuxt 3 项目
  - 配置 `nuxt.config.ts`：TypeScript、路径别名 `@/`
  - 安装并配置 TailwindCSS
  - 配置根目录 `package.json` workspaces 以支持 monorepo
  - _需求：1.1, 1.2, 1.4_

- [ ] 2. 创建基础 UI 组件库
  - 2.1 创建 `components/ui/Button.vue` 按钮组件（支持 variant、size、loading 状态）
  - 2.2 创建 `components/ui/Input.vue` 输入框组件（支持 label、error 提示）
  - 2.3 创建 `components/ui/Card.vue` 卡片组件
  - 2.4 创建 `components/ui/Badge.vue` 徽章组件（用于库存状态标识）
  - 2.5 创建 `components/ui/Toast.vue` 提示组件及 composable
  - 2.6 创建 `components/ui/Skeleton.vue` 骨架屏组件
  - _需求：6.1, 6.2, 6.3, 6.4_

- [ ] 3. 实现布局组件和应用框架
  - 3.1 创建 `components/layout/Header.vue` 头部导航组件
  - 3.2 创建 `components/layout/Sidebar.vue` 侧边栏组件（包含导航菜单）
  - 3.3 创建 `layouts/default.vue` 默认布局（整合 Header + Sidebar）
  - 3.4 创建 `app.vue` 应用入口，配置全局样式
  - _需求：6.5_

- [ ] 4. 实现用户配置管理功能
  - 4.1 创建 `types/index.ts` 定义前端类型（UserConfig、ApiResponse 等）
  - 4.2 创建 `stores/config.ts` Pinia 状态仓库（管理 uid、token、openid 等配置）
  - 4.3 创建 `composables/useConfig.ts` 组合式函数（封装配置读写、校验、持久化逻辑）
  - 4.4 创建 `pages/settings.vue` 配置页面（表单输入、保存、敏感信息隐藏显示）
  - _需求：2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 5. 实现 Server API 路由层
  - 5.1 创建 `server/api/stock/check.post.ts` 库存查询 API（调用核心库 `checkStock`）
  - 5.2 创建 `server/api/stock/skus/[productNo].get.ts` SKU 查询 API（调用核心库 `getProductSkus`）
  - 5.3 创建 `server/api/collection/index.get.ts` 收藏夹查询 API（调用核心库 `checkCollectionStock`）
  - 5.4 创建统一响应格式工具函数 `server/utils/response.ts`
  - _需求：7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 1.3_

- [ ] 6. 实现库存业务组件
  - 6.1 创建 `components/stock/StockStatus.vue` 库存状态展示组件（有货绿色/无货红色）
  - 6.2 创建 `components/stock/ProductCard.vue` 商品卡片组件（图片、名称、价格、状态）
  - 6.3 创建 `components/stock/SkuTable.vue` SKU 列表表格组件（支持颜色筛选、行高亮）
  - _需求：3.3, 3.4, 4.3, 4.4, 4.5, 6.6_

- [ ] 7. 实现单品库存查询页面
  - 7.1 创建 `composables/useStock.ts` 组合式函数（封装库存查询、SKU 查询逻辑）
  - 7.2 创建 `pages/stock/check.vue` 库存查询页面（搜索框、查询按钮、结果展示）
  - 7.3 实现查询加载状态和错误处理
  - 7.4 实现点击商品卡片跳转到 SKU 详情页
  - _需求：3.1, 3.2, 3.5, 3.6_

- [ ] 8. 实现商品 SKU 详情页面
  - 8.1 创建 `pages/stock/[productNo].vue` SKU 详情页面
  - 8.2 实现商品基本信息展示区域（名称、价格、销量、主图）
  - 8.3 实现 SKU 表格展示及颜色筛选功能
  - 8.4 实现限购数量提示
  - _需求：4.1, 4.2, 4.6, 4.7_

- [ ] 9. 实现收藏夹库存监控页面
  - 9.1 创建 `composables/useCollection.ts` 组合式函数（封装收藏夹查询、分页逻辑）
  - 9.2 创建 `pages/collection/index.vue` 收藏夹页面
  - 9.3 实现有货/无货分组展示（有货优先显示）
  - 9.4 实现分页加载功能（每页 20 条）
  - 9.5 实现点击商品跳转到 SKU 详情页
  - _需求：5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [ ] 10. 实现首页仪表盘和边界情况处理
  - 10.1 创建 `pages/index.vue` 首页（快捷入口、使用说明）
  - 10.2 实现配置缺失时的引导提示
  - 10.3 实现网络异常时的重试机制
  - 10.4 实现空数据状态展示组件
  - 10.5 实现响应式布局适配（移动端优化）
  - _需求：2.1, 2.3, 边界情况 1-4_
