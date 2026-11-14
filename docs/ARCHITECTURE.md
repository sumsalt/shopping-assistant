# 架构说明

> 第一次接手先看 [HANDOFF.md](../HANDOFF.md)：运行、部署、页面清单与已知坑都在那里。

本文记录系统的分层、依赖规则，以及「为什么这样拆」。改动代码前先读这里；
新增一类任务 / 改一个字段的实操步骤见 [ITERATION-GUIDE.md](./ITERATION-GUIDE.md)；
一手接口的签名、下单与续期链路见 [PROTOCOL-YISHOU.md](./PROTOCOL-YISHOU.md)。

## 一、这次重构解决了什么

改造前的症状是「一个很小的需求也要改四五个地方」，根因只有一句：**同一份任务数据被手抄了四遍**。

```
Result（核心库） → TaskRecord（服务端） → listView / statusView → 前端 DTO → 模板
```

每加一个字段（比如「最后检测时间」），要在四层各加一次，任何一层漏改就是线上空白或 `undefined`。
除此之外还有三处结构性浪费：

| 问题 | 改造前 | 改造后 |
|---|---|---|
| 视图投影 | 每类任务各写 `listView` / `statusView`，字段名互不相同 | 一个 `project()`，列表与详情共用同一结构 |
| 任务定义 | `TaskDefinition` 是个 9 方法的「上帝接口」，实现方大量空实现 | `TaskKindDefinition` 只保留 4 个必需钩子，其余按需实现 |
| 凭证 | `adapterConfig` 混在 payload 里，跟着状态轮询一起下发 | 单独的 `secret` 列，`project()` 永远拿不到 |
| 事件（历史记录） | 价格变化 / 到货 / 下单 / 续期各有一套记录结构与渲染 | 一种 `TaskEvent`，一个 `TaskEventList` |

现在的形状：**一种任务数据 = `TaskSummary`，三端共用一份类型**。

## 二、分层

```
┌──────────────────────────────────────────────────────────────┐
│ web/pages · web/components        Vue 页面与组件（只渲染）      │
├──────────────────────────────────────────────────────────────┤
│ web/composables                   UI 状态与请求编排            │
│   useTaskList  useAutoOrderForm  useTabSeen  useXxx           │
├──────────────────────────────────────────────────────────────┤
│ web/server/api                    HTTP 编解码（每文件 3 行）    │
├──────────────────────────────────────────────────────────────┤
│ web/server/tasks/kinds            每类任务一个 definition      │
├──────────────────────────────────────────────────────────────┤
│ web/server/tasks/engine           任务引擎（store/registry/    │
│                                   service/handlers）           │
├──────────────────────────────────────────────────────────────┤
│ src/contract                      三端共用的纯类型（无运行时代码）│
├──────────────────────────────────────────────────────────────┤
│ src/                              平台无关的监控内核            │
│   stock-monitor / tab-list-monitor / price-monitor /           │
│   order-renew-monitor / auto-order / email / monitor/loop      │
├──────────────────────────────────────────────────────────────┤
│ src/adapters/yishou               一手平台适配（见协议文档）     │
└──────────────────────────────────────────────────────────────┘
```

依赖只能向下：

- `src/contract` 只允许 `import type`，**不 import 任何实现**，这样服务端、前端、单测都能安全引用。
- `engine` 不知道具体任务类型（泛型 `S`），也读不到业务字段；它只做「存 / 取 / 跑 / 投影」。
- `kinds` 只能通过 `TaskRunContext` 落盘（`ctx.save()`），**不允许自己持 Map、自己写 SQL**。
- `api/` 不能成为模块：任何状态、Map、启动函数都放在 `tasks/` 或 `utils/`。
- 页面不拼请求参数，也不持有账号凭证：只传业务参数，凭证由服务端按当前账号解析。

## 三、契约层（`src/contract`）

三端唯一的类型来源，共三个文件：

| 文件 | 内容 |
|---|---|
| `platform.ts` | `Platform`、`AdapterConfig`、`ProductRef`、`AccountRef`、`TaskTarget` |
| `order.ts` | `AutoOrderView`（展示）/ `AutoOrderPolicy`（落盘）、`OrderBrief`、`PrecheckView` |
| `task.ts` | `TaskSummary`、`TaskEvent`、`TaskNotice`、`TaskConfigView`、各接口 payload |

核心是 `TaskSummary`：**列表、详情、创建响应都是它**，唯一区别是 `events` 的条数。

```ts
interface TaskSummary {
  id: string
  kind: 'stock' | 'price' | 'tab' | 'renew'
  status: 'running' | 'stopped' | 'completed'
  createdAt: string
  target: TaskTarget        // 商品 / Tab / 账号
  badges: TaskBadge[]       // 自动下单、限定规格、逐轮对比……
  stats: TaskStat[]         // 次检测 / 次提醒 / 本轮抓取 / 已记录商品
  config: TaskConfigView    // 间隔、时长、策略（只读投影）
  events: TaskEvent[]       // 最近 5 条（详情返回全部，上限 50）
  order?: OrderBrief | null
  notice?: TaskNotice | null
  lastError?: string
}
```

