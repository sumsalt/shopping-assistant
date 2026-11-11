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
- 页面不拼请求参数，也不持有账号凭证：只传业务参数，账号快照由服务端按当前账号解析。

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

**匿名链路**：`buildAdapterConfigFromProfile(profile, false)` 会剔除 `uid`/`token`，`profile.hasAuth` 为 false。
适配器不会补出 `uid=undefined`（`URLSearchParams` 会把它序列化成字符串，一手会判为无效凭证）。

### 一手请求契约（实测结论，改动前务必对照）

这些结论来自《接口请求字段与签名实测指南》《接口分析-小程序vsApp》的对照实验，
`profile.ts` 与 `yishou-capture.ts` 的实现都以此为准：

| 结论 | 影响 |
|---|---|
| `uid` + `token` + `udid` **三元绑定**，任一不匹配只回 `201 请登录`，不区分是哪个错了 | 复用 token 必须连带复用它登录时的 udid；不要自己编 udid |
| 可匿名接口（`get_goods_info_v2`）不报错，只把 `shop_price` 降级成 `??.??` | 「任务在跑但价格全是问号」= 登录态失效，用自检接口确认 |
| App 通道硬门槛：`udid` + `plat_type=Android` + `model` + `version` + `version_name` + `t_t` + `okhttp/x.y.z` UA | 缺任一项网关直接 **404**（空 body，不是 JSON） |
| UA 与 `plat_type` 必须匹配 | 微信 UA + `plat_type=Android` 同样 404 |
| `version` 在 App 通道是 **Android SDK 版本**（如 `29`），不是 App 版本 | 填 `7.65.00` 会 404 |
| `t_t` 必须 **10 位秒级**数字 | App 用 `Math.floor(Date.now()/1000)`，wx 用毫秒 |
| 签名 `md5(md5(udid + model + version + version_name) + t_t)`，**`model` 用 URL 编码后的值** | `profile.encodeFormComponent` 等价 OkHttp：`! ' ( ) *` 也要编码 |
| 服务端当前**不校验** `sign`，也不校验 `equipmd5` | 仍需正确实现，避免名单未来生效时突然全线失败 |
| RSA 动态包装只作用于 `_api_need_sign` 名单（`setpoint` / `address` 增改），**下单链路不在名单内** | 不需要实现 RSA，`sign` 头即可 |
| `create_order_v4` 的 `pay_params` 是**小程序跳转参数**（`userName` + `path`），不是 App prepay 五元组 | 服务端只能建单锁库存，付款必须人工 |
| `pay_tool`：`1` = 支付宝、`4` = 微信（以 `confirm` 返回的 `pay_tool_list` 为准） | 配置项不可用时回落到微信，再回落到第一个 |
| `selected` 必须是 `confirm` 返回的 `stock[]` 全字段（去掉嵌套对象） | 只传 `{sku,num}` 会 500，并留下 3–5 分钟锁单 |

账号卡片上的「校验登录态」就是把这些「静默失败」变成一条明确结论：
`POST /api/accounts/verify` → `checkYishouAuth` → `/users/get_user_info`。

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

一个账号 = 一次抓包的完整请求快照，存在服务端 `accounts.request_profile`：

```ts
interface RequestProfile {
  channel: 'wx' | 'app'
  params: Record<string, string>   // 公共参数（uid/token/udid/model/...）
  headers: Record<string, string>  // UA / Content-Type / equipmd5 ...
  path?: string
}
```

### 当前账号是服务端状态

- `accounts.is_active`：每个登录用户至多一条为 1；`POST /api/accounts/active` 设置 / 清除。
- 前端只拿脱敏摘要（`GET /api/accounts/active`：手机号、uin、通道、`hasCredential`），
  **不再持有 uid/token，也不再回传 adapterConfig**。
- 所有业务接口统一走 `resolveAdapterConfigForUser(username, needAuth)`：
  取当前账号快照 → `buildAdapterConfigFromProfile` 组装 → 叠加服务端代理。
- 纯组装逻辑在 `src/adapter-config.ts`（有单测），服务端只负责读库。

需要登录态的链路：

| 场景 | needAuth | 说明 |
|---|---|---|
| 库存查询 / Tab 监控 | false | 剔除 uid/token，走匿名限流桶 |
| 到货监控 | 仅自动下单时 true | 凭证只给下单链路；检测阶段在 `stock-monitor` 内再匿名化 |
| SKU 详情 / 收藏夹 / 价格监控 / 下单 | true | 无凭证直接返回 `AUTH_REQUIRED`，不等一手 201 |

**任务会固化创建时的快照**：之后切换账号不影响已创建任务；重启沿用原快照，
要换账号请新建任务。

### 请求闸门（分桶）

后台任务的出网请求统一在 `src/utils/http.ts` 排队，分桶键是 `accountKey`：

