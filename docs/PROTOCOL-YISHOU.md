# 一手（Yishou）平台协议

这里只放「和一手服务端打交道」的知识：适配层怎么分层、请求怎么签、下单与续期的真实链路、
分页与筛选参数的坑、抓包白名单。

任务是**怎么调度**的请看 [ARCHITECTURE.md](./ARCHITECTURE.md)，任务状态怎么落盘、事件怎么发
请看 [ITERATION-GUIDE.md](./ITERATION-GUIDE.md)。协议结论都来自真实抓包与真实账号验证，
改动链路前请先对照本文件，不要凭猜测改参数。

## 一、适配层分层

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

## 二、接口契约与链路

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
| 签名 `md5(md5(udid + model + version + version_name) + t_t)`，**Android 的 `model` 用 URL 编码后的值、iOS 用未编码原值** | Android 由 OkHttp 拦截器签编码值（`! ' ( ) *` 也要编码）；iOS 自己拼 body 签原值，见 `profile.ts` 的 `isIosCapture` |
| 服务端当前**不校验** `sign`，也不校验 `equipmd5` | 仍需正确实现，避免名单未来生效时突然全线失败 |
| RSA 动态包装只作用于 `_api_need_sign` 名单（`setpoint` / `address` 增改），**下单链路不在名单内** | 不需要实现 RSA，`sign` 头即可 |
| iOS App 签名 `md5(md5(udid + model + version + version_name) + t_t)` 里 **`model` 用未编码原值**（Android 用编码值） | 用 iOS 抓包 `iPhone 14 Pro` 精确复现 sign `eead42af…` |
| `create_order_v4` 的 `pay_params` 是**小程序跳转参数**（`userName` + `path`），不是 App prepay 五元组 | 服务端只能建单锁库存，付款必须人工 |
| `pay_tool`：`1` = 支付宝、`4` = 微信（以 `confirm` 返回的 `pay_tool[]` 为准） | 配置项不可用时回落到微信，再回落到第一个 |
| create 响应的 `pay_tool` 是**内部渠道码**（实测 `12`），真正支付方式是 `current_pay_tool`（实测 `1`） | 结果里的支付方式取 `current_pay_tool`，别用 `pay_tool` |
| create 响应**直接返回 `order_amount`**（实测 `43.19` = 商品 37.19 + 运费 6） | 不必回查详情拿金额，详情只用来补支付截止时间 |

账号卡片上的「校验登录态」就是把这些「静默失败」变成一条明确结论：
`POST /api/accounts/verify` → `checkYishouAuth` → `/users/get_user_info`。

### 下单链路对齐抓包（2026-11 真实账号验证）

`src/auto-order.ts`（编排层，只做业务决策）与 `src/adapters/yishou/{order-api,checkout}.ts`（协议层）
分层，编排层只表达「买哪些规格、几件、用哪个地址」，不感知任何 selected 结构：

```
地址 → SKU → prepareCheckout（协议层一次做完）→ createOrder
prepareCheckout = add_cart_goods_info → add_goods_to_cart → get_carts_by_supply
                 → cart/activities → confirm_order_v4
```

四个接口的 `selected` 结构各不相同，全部收敛在 `checkout.ts` 的纯函数里（契约单测锁死）：

| 接口 | selected 形态 | 关键 |
|---|---|---|
| `add_goods_to_cart` | 按颜色分组 `color+item[]`，item 复用商品详情原始规格 | 保险开关 `is_select_*_insurance=2`（不投保）、`source=3`、`add_cart_id` |
| `cart/activities` | `select_goods` 按商品分组 | 算折，失败不阻断主链路 |
| `confirm_order_v4` | sku 级明细，**带 `cart_id`** | `cart_id` 只能来自 `get_carts_by_supply` 的 `detail[]` |
| `create_order_v4` | sku 级明细，**带 `from`/`piece_together_num`、不带 `cart_id`** | 补齐 `selected_express`（取 confirm 的 `express_options_v2` 里 `selected:"1"` 项）、`rsa`、`pay_id`、`user_address_tag` |

