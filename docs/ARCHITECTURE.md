# 架构说明

本文记录系统的分层、依赖规则，以及「为什么这样拆」。改动代码前先读这里，避免把已经收敛的逻辑重新打散。

## 一、分层

```
┌─────────────────────────────────────────────────────────┐
│ web/pages · web/components          Vue 页面与组件        │
├─────────────────────────────────────────────────────────┤
│ web/composables                     UI 状态与请求编排     │
│   useTaskCollection  useXxxTasks  useXxx  useConfig      │
├─────────────────────────────────────────────────────────┤
│ web/utils                           纯前端逻辑（可单测）   │
│   adapterConfig  yishou-capture  taskFormat              │
├─────────────────────────────────────────────────────────┤
│ web/server/api                      HTTP 编解码（薄壳）    │
├─────────────────────────────────────────────────────────┤
│ web/server/tasks                    任务定义与生命周期     │
│   handlers  registry  stock / tab / price                │
├─────────────────────────────────────────────────────────┤
│ web/server/utils                    存储 / 会话 / 校验     │
├─────────────────────────────────────────────────────────┤
│ src/                                平台无关的监控内核     │
│   stock-monitor / tab-list-monitor / price-monitor       │
│   auto-order / email                                     │
├─────────────────────────────────────────────────────────┤
│ src/adapters/yishou                 一手平台适配          │
│   profile → client → order-api → adapter → mappers       │
└─────────────────────────────────────────────────────────┘
```

依赖只能向下，不能反向：

- 路由不能成为模块。**任何状态、Map、启动函数都不允许写在 `api/` 里**，只能放在 `server/tasks` 或 `server/utils`。
- `src/` 不感知 HTTP、Cookie、SQLite、Vue。
- 页面不拼请求参数，统一走 composable + `buildAdapterConfig`。

## 二、平台适配层（`src/adapters/yishou`）

一次需求（兼容 wx / App 抓包）把原来 1110 行的单体适配器拆成五层，每层只做一件事：

| 文件 | 职责 | 关键约束 |
|---|---|---|
| `endpoints.ts` | 接口地址常量 | 只有 URL，没有逻辑 |
| `profile.ts` | 账号 → 请求档案 | **唯一的参数/通道/签名真相** |
| `client.ts` | 发请求、签名、代理、闸门、错误映射 | 所有接口共用一份实现 |
| `order-api.ts` | 下单链路 | 必须登录 + `skipGate` |
| `mappers.ts` | 原始响应 → 领域模型 | 纯函数，无 IO |
| `index.ts` | `YishouAdapter` | 每个方法 ≤ 5 行 |

`profile.ts` 是这层的核心。改造前三层回退（`config.x || 快照.x || 默认值`）散落在 8 个方法里，
通道差异（UA / `t_t` 单位 / 签名首段）也要每次判断；现在在 `resolveRequestProfile` 里解析一次，
产出不可变的 `RequestProfile`：

```ts
interface RequestProfile {
  channel: 'wx' | 'app'
  params: Readonly<Record<string, string>>   // 已剔除 t_t / sign
  headers: Readonly<Record<string, string>>  // 已补齐 UA
  proxyUrl?: string
  uid: string; token: string; hasAuth: boolean
  captured: boolean
  timestamp(): number   // App 秒级，wx 毫秒级
  sign(t_t): string
}
```

新增接口时只需：

```ts
const data = await this.client.post<RawType>(EP.XXX, { biz_param: value });
return mapXxx(data);
```

不要在适配器里重新拼公共参数或请求头——那正是这次重构消掉的重复。

**匿名链路**：`buildAdapterConfig(config, false)` 会剔除 `uid`/`token`，`profile.hasAuth` 为 false。
适配器不会补出 `uid=undefined`（`URLSearchParams` 会把它序列化成字符串，一手会判为无效凭证）。

## 三、任务层（`web/server/tasks`）

三类监控的生命周期完全一致，差异只在「创建时校验什么」和「怎么跑一轮」。

```
TaskDefinition<R>          create / start / restart / restore / listView / statusView
TaskRegistry<R>            内存 Map + SQLite 落盘 + controller + 状态流转 + 列表合并
handlers.ts                5 个通用路由处理器（鉴权、所有权、错误映射）
stock.ts / tab.ts / price.ts   只实现上面两个接口
```

因此：

- 15 个路由文件各 3 行，没有业务逻辑，也不持有状态。
- 重启后续跑只有一份实现（`plugins/restore-tasks.ts` 负责算剩余时长，`definition.restore` 负责怎么续）。
- 新增一类监控 = 一个 definition + 5 个 3 行路由 + 在 `tasks/index.ts` 注册。

约定：

1. 创建 / 重启时 `definition.start` 负责把 `config.taskId` 设成 `record.id`。
2. 进度更新用 `registry.touch(record)`（1 秒节流落盘），状态变更用 `registry.add` 或 `launch` 的收尾逻辑。
3. 业务失败抛 `TaskApiError(code, message)`，不要自己拼 `createErrorResponse`。
4. 落盘 payload 形状不能随意改：老任务要靠它续跑。新增字段必须可选、有默认值。

## 四、账号与凭证

一个账号 = 一次抓包的完整请求快照：

```ts
interface RequestProfile {
  channel: 'wx' | 'app'
  params: Record<string, string>   // 公共参数（uid/token/udid/model/...）
  headers: Record<string, string>  // UA / Content-Type / equipmd5 ...
  path?: string
}
```

- 抓包解析：`web/utils/yishou-capture.ts`（wx / App 双通道，纯函数，有单测）。
- 前端组装：`web/utils/adapterConfig.ts#buildAdapterConfig(config, needAuth)`，**唯一出口**。
- 服务端归一化：`web/server/utils/adapterConfig.ts`，兼容旧散字段 URL。
- 匿名检测（库存查询、到货监控、Tab 监控）传 `needAuth=false`；
  需要登录态（SKU 详情、收藏夹、价格监控、下单）传 `true`。

新增需要发请求的功能时，不要从 `configStore` 里翻 `uid/token`，一律走 `buildAdapterConfig`。

## 五、前端

- `useTaskCollection<T>`：列表 / 删除 / 重启 / 轮询的唯一实现。
- `useMonitorTasks` / `useTabMonitorTasks` / `usePriceMonitorTasks`：类型 + 专属方法（薄壳）。
- `web/utils/taskFormat.ts`：状态文案、相对时间、金额、时长的唯一实现。

## 六、边界与已知取舍

- 服务端不保存「当前使用账号」，它属于浏览器本地配置（与旧系统配置同安全边界）。
- 抓包快照原样回放，只覆盖动态 `t_t`；不对 `udid` 是否必需做猜测。
- `sign` 服务端当前不校验，但保留生成逻辑以兼容网关变化。
- 任务状态接口会返回该任务的 `config.adapterConfig`（仅本人可读），包含登录态凭证。