| `accountKey` | 桶 | 默认间隔 | 谁在用 |
|---|---|---|---|
| 有值（账号 uid） | `auth:<uid>` | 15s | 价格监控（登录态） |
| 空 | `anon`（全局单桶） | 1s | 到货检测、Tab 监控 |

`accountKey` 是「按谁的身份限流」的标识，不是凭证本身：同一 uid 的多个任务共享
15 秒配额，避免同一账号被并发打爆；不传则进全局匿名桶，所有匿名任务共享
1 秒一个槽位，按 `taskId` 轮转。用户手动操作不经过闸门（没有任务上下文）。

**到货检测是双重匿名**：`createStockGateContext` 不传 `accountKey`（排匿名桶），
`toAnonymousAdapterConfig` 同时剔除顶层和快照里的 `uid/token`（请求本身也不带身份）。
凭证只交给 `YishouOrderApi`，那条链路 `skipGate`（抢库存不排队）、超时 20 秒。
代价是检测价格回退 `alone_price`，邮件带「游客参考价」标注。

### 抓包存什么

不是整条请求全存，而是「跨接口稳定的公共参数 + 关键请求头」白名单
（`web/utils/yishou-capture.ts`）：

- **参数**：登录态（`uid` `token` `openid` `udid` `device_id`）、签名原料与网关门槛
  （`model` `version` `version_name` `plat_type`）、版本冗余、设备信息、其余公共参数。
- **丢弃**：`t_t` / `sign`（每次请求重新生成），以及全部业务参数
  （`goods_id`、`rec_ids`、`selected`、`tabId`、`page` ...）。
- **请求头**：只留 `User-Agent`、`Content-Type`、`Accept-Encoding`、`equipmd5`、
  `Referer`、`X-Forwarded-For`；`Host` / `Content-Length` 由框架生成。

为什么用白名单而不是「存全部、发请求时再挑」：不同接口的业务参数完全不同，
白名单保证同一份快照能安全复用到任意接口；漏掉的公共参数只会少发一个字段，
不会把 `goods_id` 之类的业务值带到别的接口上。参数个数在账号卡片里可见。

登录态自检：`POST /api/accounts/verify` → `checkYishouAuth`，用 `/users/get_user_info`
探针，只有 200 才说明这份抓包还能用。

## 五、前端

- `useTaskCollection<T>`：列表 / 删除 / 重启 / 轮询的唯一实现。
- `useMonitorTasks` / `useTabMonitorTasks` / `usePriceMonitorTasks`：类型 + 专属方法（薄壳）。
- `web/utils/taskFormat.ts`：状态文案、相对时间、金额、时长的唯一实现。

## 六、边界与已知取舍

- 当前账号与代理都是服务端状态，前端不再持有请求快照；旧版 localStorage 会在首次打开时
  一次性迁移（账号 id + 代理），迁移后删键。
- 代理是**全局**运行设置（影响服务器出网），不按登录用户隔离；多用户共用同一出口。
- 抓包快照原样回放，只覆盖动态 `t_t`；不对 `udid` 是否必需做猜测。
- `sign` 服务端当前不校验，但保留生成逻辑以兼容网关变化。
- 任务详情不会下发 `config.adapterConfig`（创建时固化在服务端），凭证不随状态轮询传播。
- **匿名查询的价格口径**：一手对游客把 `shop_price` 返回成 `??.??`，但 `alone_price`
  （单独购买价）仍是真实可售价格，实测与登录态拿货价同值。映射层按
  `shop_price → alone_price` 顺序取值，回退时给结果打上 `priceNote: '游客参考价'`，
  页面与到货邮件都会标注，避免被当成拿货价拿去比价。
  库存判断不受影响（监控只看是否有货）；价格监控要求登录态，不会走这条回退。
- `minPrice` / `maxPrice` 是**传给一手接口的筛选参数**，不是本地过滤，因此游客态的价格 0
  不会导致本地误过滤；若一手在游客态不按价格筛选，属于服务端行为。

## 七、部署

```
npm run web:build            # 产物在 web/.output
bash deploy.sh upload        # 同步到 .output.next，再原子切换成 .output
bash deploy.sh restart       # pm2 startOrReload（读 ecosystem，保留环境变量）
```

**不要直接 `rsync --delete` 覆盖运行中的 `.output`**：旧进程持有的文件被就地替换后，
可能加载到新旧混合的 chunk，表现为「`xxx is not a function`」这类与代码不符的运行时错误。
`deploy.sh upload` 已改为「同步到 `.output.next` → `mv` 原子切换」，并保留 `.output.prev` 作为回滚点。

数据库 `data/tasks.db` 不在 `.output` 内，不会被覆盖；`accounts.request_profile` 列在服务启动时幂等补齐。