**根因修复**：旧实现全链路只用简化 `[{sku,num}]` 结算，服务端返回的 `stock[].cart_id` 是假值 `"0"`，
建单时又把这个 0 原样回传。真实账号验证确认：带 `cart_id` 的结算返回真值（如 `1278423441`）。
端到端真实建单成功（`order_sn=12641615382582`，¥43.19，`wait_pay`），订单列表可回查。

**跳过的不必要接口**（结果不被后续消费）：`goods_activities`、`get_add_cart_recommend`、
`Goods/get_cart_recommend`、`get_carts_filter`、`get_pinkage_activity`、
`get_order_advanced_check_list`、`piece_together/*`、重复的 `add_cart_goods_info`。

### 待支付订单续期链路（2026-11 抓包 + 真实账号验证）

一手待支付订单的支付有效期是 **20 分钟**，到期自动关闭；App 的「重新提交支付」
会把有效期**重置为「当前时刻 + 20 分钟」**，而不是「旧截止时间 + 20 分钟」。
续期不新建订单、不扣款，只刷新 `cancel_expire`，付款仍需人工完成。

抓包的 4 个请求按 `t_t` 排序的真实顺序是 `1.1 → 1.2 → 1.3 → 1.4`（上传顺序是乱的）：

| 步骤 | 接口 | 作用 | 是否采用 |
|---|---|---|---|
| 1.1 | `POST /order/confirm_wait_pay_order` | 重新拉结算上下文：`stock[]` / `default_address` / `order_remark` / `pay_tool[]` / `express_options_v2[]` / `cancel_expire` / `current_timestamp` | 采用 |
| 1.2 | `POST /order/get_order_advanced_check_list` | 高级校验清单 | 跳过：结果不被 1.4 消费 |
| 1.3 | `POST /piece_together/check_piece_together_data` | 拼单数据校验 | 跳过：同上 |
| 1.4 | `POST /order/reload_wait_pay_order` | 真正刷新有效期 | 采用 |

只保留 **1.1 + 1.4**：1.2 / 1.3 的响应没有被 1.4 的请求体引用，多发两次只会增加风控面。
真实账号验证（线上 `15928169484`，订单 `12641615428606`，¥43.19）证明两步即可把
`cancel_expire - current_timestamp` 刷回 `1200`。第一次 E2E 看起来「只后移 3 秒」，
是因为刚建单 3 秒就 reload；追加滚动探针（等待 9 秒后再 reload）确认
`expireMinusNowSeconds=1200`、`remainAfter > remainBefore`、`resetsToFull20Minutes=true`。

**1.4 请求关键点**（`src/adapters/yishou/renew.ts` 纯函数，契约单测锁死）：

- `order_sn` 用原单号；**没有 `pay_id`**（与建单 `create_order_v4` 的最大差异）。
- `selected` 直接复用 `checkout.ts` 的 `buildCreateSelected(stock)`：sku 级 9 字段，
  **不带 `cart_id`**，带 `from=""` / `piece_together_num="0"`。
- `selected_express` 取 1.1 的 `express_options_v2` 里 `selected:"1"` 项
  （实测 `[{origin:"2",express_id:"9999"}]`）；无快递选项时跳过该单并告警，不发 reload。
- `advanced_check_selected` 是**精确两个换行的字符串** `'[\n\n]'`，不是 `'[]'`。
- 固定值：`is_balance_pay=0`、`user_address_tag=0`、`app_code=0`。
- `rsa.previous_vc_sorce = 'YiShou.MyOrderViewController'`（来源页是「我的订单」，
  与建单的「进货车」不同）。`buildReloadRsa()` 与 `buildRsa()` **并列但互不改动**
  ——`checkout.test.ts` / `order.test.ts` 对旧建单 rsa 有精确断言。
- 响应里的 `pay_tool`（实测 `12`）是内部渠道码，真正支付方式取 `current_pay_tool`
  （实测 `1`），与建单结论一致。

**编排层风控**（`src/order-renew-monitor.ts`，与协议层解耦）：