两条硬规则：

1. **前端不再定义任务 DTO**。要展示新字段，就在 `project()` 里加到 `badges` / `stats` / `config`，
   前端按 `key` 渲染，不需要改类型。
2. **`secret` 不进 `TaskSummary`**。`TaskRecordBase` 上虽有 `secret`，但 `project()` 的入参只声明
   `record.state`，从类型上就拿不到凭证。

## 四、任务引擎（`web/server/tasks/engine`）

引擎把「所有任务都一样」的部分收干净，共四个文件：

| 文件 | 职责 | 约束 |
|---|---|---|
| `store.ts` | 唯一的 SQL 入口：读写 `tasks` 表、1 秒节流落盘、退出刷盘 | 别处不允许写 SQL |
| `registry.ts` | 内存态：`Map<id, record>`、`AbortController`、启动/停止 | 只碰 store，不碰业务 |
| `service.ts` | 编排：创建、启动、列表、详情、删除、重启、进程启动恢复 | 唯一同时碰 registry 与 store 的地方 |
| `handlers.ts` | 5 个通用路由处理器，统一 `{ task }` / `{ tasks, total }` | 不含业务判断 |

### 数据模型

`tasks` 表只存「任务壳 + 状态快照」：

| 列 | 说明 |
|---|---|
| `id` / `kind` / `user_id` / `user_email` | 任务壳 |
| `status` / `created_at` / `updated_at` | 状态与时间 |
| `version` | payload schema 版本，与 `definition.version` 对应 |
| `payload` | `{ version, state, accountId }`（业务状态整体序列化） |
| `secret` | 创建时固化的 `AdapterConfig`，**永不外发** |

`version < definition.version` 的任务不会出现在列表里（`service.list` 过滤），避免未迁移数据把页面打崩。
迁移用离线脚本，不做读取时懒迁移：

```
npx tsx scripts/migrate-tasks-v2.ts --dry-run   # 默认，只统计
npx tsx scripts/migrate-tasks-v2.ts --apply     # 先 VACUUM INTO 备份，再逐行改
```

`legacy-migrate.ts` 是纯函数：幂等（`version >= 2` 直接跳过）、不抛错（坏字段降级为空）、可单测。

### 状态与事件

- 状态只有三态：`running` / `stopped` / `completed`。「休眠中」「等待规格」这类是**展示态**，
  由 `badges` / `notice` 表达，不占状态位。
- 所有历史记录收敛成 `TaskEvent`（10 种类型），同类型同秒自动去重，列表取最近 5 条、详情上限 50。
- 需要用户注意但不算历史的事（等待规格、到价无货、下单失败）走 `TaskNotice`，不进事件流。

## 五、任务种类（`web/server/tasks/kinds`）

一类任务 = 一个 `TaskKindDefinition<S>` + 一行注册。definition 的钩子：

| 钩子 | 必需 | 作用 |
|---|---|---|
| `requiresAuth(body)` | 是 | 创建时是否需要登录态，决定解析完整快照还是匿名快照 |
| `create(input)` | 是 | 校验输入、建立基线，返回 `{ state }` |
| `run(record, ctx)` | 是 | 启动循环，返回 `{ controller, promise }`；进度只能 `ctx.save()` |
| `project(record, opts)` | 是 | 唯一的视图投影，纯函数 |
| `restart(record)` | 是 | 以原任务为模板生成新状态 |
| `durationOf(record)` | 是 | 计算剩余时长（重启恢复用） |
| `activeWindowOf` / `uniqueness` / `restore` / `canRestore` / `resolveAccount` / `removeOriginalOnRestart` | 否 | 生效时段、创建查重、续跑校正、显式选账号 |

四类任务的差异都写在 definition 里，引擎完全不知道它们的业务字段：

| kind | 循环 | 特色钩子 |
|---|---|---|
| `stock` | `createCancellableMonitor` | `uniqueness`：同商品同规格只允许一个运行中任务 |
| `price` | `createCancellablePriceMonitor` | 自动下单策略 + 到价无货提示 |
| `tab` | `createCancellableTabMonitor` | `activeWindowOf`（休眠不消耗时长）、已见集合 + 每日重建 |
| `renew` | `createCancellableOrderRenewMonitor` | `resolveAccount`（用户显式选账号）、`canRestore`、`removeOriginalOnRestart` |

新增一类任务 = 一个 definition 文件 + `kinds/index.ts` 注册 + 5 个 3 行路由，引擎与前端都不用动。
详细步骤见 [ITERATION-GUIDE.md](./ITERATION-GUIDE.md)。

### 统一循环

`src/monitor/loop.ts` 的 `runMonitorLoop` 负责「多久跑一轮、什么时候停、出错怎么办」，
四类任务共用：间隔与最小间隔、总时长、jitter、可被 abort 打断的 sleep、
`shouldStop` 提前收敛、异常策略（继续 / `'fatal'` 中止）。
任务 definition 只实现「跑一轮」这一件事。

## 六、前端

