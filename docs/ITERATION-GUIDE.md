# 迭代指引

面向「接到一个需求，从哪下手、改完怎么验」的实操手册。
分层与「为什么这么拆」见 [ARCHITECTURE.md](./ARCHITECTURE.md)，一手接口细节见
[PROTOCOL-YISHOU.md](./PROTOCOL-YISHOU.md)。

## 一、一句话心智模型

> 一轮检测产出**状态**（`record.state`）→ `project()` 把状态投影成 **`TaskSummary`** →
> 前端只认 `TaskSummary` 渲染卡片。

所以改需求的判断顺序永远是：

1. 这是**状态**（要落盘、下次重启还要用）还是**投影**（算出来给人看的）？
2. 状态改 `kinds/<kind>.ts` 的 `create/run` 与 `kinds/state.ts` 的类型；
3. 投影改同一个文件里的 `project()`；
4. 只有需要新交互/新布局时才动 `components/task/*`。

## 二、常见需求 → 改哪里

| 需求 | 改动点 | 是否要迁移 |
|---|---|---|
| 卡片上多一个统计数字 | 在 `project()` 的 `stats` 里加 `{ key, label, value }` | 否 |
| 卡片上多一个标签（如「限定规格」） | 在 `project()` 的 `badges` 里加 `{ text, tone }` | 否 |
| 多一种历史记录 | `TaskEventType` 加类型 + `TASK_EVENT_LABELS` + `makeEvent()` 调用点 | 否 |
| 多一条强调提示 | `TaskNotice.type` 加枚举 + `project()` 返回 `notice` | 否 |
| 多一个可配置参数 | `kinds/state.ts` 的 `config` 加可选字段 + `create()` 解析 + `TaskConfigView` 加字段 | 否（可选字段） |
| 改变已有字段含义 / 结构 | 见第四节「schema 变更」 | **是** |
| 改文案 / 颜色 | `utils/taskFormat.ts` 或 `TaskEventList.vue` 的 tone 表 | 否 |
| 新增一类任务 | 见第三节 | 新表数据不需要 |
| 新增平台接口 | `src/adapters/yishou/endpoints.ts` + `index.ts` 方法 + `mappers.ts` | 否 |

判断「要不要迁移」的口径：**老任务的 `state` 还能不能被新代码正确读出**。
能 → 不改 `version`；不能 → 必须升版本 + 写迁移。

## 三、新增一类任务（以 `coupon` 为例）

一次改动 4 个文件 + 5 个 3 行路由，引擎、前端卡片、列表页都不用动。

### 1. 状态类型 `web/server/tasks/kinds/state.ts`

```ts
export interface CouponTaskState {
  product: { id: string; name: string; productNo?: string }
  config: { interval: number; duration: number }
  checkCount: number
  detectedCount: number
  events: TaskEvent[]
  lastError?: string
}
```

约定：所有业务字段都放 `state`，**不要**往 record 顶层加字段（顶层是引擎的壳）。

### 2. definition `web/server/tasks/kinds/coupon.ts`

```ts
const KIND: TaskKind = 'coupon'
const VERSION = 2
const MAX_EVENTS = 50
const LIST_EVENT_LIMIT = 5

export const couponDefinition: TaskKindDefinition<CouponTaskState> = {
  kind: KIND,
  label: '优惠券监控',
  version: VERSION,
  requiresAuth: () => true,

  create({ body }) {
    if (!body?.productId) throw new TaskApiError(ErrorCode.INVALID_PARAMS, '缺少商品')
    return {
      state: {
        product: { id: String(body.productId), name: String(body.productName ?? '') },
        config: {
          interval: num(body?.config?.interval, 300),
          duration: num(body?.config?.duration, 3 * 60 * 60),
        },
        checkCount: 0,
        detectedCount: 0,
        events: [],
      },
    }
  },

  run(record, ctx) {
    const state = record.state
    const runner = createCancellableXxx(/* … */, progress => {
      state.checkCount = progress.checkCount
      ctx.save()                     // 只能这么落盘
    })
    return runner
  },

  project(record, options = {}) {
    const state = record.state
    return {
      id: record.id,
      kind: KIND,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      target: { type: 'product', id: state.product.id, name: state.product.name },
      badges: [],
      stats: [{ key: 'checks', label: '次检测', value: state.checkCount }],
      config: { interval: state.config.interval, duration: state.config.duration },
      events: options.full ? state.events : state.events.slice(0, LIST_EVENT_LIMIT),
      eventCount: state.events.length,
      order: null,
      notice: null,
      ...(state.lastError ? { lastError: state.lastError } : {}),
    } satisfies TaskSummary
  },

  restart(record) {
    return { state: { ...record.state, checkCount: 0, detectedCount: 0, events: [] } }
  },

  durationOf: record => record.state.config.duration,
}
```

要点：

- `TaskKind` 是联合类型，加值只改 `src/contract/task.ts` 的类型，`tasks.kind` 是 TEXT 列，**不需要 DB 迁移**。
- `project()` 必须是纯函数：不读库、不发请求、不读时间以外的外部状态。
- 事件用 `makeEvent(type, {...})` + `capEvents(events, 50)`，同样的 `type + 秒` 自动去重。
- 每个事件必须带**唯一** `id`（含业务主键 + 时间），否则第二次回调会把新记录覆盖掉。
- `events` 列表只回最近 5 条，`eventCount` 回总数；卡片上的「查看全部」走 `status` 接口拿全量，
  所以 `project` 里两者都要给。

### 3. 注册 `web/server/tasks/kinds/index.ts`

```ts
export const couponRegistry = new TaskRegistry<CouponTaskState>('coupon')
export const couponService = new TaskService(couponDefinition, couponRegistry)
export const taskServices = [stockService, priceService, tabService, renewService, couponService]
```