| 约束 | 值 | 原因 |
|---|---|---|
| 扫描周期 | 60 秒 | 需求：每分钟触发一次 |
| 触发阈值 | `0 < 剩余 < 300` 秒 | 需求：有效期小于 5 分钟 |
| 剩余秒数口径 | 1.1 的 `cancel_expire - current_timestamp` | 用服务端时钟复判，避免本地时钟偏差 |
| 本地初筛 | 订单列表 `cancelExpireAt` | 只快速排除「明显还有很久 / 已过期」 |
| 单订单冷却 | 4 分钟 | 有效期未刷新时防止每分钟重复提交 |
| 单轮上限 | 20 页 / 200 单 | 防止列表异常放大请求量 |
| 读请求间隔 | 300ms | 列表 / confirm 之间自律串行 |
| 写请求间隔 | 5 秒 | reload 之间拉开距离，避免同账号连续写被服务端拒绝 |
| 单轮范围 | 所有进入窗口的订单 | 按 `cancelExpireAt` 升序逐单续，不再「一轮只续一个」 |
| 失败重试 | 轮末隔 5 秒再试一次 | 失败不设冷却，仍失败留到下一轮 |
| 跳过并告警 | 无快递 / 无地址、续期后截止未后移 | 不发 reload / 保留 warning 不被成功轮清空 |
| 标记结束 | `pay_status !== 'wait_pay'` | 该单不再续期 |
| 停止任务 | 凭据失效 | 避免 `201 请登录` 刷屏 |

`YishouOrderApi` 已 `skipGate:true`，续期不进请求闸门，由编排层自己做 300ms 读间隔 +
5 秒写间隔，**没有引入新的 `GateTaskKind`**。协议层能力用独立的 `RenewOrderAdapter` +
`getRenewAdapter()` 暴露，不塞进 `AutoOrderAdapter`，避免影响既有自动下单的 mock。

每轮结束打一行汇总（扫描 / 候选 / 续期 / 结束 / 失败 / 未到窗口 / 冷却 / 已过期），
续期与失败逐单打明细，排障直接看 PM2 日志里的 `[订单续期]`。

**任务层**：`kind='renew'` 是第 4 类任务。`TaskKind` 是普通联合类型、`tasks.kind` 是 TEXT，
**不需要 DB 迁移**。与 stock/price/tab 同构（一个 `renewDefinition` + 列表/状态/删除/重启
4 个通用路由），但**创建用专用路由** `POST /api/order-renew/create`：通用
`createTaskHandler` 强制「当前激活账号」，而续期要求显式选择账号，服务端按 `accountId`
校验归属并解析快照。每个账号（`userId + accountId`）同时只能有一个 `running` 续期任务，
已有则跳过、不改动、不延长；`restart` 设 `removeOriginalOnRestart:true` 避免两个循环同时续期。

**自动创建钩子**（`web/server/tasks/auto-renew.ts`）：到货 / 价格监控自动下单成功后，
若对应账号还没有 `running` 续期任务，自动创建一个 **12 小时** 的任务
（`source='auto'`，记 `sourceTaskId`）。通用 `createTaskHandler` 现把 `accountId` 注入
payload 顶层，新 stock/price 任务固化到 record；**老任务没有 `accountId`，按决策跳过**
（写 `autoRenewTriggered` 守卫落盘，避免 price 回调每轮 / restore 后重复判断）。
`pending Set` 防同一 tick 并发重复创建。

## 三、请求闸门（分桶）

后台任务的出网请求统一在 `src/utils/http.ts` 排队。**桶由本次请求实际带的凭证决定**，
不由任务自己声明（`YishouClient` 在请求级传 `accountKey`）：

| 这次请求带什么 | 桶 | 默认间隔 |
|---|---|---|
| `uid` + `token` | `auth:<uid>` | 15s |
| 其余（含只有 uid 没有 token） | `anon`（全局单桶） | 1s |

同一 uid 的多个任务共享 15 秒配额，避免同一账号被并发打爆；匿名桶是全局单桶，
所有匿名任务共享 1 秒一个槽位，按 `taskId` 轮转，任务多了实际检测周期会拉长。