| 位置 | 职责 |
|---|---|
| `components/task/TaskCard.vue` | 唯一的任务卡片：状态、目标、badges、stats、事件、操作 |
| `components/task/TaskEventList.vue` | 唯一的事件列表，按 `tone` 上色 |
| `components/task/TaskTarget.vue` | 目标展示，商品有货号时跳 `/stock/{productNo}` |
| `composables/useTaskList.ts` | 四类任务列表页共用：加载 / 删除 / 重启 / busy |
| `composables/useAutoOrderForm.ts` | 价格与到货监控共用的自动下单表单（件数、地址、规格、预检） |
| `composables/useTabSeen.ts` | Tab 累计商品分页查询 |
| `utils/taskFormat.ts` | 状态文案、相对时间、金额、时长的唯一实现 |

四个列表页（`/monitor`、`/price-monitor`、`/tab-monitor`、`/order-renew`）只剩三件事：
页头、加载/错误/空态、`<TaskCard>`。kind 专属动作通过 `#actions` 插槽挂载
（Tab 的「累计商品」、续期的「新建任务」）。

新增展示字段时：改 `project()` 的 `stats` / `badges`，页面不用改；
只有需要新交互或新布局时才动组件。

## 七、账号与凭证

一个账号 = 一次抓包的完整请求快照，存在服务端 `accounts.request_profile`。

- `accounts.is_active`：每个登录用户至多一条为 1；`POST /api/accounts/active` 设置 / 清除。
- 前端只拿脱敏摘要（`GET /api/accounts/active`：手机号、uin、通道、`hasCredential`），
  **不持有 uid/token，也不回传 adapterConfig**。
- 所有业务接口统一走 `resolveAdapterConfigForUser(username, needAuth)`。
- 纯组装逻辑在 `src/adapter-config.ts`（有单测），服务端只负责读库。

适配器配置解析（`needAuth`）与凭证校验：

| 场景 | needAuth | 说明 |
|---|---|---|
| 库存查询 / 关键词搜索（手动 API） | true | 原样回放当前账号快照，不主动剔除 uid/token；**不校验凭证**，账号没有登录态也能查（价格降级为「游客参考价」或隐藏） |
| SKU 详情 / 收藏夹 / 订单列表 / 价格监控 / 下单 | true | 需要凭证，无凭证直接返回 `AUTH_REQUIRED`，不等一手 201 |
| Tab 监控（后台任务） | false | 剔除 uid/token，走匿名限流桶 |
| 到货监控 | 仅自动下单时 true | 凭证只给下单链路；检测阶段在 `stock-monitor` 内再匿名化 |

> 「不剔除登录态」与「必须有登录态」是两回事：查询类接口只保证不主动摘掉账号快照里的
> uid/token，是否真的带凭证由用户选的账号决定；下单、价格监控等链路则必须校验凭证。

**任务固化创建时的凭证**：之后切换账号不影响已创建任务；重启沿用原 `secret`，要换账号请新建任务。
凭证只写 `secret` 列，不随列表/状态接口下发。

## 八、边界与已知取舍

- 当前账号与代理都是服务端状态，前端不再持有请求快照；旧版 localStorage 会在首次打开时
  一次性迁移（账号 id + 代理），迁移后删键。
- 代理是**全局**运行设置（影响服务器出网），不按登录用户隔离；多用户共用同一出口。
- 抓包快照原样回放，只覆盖动态 `t_t`；不对 `udid` 是否必需做猜测。
- `sign` 服务端当前不校验，但保留生成逻辑以兼容网关变化。
- 任务详情不会下发凭证（创建时固化在 `secret` 列），凭证不随状态轮询传播。
- **历史任务没有货号**时，前端降级为不可点、不显示「查看详情」，不做实时解析或回填
  （与 Tab 累计商品的降级口径一致）。
- **匿名检测的价格口径**（后台到货检测仍匿名；手动库存查询不主动剔除登录态，账号没凭证时同样按游客口径降级）：一手对游客把
  `shop_price` 返回成 `??.??`，但 `alone_price`（单独购买价）仍是真实可售价格。
  映射层按 `shop_price → alone_price` 顺序取值，回退时打上 `priceNote: '游客参考价'`，
  页面与邮件都会标注。
- `minPrice` / `maxPrice` 是**传给一手接口的筛选参数**，不是本地过滤。

## 九、部署

```
npm run web:build            # 产物在 web/.output
bash deploy.sh upload        # 同步到 .output.next，再原子切换成 .output
bash deploy.sh restart       # pm2 startOrReload（保留环境变量）
```

**不要直接 `rsync --delete` 覆盖运行中的 `.output`**：旧进程持有的文件被就地替换后，
可能加载到新旧混合的 chunk，表现为「`xxx is not a function`」这类与代码不符的运行时错误。
`deploy.sh upload` 已是「同步到 `.output.next` → `mv` 原子切换」，并保留 `.output.prev` 作为回滚点。

数据库 `data/tasks.db` 不在 `.output` 内，不会被覆盖；`tasks.version` / `tasks.secret` /
`accounts.request_profile` 等列在服务启动时幂等补齐（`PRAGMA table_info` 判断后 `ALTER TABLE`）。