`taskServices` 决定进程启动时恢复哪些任务，**漏加就会「重启后任务不见了」**。

### 4. 路由（每文件 3 行）

```ts
// web/server/api/coupon-monitor/list.get.ts
import { listTaskHandler } from '../../tasks/engine/handlers'
import { couponService } from '../../tasks/kinds'
export default listTaskHandler(couponService)
```

`list` / `status` / `delete` / `restart` 四个照抄，`create` 用 `createTaskHandler(couponService)`。
需要「用户显式选账号」时才写专用创建路由（参考 `api/order-renew/create.post.ts`）。

### 5. 前端（通常零改动）

列表页三行即可复用：

```vue
<TaskCard v-for="task in tasks" :key="task.id" :task="task" :busy="busyId === task.id"
          @restart="handleRestart" @delete="handleDelete" />
```

需要 kind 专属动作时，用 `#actions` 插槽（参考 Tab 的「累计商品」）。
只有出现**新的目标类型**才动 `TaskTarget.vue`；新的布局才新建组件。

## 四、schema 变更（必须迁移）

什么时候算变更：改了 `state` 的字段名/结构、删除字段、或语义变了导致老数据读出来是错的。

三步：

### 1. 升版本

`kinds/<kind>.ts` 顶部 `const VERSION = 3`（现在是 2）。
`service.list` 会过滤 `version < definition.version` 的任务，所以**升级后老任务会从列表消失**，
迁移脚本跑完才回来——这是有意的，避免未迁移数据把页面打崩。

### 2. 写迁移 `web/server/tasks/engine/legacy-migrate.ts`

```ts
const migrateCoupon = (raw: Raw): MigratedTask => ({
  state: {
    product: { id: str(raw.productId), name: str(raw.productName) },
    config: { interval: num(raw.config?.interval, 300), duration: num(raw.config?.duration, 10800) },
    checkCount: num(raw.checkCount),
    detectedCount: num(raw.detectedCount),
    events: arr(raw.changes).map(toEvent),
  },
  secret: raw.config?.adapterConfig ?? null,
  accountId: str(raw.accountId),
})
```

三条硬约束，`legacy-migrate.test.ts` 会验：

- **幂等**：同一份输入跑两次结果一致（`version >= 2` 的行直接跳过）。
- **不抛错**：字段缺失/类型不对就降级成空值，绝不 `throw`，否则一条脏数据能卡死整个迁移。
- **凭证搬家**：老 payload 里的 `config.adapterConfig` 要提到 `secret`，并从 `state` 里删掉。

### 3. 试跑 → 应用

```
# 造一份样本库，先在本地把四类任务都跑一遍
npx tsx scripts/migrate-tasks-v2.ts --db /tmp/mig-test.db --dry-run
npx tsx scripts/migrate-tasks-v2.ts --db /tmp/mig-test.db --apply
npx tsx scripts/migrate-tasks-v2.ts --db /tmp/mig-test.db --dry-run   # 应全部「跳过」
```

`--apply` 前会 `VACUUM INTO` 出一份备份，幂等所以可以重复执行。
线上顺序：**先跑迁移，再重启服务**（否则新代码看不到老任务）。

## 五、测试怎么加

`vitest` 分三层，跟着改动落点选：

| 层 | 位置 | 覆盖什么 |
|---|---|---|
| 核心库 | `src/*.test.ts` | 监控循环、下单编排、签名/协议纯函数 |
| 引擎 | `web/server/tasks/engine/*.test.ts` | 迁移（幂等/降级）、视图事件截断 |
| 任务种类 | `web/server/tasks/kinds/project.test.ts` | 四类 `project()` 的字段与「不含凭证」 |

常用命令：

```
npx vitest run                       # 全量（约 366 例）
npx vitest run web/server/tasks      # 只跑引擎相关
npx vue-tsc --noEmit -p web/tsconfig.json    # 前端类型
npm run web:build                    # 产物必须能构建
```

改 `project()` 时补一条断言到 `kinds/project.test.ts`：**字段必须出现在期望位置，且序列化后不含 `adapterConfig`**。

## 六、提交与发布

```
npm run web:build
npx vitest run
bash deploy.sh upload      # 同步到 .output.next，再原子切换
bash deploy.sh restart
```

发布检查清单：

1. `npx tsx scripts/migrate-tasks-v2.ts --dry-run` 是否还有待迁移行（有就先 `--apply`）。
2. `.output.prev` 是否存在（回滚点）。
3. 重启后 `pm2 logs` 里 `[Restore] 已续跑任务：…` 是否与预期一致。
4. 四个列表页各看一眼：卡片、事件、操作按钮。
5. 老任务是否都在（被版本过滤掉说明迁移没跑）。

## 七、不要做的事

| 反模式 | 为什么 |
|---|---|
| 在 `api/*.ts` 里存 Map / 启动循环 | 路由会被拆成独立 chunk，状态会在热更新和重启后消失 |
| 在 `kinds` 里直接读写 SQLite | 节流、事务、退出刷盘只有 `store.ts` 一处能做对 |
| 给 `TaskSummary` 加 `Record<string, any>` 之类的兜底 | 契约一松，前端就又开始各写一套 DTO |
| 在 `project()` 里发请求 / 读当前账号 | 投影必须是纯函数，否则列表页一次渲染打十几个请求 |
| 把 `secret` 塞进 `state` | 会随列表接口发给浏览器 |
| 为了一个字段新建 `useXxxTasks` | 用 `useTaskList` + `project()` 的 `stats` |
| 迁移脚本里 `throw` | 一条脏数据会中断整批，宁可降级为空 |
| 重启时删除原任务却不 `abort` | 旧循环继续跑，会重复下单/重复发邮件 |