**用户手动操作不经过闸门**：没有任务上下文（`getGateContext()` 为空）就直接放行，
所以页面上的查询、SKU 详情、下单预检都不受限；闸门只约束后台轮询。

三种任务的落点因此是自然结果，不需要额外配置：

| 任务 | 请求身份 | 桶 |
|---|---|---|
| 到货检测（全部规格） | 匿名（`toAnonymousAdapterConfig` 剔除凭证） | 1s |
| 到货检测（限定规格） | 登录态（查 SKU 明细必须带凭证） | 15s |
| 到货下单 | 登录态，但 `skipGate` | 不排队 |
| Tab 监控 | 匿名（配置本身无凭证） | 1s |
| 价格监控 | 登录态（强制） | 15s |

到货检测的代价是价格回退 `alone_price`，邮件带「游客参考价」标注；有货判定
（`is_stockout` / `is_on_sale` / `goods_status`）与下单所需的 `goods_no`、`color/size`
实测匿名与登录态完全一致。

## 四、下单与规格

### 自动下单的规格与件数

- **按规格监控**：任务配置 `skus` 后，检测会额外查一次 SKU 明细，
  只有所选规格 `saleStock > 0` 才算到货；商品整体有货但所选规格没货时只置 `skuWaiting`，
  不发邮件、不下单。该接口拒绝匿名，所以这类任务必须带登录态，检测进 15 秒桶。
- **多规格合单**：优先用任务配置的 `skus`（可多选），其次兼容旧的 `autoOrder.sku`，
  都没有时全部规格参与。按规格顺序分配件数，需求 5 件、蓝色 1 件、黑色 1 件时，
  一次加购带上 `[{蓝色,1},{黑色,1}]`，结算与建单都是同一份明细，
  只产生一个订单、一笔运费。
- **能买多少买多少**：每个规格取 `min(剩余需求, saleStock)`，累加到配置件数为止。
  库存只剩 1 件时，配置 5 件的任务会按 1 件下单锁库存，而不是继续空等补货。
- **以结算回传为准**：一手可能在结算时再削减数量或去掉某个规格，最终明细以 `confirm.stock`
  为准（`num_total` 缺失时累加 `stock[].num`）；`result.items` 记录每个规格的件数，
  `num` 是合计，`requestedNum` 保留配置值，`numReduced` 标记是否被削减。
- **购物车残留防护**：结算件数大于本次加购件数、或结算里出现本次没加购的规格，
  说明上一轮没清干净，清空购物车并跳过本轮，避免买错规格或一次买多。

### 价格到点自动下单

价格任务可以带一份 `autoOrder`（`targetPrice` + 件数/地址/支付方式/规格），
触发条件与到货不同：**拿货价 ≤ 目标价** 就下单，与涨跌通知相互独立。

- 首次检测也参与判断：创建任务时价格已经在目标价以下，会立刻买入，不等基线。
- **先看同一次响应的库存状态**：价格监控拿到的商品详情里本就带 `is_stockout` /
  `is_on_sale` / `goods_status`，`PriceSnapshot.inStock` 由 `mapToPriceSnapshot` 顺带填出。
  到价但商品级无货时直接跳过整条下单链路（`orderSkipped: 'no_stock'`）：
  不再发查规格请求，也不会把「注定买不到」记成一次下单失败；只有 `inStock === false` 才跳过，
  旧快照缺该字段时仍按原逻辑尝试。
- 商品级有货但所选规格无货，仍由 `placeAutoOrder` 的 `sku` 阶段兜住（详情接口没有规格级库存）。
- 下单成功即结束任务（`orderPlaced`），避免每轮重复建单；下单邮件替代当轮的价格变动邮件。
- 下单失败分两类：`retryable`（没货、被抢完）只记 `orderError`，继续监控、下轮再试；
  其余（登录态失效、建单结果未知）发失败邮件并停任务。
