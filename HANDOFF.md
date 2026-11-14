# 交接说明

> 最后更新：2026-11-14 · 线上版本 `3553e3b`
>
> 这是接手这个项目最短的一份说明。**细节不在这里**，按文末索引跳转。

## 一、这是什么

一手（Yishou）购物助手：一个自用的 Web 后台 + 后台定时任务。

- 查询：库存、关键词搜索、商品详情、收藏夹、订单、店铺
- 监控：到货 / 价格 / Tab 商品列表 / 订单续期，四类任务，邮件通知
- 下单：监控触发或详情页手动「一键下单」，下单后自动创建 12 小时续期任务

技术栈：TypeScript + Node 22（`node:sqlite`）+ Nuxt 3 / Nitro + SQLite + PM2。无外部数据库。

## 二、5 分钟跑起来

```bash
npm install                 # npm workspaces，web 是子包
cp .env.example .env        # 填 SMTP_PASS（QQ 邮箱授权码），其余可空

npm run web:dev             # Web 开发服务器（默认 3000）
npm run test:run            # 单测（约 400 例）
npm run lint                # 只检查 src
npm run web:build           # 产物 web/.output
```

| 命令 | 说明 |
|---|---|
| `npm run web:build` | Nuxt 构建，产物 `web/.output` |
| `cd web && npx nuxi typecheck` | Vue 组件类型检查（`nuxt build` 本身不做类型检查） |
| `npm run test:run` | vitest，核心层与 kinds 的单测 |
| `npm run dev` | 只跑核心库的 ts-node 入口，日常不用 |

环境变量（`.env`，不进 git）：`SMTP_HOST/PORT/USER/PASS/SECURE/FROM_NAME`、`GATE_AUTH_INTERVAL_MS`（默认 5000）、`GATE_ANON_INTERVAL_MS`（默认 1000）、`SESSION_DAYS`（默认 30）、`DATA_DIR`（默认 `<cwd>/data`）。

**本地登录**：数据库和表会自动创建，但 `config/users.json` 不会自动生成，没有它谁都登不进去（日志提示「用户配置文件不存在」）。从服务器拷一份，或手写：

```json
{ "users": [{ "username": "you", "email": "you@example.com", "password": "<bcrypt hash>" }] }
```

密码是 bcryptjs 哈希，不是明文。

## 三、部署

服务器：`ubuntu@43.143.118.204`，目录 `/var/www/shopping-assistant`，PM2 进程名 `shopping-assistant`，监听 3000。SSH 用密钥（见 `deploy.sh` 顶部配置），密码不在仓库里。

```bash
bash deploy.sh deploy     # 构建 + 上传 + 重启（完整流程）
bash deploy.sh upload     # 只上传：同步到 .output.next，再原子切换
bash deploy.sh restart    # pm2 startOrReload --update-env && pm2 save
bash deploy.sh logs       # 远程日志
```

**不要 `rsync --delete` 直接覆盖运行中的 `.output`**：旧进程会读到被替换的 chunk，出现 `xxx is not a function` 这类假故障。必须走 `.output.next → .output`（保留 `.output.prev` 回滚）。

服务器上不在 `.output` 内、发版不会覆盖的东西：

| 路径 | 内容 |
|---|---|
| `data/tasks.db` | 任务、账号、会话、设置（SQLite） |
| `config/users.json` | Web 登录用户（bcrypt 哈希） |
| `ecosystem.config.cjs` | PM2 配置 + `SMTP_PASS` 等环境变量（600 权限） |

Node 必须 ≥ 22.5（`node:sqlite`）。服务启动时会幂等补齐新列（`PRAGMA table_info` + `ALTER TABLE`）。

Web 登录用 `session_id` cookie，滑动过期默认 30 天（`SESSION_DAYS`），会话落 SQLite，**发版重启不会掉登录**。

## 四、目录地图

```
src/                     平台无关内核（可单测，不依赖 Nuxt）
  adapters/yishou/       一手接口：client、endpoints、mappers、profile
  contract/              三端共用类型（只允许 import type）
  stock-monitor.ts       到货检测循环
  price-monitor.ts       价格检测 + 券后价
  tab-list-monitor.ts    Tab 列表抓取与对比
  order-renew-monitor.ts 订单续期扫描
  auto-order.ts          加购 / 结算 / 建单
  email.ts               所有邮件模板
web/
  pages/                 页面（见下表）
  components/task/       TaskCard / TaskListHeader / TaskEventList
  components/ui/         Button / Input / Select / Dialog / Toast…
  composables/           useTaskList / useAutoOrderForm / useStock…
  server/api/            HTTP 编解码（每个文件很薄）
  server/tasks/engine/   store / registry / service / handlers
  server/tasks/kinds/    stock / price / tab / renew 四个 definition
web/utils/               前端纯工具（时长选项、格式化、任务筛选）
```

依赖方向：`web → src` 单向，`src` 不能 import `web`（会触发 `TS6059`）。`src/contract` 只放类型。

## 五、必须知道的五件事

### 1. 任务数据只有一种形状

`TaskSummary` 是列表、详情、创建响应的唯一结构。新增展示字段改 `kinds/*.ts` 的 `project()`（`badges` / `stats` / `config`），前端按 key 渲染，不用改类型。详见 [ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

### 2. 账号 = 一次抓包快照，凭证不进前端

存在 `accounts.request_profile`。前端只拿脱敏摘要，不持有 uid/token。所有接口用 `resolveAdapterConfigForUser(username, needAuth)`。

| 场景 | needAuth | 行为 |
|---|---|---|
| 库存查询 / 关键词搜索 | true | **原样回放**当前账号快照，不主动剔除 uid/token；**不校验**凭证，没登录态也能查（价格降级） |
| SKU 详情 / 收藏夹 / 订单 / 价格监控 / 下单 | true | 必须有凭证，否则 `AUTH_REQUIRED` |
| Tab 监控（后台） | false | 剔除 uid/token，走匿名桶 |
| 到货监控（后台检测） | false | 检测匿名；开启自动下单时，下单链路用凭证 |

「不剔除登录态」≠「必须有登录态」，这两个语义不要混。

任务创建时凭证固化在 `tasks.secret` 列，之后切账号不影响已建任务；重启沿用原 secret。

### 3. 请求闸门只管后台轮询

只有 3 类后台检测请求排队：到货、价格、Tab（每任务 FIFO，按 taskId 轮转）。登录态桶 5 秒/次，匿名桶 1 秒/次。

**手动接口、下单、订单续期都不排队**。下单是抢库存写操作，排队即失去意义；续期自己节流：每 60 秒扫一轮、请求间隔 300ms、写操作间隔 5 秒。

新增后台任务目前要手动 `runWithGateContext({ taskId, kind })`，忘了就完全不限流且不报错——这是已知待改造点，详见 [PROTOCOL-YISHOU.md](./docs/PROTOCOL-YISHOU.md) §三。

### 4. 价格监控用券后价比较

```
券后价 = P − max{ reduce × min(1, P / threshold) }
```

`P` 是 `shopPrice`（折后价），券在折后价上算，不满足门槛的券按比例折算；多张券取最低券后价。页面只展示折后价，不展示券后价。`minPrice/maxPrice` 是传给一手的筛选参数，不是本地过滤。

### 5. 续期是「12 小时 + 结束前 10 分钟邮件」

自动下单和手动下单都会 `ensureRenewTask12h()`：已有续期任务不跳过，而是把时长重置为 12 小时、重置计时起点、重启循环、保留统计。结束前 10 分钟发一封提醒邮件，异步发送，不阻塞续期。

## 六、页面清单

| 路径 | 作用 |
|---|---|
| `/` | 功能入口宫格 + 未选账号提醒 |
| `/stock/check` | 库存查询：纯数字查单个商品；含文字走关键词搜索（结果新窗口开详情） |
| `/stock/[productNo]` | 商品详情：SKU、价格、一键下单、价格监控入口 |
| `/monitor` | 到货监控任务 |
| `/price-monitor` | 价格监控任务 |
| `/tab-monitor` | Tab 监控任务 |
| `/order-renew` | 订单续期任务（每分钟扫描，有效期不足 5 分钟自动刷新） |
| `/orders` | 订单列表，支持 `?accountId=` 临时查看 |
| `/collection` | 收藏夹，同上 |
| `/shops`、`/shops/blacklist` | 店铺评分与黑名单 |
| `/accounts` | 一手账号管理（抓包快照） |
| `/calculator` | 凑单计算器 |
| `/settings` | 当前账号、代理、保存配置 |
| `/login` | Web 登录 |

四个任务列表页共用 `TaskListHeader`：标题 + 状态下拉筛选 + 刷新，各页专属按钮走插槽。筛选是前端本地过滤，不重新请求。

## 七、坑与取舍

- **批量库存查询已整体下线**（函数、类型、导出、页面入口都删了）。输入多个 ID 会提示分开查询。
- **匿名价格口径**：一手对游客返回 `shop_price = "??.??"`，映射层回退 `alone_price` 并标「游客参考价」；关键词搜索无回退，列表显示「价格暂不可用」。
- **历史任务没有货号**时不可点，不做实时回填。
- **Tab 监控邮件**最多 50 个商品，两列布局，商品链接是一手 App 深链 `yishou://fmkj/openyishou?...`，不是 H5。
- **价格监控、到货监控的自动下单默认 5 件**；手动一键下单是「每个有货 SKU 各 1 件，上限 5」。
- **层级顺序**：Toast `z-[100]` > `UiSelect` 面板 `z-[60]` > Dialog `z-50`。改层级时注意别把 Toast 盖住（曾因此看不到错误提示）。
- **Web 登录用户仍在 `config/users.json`**（目前 2 个账号：`wxt`、`yanxia`），没进数据库；`accounts.user_id` 存的是用户名字符串，不是外键。
- **代理是全局设置**，影响服务器出网，不按用户隔离。
- **不要改 `src/utils/request-gate.ts` 的默认值**来给单个接口提速，会同时影响所有后台任务。

## 八、下一步可做（都不是必须）

1. 闸门自动化：任务引擎统一注入上下文 + 端点策略表（`queue/bypass`）+ 单一决策函数。目标是不再靠人记住哪个接口要排队。
2. Web 登录用户迁到 SQLite `users` 表，把 `accounts.user_id` 收敛成外键；要保留首次启动的 bootstrap。
3. 移动端给 `UiSelect` 加系统选择器回退（原生 `select` 的滚轮体验在手机上更好）。

## 九、文档索引

| 文档 | 什么时候看 |
|---|---|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 分层、任务引擎、契约层、账号凭证、部署细节 |
| [ITERATION-GUIDE.md](./docs/ITERATION-GUIDE.md) | 新增任务类型、schema 迁移、加测试、提交发布 |
| [PROTOCOL-YISHOU.md](./docs/PROTOCOL-YISHOU.md) | 一手接口签名、下单与续期链路、闸门、抓包字段 |
| [yishou-get-goods-info-v2.md](./docs/yishou-get-goods-info-v2.md) | 商品详情接口的完整响应样例 |
| [MINIPROGRAM_GUIDE.md](./MINIPROGRAM_GUIDE.md) | 小程序端（与 Web 后台独立） |