- 建单失败会触发一手「订单支付中」临时锁，冷却期内只检测不重试（与到货任务同一套 `cooldownMs`）。
- 任务卡片展示 `order`（订单号/金额/规格/件数/付款截止）与 `orderError`；
  `orderSkipped === 'no_stock'` 时措辞是「已到目标价，等待补货」，不当作下单失败。

### 订单列表（只读）

- 接口：`POST /order/get_order_list`，业务参数 `order_status` / `pageidx` / `pagesize`。
- 参数名是 **`pageidx`**（不是 `pageindex`），写成 `pageindex` 会直接返回
  `500 server error`，这是实测踩过的坑。
- **`pageidx` 是「记录偏移量 offset」，不是页码**（用真实账号 Android 通道实证）：
  `pageidx=0` 取第 0~9 条，`pageidx=1` 取第 1~10 条——只前移 1 条、与第一页重复 9 条。
  早期实现把 `pageidx` 当页码写成 `页码-1`，导致「加载更多」重复第一页，
  自动续期翻页也只挪 1 条。正确翻页步长是 `pagesize`：**对外第 N 页传 `(N-1) * size`**。
- 响应里的 `pageidx` = 本次 offset + 本页条数（下一页游标），但本项目仍按 1 起页码建模，
  适配器内部换算，前端 `loadMore` 只需 `currentPage + 1`。
- `order_status` 只有 5 个合法值：`all` / `wait_pay` / `wait_shipping` /
  `wait_comfirm`（上游拼写错误，必须照抄）/ `finish`；传非法值（含正确拼写的
  `wait_confirm`、`tab`、空值、不传）不报错，会**静默回退成 `all`**。
  代码里的 `tab` 只是「订单状态标签页」这一概念的变量名 / 类型名 `OrderStatusTab` /
  常量名 `ORDER_STATUS_TABS`，**不是 `order_status` 的枚举值**。
- 返回结构取决于是否传 `pageidx`：传了是 `{ list, pageidx, current_timestamp }`，
  不传是裸数组，适配器两种都兼容。
- 一手**完全忽略 `pagesize`**：实测传 `3` / `5` / `10` / `20` 都固定返回 **10 条**，
  且**不返回总数**。因此适配器把 `size` 锁死为常量 `ORDER_LIST_PAGE_SIZE = 10`——
  offset 步长、`pagesize` 请求值、`hasMore` 的满页判定三者必须用同一个 10，
  否则按入参 size 算 offset 会与服务端实际条数不符、重新出现「加载更多重复」。
  `hasMore` 按「本页是否满 10 条」判断；翻到最后一页会多一次空请求，属正常。
- 调用口径：订单页 `/api/orders` 不传 `pageSize`（服务端直接用 10）、
  自动续期固定传 `RENEW_PAGE_SIZE = 10`。
- 收藏夹（`/users/get_goods_collection_list`）是另一套分页：`pageindex` 是**页码**
  （从 1 开始）、`pagesize` **生效**（实测 50 可一次取满），同样不返回总数，
  `hasMore` 只能按本页是否满页判断。它和订单列表的 `pageidx`（记录偏移量）
  只是名字相近，**语义完全不同**，改参数前先看本段。
  Tab 商品列表用的是 `page` / `page_size`，三套不要混用。
- 自动续期 `scanWaitPayOrders` 固定传 `order_status=wait_pay`，按 `page=1..20`
  逐页拉取（每页 10 条，最多 200 单），满页才继续；offset 语义修复后翻页不再重复。
- 订单状态直接用一手给的 `order_status_name`，不维护状态码映射
  （状态码会变，文案不会）。
- 商品规格在 `attribute` 里是「颜色 → 尺码 → 件数」的嵌套 JSON，
  由 `formatOrderAttribute` 摊平成「粉色 M ×1 / 灰色 均码 ×2」，解析失败再回退 `selected`。
- 页面 `/orders` 与收藏夹同一套账号口径：默认当前账号，`?accountId=` 临时查看指定账号，
  服务端同样校验归属与 `request_profile`，不改变当前使用账号。

## 五、抓包存什么

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
