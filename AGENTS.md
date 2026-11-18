# 协作约定（长期记忆）

> 这份文件是跨会话的工作约定，每次在本仓库开始任务前都按它执行。

## 验证强度：按改动性质分级

**默认不做端到端验证。** 简单改动交付前只要求：`npx tsc --noEmit`、`cd web && npx nuxi typecheck`、相关单测通过。验收由用户完成，用户会直接反馈问题。

「简单改动」包括但不限于：

- 契约字段透传、投影多一个 stat / badge、文案与样式调整
- 单个默认值、表单开关、排序与筛选
- 纯前端展示层改动（列表、卡片、弹窗布局）

**只有下列改动才值得端到端验证**（部署后爬库 / 跑真实账号 / 截图核对）：

- 登录、鉴权、抓包参数对齐这类链路级改动
- 自动下单、续期等涉及真实资金或订单的链路
- 用户明确要求「实测一下」「截图给我看」

## 交付流程（部署）

**每次改完代码都要提交并部署到线上，由用户在真实环境验收。** 不要只留在本地等用户再说「提交部署」——除非用户当次明确说「先不部署 / 只改本地」。验证仍按上面的强度分级来做，部署本身是默认动作。

```bash
npm run web:build
cd web && sshpass -p '<服务器密码>' rsync -az --delete -e "ssh -o StrictHostKeyChecking=no" \
  .output/ ubuntu@43.143.118.204:/var/www/shopping-assistant/.output.next/
sshpass -p '<服务器密码>' ssh ubuntu@43.143.118.204 \
  'cd /var/www/shopping-assistant && rm -rf .output.prev && \
   if [ -d .output ]; then mv .output .output.prev; fi && mv .output.next .output && \
   pm2 restart shopping-assistant --update-env'
```

`deploy.sh` 依赖 SSH 免密，沙箱里不生效，用上面的 sshpass 版本。绝不 `rsync --delete` 直接覆盖运行中的 `.output`。

## 代码约定

- 任务对外只有一个形状 `TaskSummary`，列表与详情都由 `project()` 产出，前端不另写 DTO
- 落盘状态只在 `migrate` 阶段做兼容兜底，运行期相信已有数据
- 新增后台行为必须带单测，且测试要能证明「改了会失败」

## 风控验证实验分支（gate-risk-probe）

- 主线 `main` 上所有「下单链路」请求本就 `skipGate`（`YishouOrderApi` 构造带 `skipGate:true`），只有下单预检查 SKU 的 `getProductSkus` 曾漏过闸门；已在 main 修复（commit 83e037f）并合并回 `gate-risk-probe`：`getProductSkus(id, skipGate?)` 新增可选参数，`auto-order.ts` 预检传 `true` 走 `orderSkuClient`（走代理+skipGate），库存/价格监控检测仍用默认（过闸门）。
- 分支 `gate-risk-probe`：专门用于验证一手风控策略，与主线隔离。
  - 双层请求闸门：IP 桶 `ip:<出口IP>` + UID 桶 `uid:<账号>`，默认各 1 秒（环境变量 `GATE_IP_INTERVAL_MS` / `GATE_UID_INTERVAL_MS`）。所有请求先过 IP 桶；UID 桶只约束登录态账号，匿名请求跳过 UID 层只过 IP 桶（已去掉全局 `uid:anon` 桶，避免多个匿名监控任务被串联限流，commit 79e96e6）。
  - 到货 / 价格监控去掉了固定 `sleep` 检测间隔，轮次节奏完全交给闸门；`interval` 仅作配置展示与时长边界预估。
  - 账号表新增 `localAddress`（出口网卡 IP），可在账号管理里手动分配；HTTP 出口用 `localAddress` 绑定网卡并进对应 IP 桶。留空进 `ip:default`。
- 实验服务器：`ubuntu@1.13.23.184`（密码同主线），应用目录同为 `/var/www/shopping-assistant`，PM2 名 `shopping-assistant`。数据是主线库的一致性快照（accounts 13 / tasks 52 / shop_blacklist 2）。
  - 访问地址：`http://1.13.23.184/`（Nginx 监听 80 反代到本机 3000，未绑域名，server_name `_`）。本机 80 / 公网 80 均已验证通（302 → /login）。
  - 从主线拷到实验机的四类东西：`.output`（应用代码）、`ecosystem.config.cjs`（环境变量，7 个 key，md5 与主线一致）、`data/tasks.db`（SQLite 一致性快照）、`config/users.json`（应用登录账号 yanxia/wxt；初次迁移漏了，已补，热加载生效）。
  - 登录账户：SSH 用 `ubuntu` / 密码同主线；应用后台用 `yanxia` 或 `wxt`（密码见主线 `config/users.json` 的 bcrypt hash，与主线完全一致）。主线多一个 `lighthouse` 系统用户，实验机没有，不影响应用。
  - **双网卡已配置（2026-11-18）**：`eth0` 内网 10.206.0.4 → 公网 1.13.23.184（SSH/Nginx 80 走这里，默认路由）；`eth1` 内网 10.206.0.17 → 公网 EIP 119.45.202.128。eth1 用独立路由表 101 + 策略路由 `from 10.206.0.17 lookup eni1 priority 101`，持久化在 `/etc/netplan/60-eni-config.yaml`（`netplan generate` 语法已校验），当前已用 `ip` 命令即时生效。已验证：`curl --interface 10.206.0.17 http://ifconfig.me/ip` 返回 119.45.202.128。
  - 账号出口 IP：给账号填 `localAddress=10.206.0.17` 即走第二个出口；留空走 ip:default（eth0，公网 1.13.23.184）。据此做多 IP 分桶风控验证。注意 Node HTTP 用 localAddress 绑内网 IP，策略路由保证从对应网卡出去。
  - 账号管理的「出口网卡 IP」已改为纯下拉（commit e648376）：后端 `GET /api/network/addresses` 用 `os.networkInterfaces()` 枚举内网 IP + 腾讯云 metadata 按 MAC 查公网 IP（非云环境优雅降级），前端下拉显示「网卡名 · 内网IP → 公网IP」+「默认路由」项。端到端已验证返回 eth1→119.45.202.128 / eth0→1.13.23.184。
  - 价格监控弹窗已移除「检测间隔」输入框（commit e648376）：节奏完全由闸门控制，后端 interval 仅用默认值做时长边界预估。到货监控 / Tab 监控表单仍保留检测间隔字段（用户当次只要求改价格监控）。
  - **收藏夹通道（多任务共享单循环）**：到货 / 价格任务表单可选「检测通道」，选 `collection` 时走共享收藏夹监控。架构：
    - 核心 `src/collection-monitor.ts` 单例 `CollectionMonitorEngine`：一个循环按 `pageSize=20` 全量翻页 `checkCollectionStock`，按 `goods_no` 分发给订阅者；未订阅商品**连续 2 轮**无人认领才当脏数据清理（恢复期保护），并支持 `reserve/unreserve` 占位覆盖「创建任务 → 订阅完成」的窗口，避免刚加进收藏夹就被删。循环不 sleep，跑在 `runWithGateContext(accountKey=收藏账号)` 里由登录桶控制节奏。
    - **收藏夹账号只归引擎**：`RuntimeSettings.collectionAccountId`（系统配置页选择，必须带登录态）是唯一持有收藏夹凭证的地方。任务层不存收藏夹账号、不存凭证、不存 collectId。
    - server 单例 `web/server/tasks/collection-engine-service.ts` 提供 `ensureCollected(productNo)`（幂等加收藏，先查后加，失败则任务创建失败）与 `releaseCollected(productNo)`（幂等移除，尽力而为），内部维护 `productNo→collectId` 缓存、缺失时现翻页查找；账号变更时 `syncCollectionEngine()` 停旧启新，无账号 / 无订阅时停引擎。
    - 任务生命周期：create 只调 `ensureCollected`；`resolveAccount` 对 collection 通道返回**下单账号**（创建时当前激活账号的快照 ID，不下发 secret）；run 时不启自身循环，改为订阅引擎，下单按 `record.accountId` 现取凭证（账号被删 / 掉登录态则只通知 + 告警，不下单）；自然结束（命中 / 到期）与删除都在 `finish` 里**先 `releaseCollected` 再注销订阅**，`onRemove` 同序（反了引擎会先停、没人清理）。
    - 恢复期：`restoreAllTasks` 用 `beginCollectionRestore/endCollectionRestore` 包住，所有任务订阅就绪后才统一拉起引擎；保存设置时若有在跑订阅且账号变更，直接拒绝并提示先处理任务。
    - 限制：收藏夹通道不能选 SKU、不支持券后价 / 折扣计算、价格只支持指定目标价（collection 时强制 triggerMode=price）。一商品只能有一个收藏夹监控。
- 部署到实验机时目标地址是 `1.13.23.184`，不要误覆盖主线 `43.143.118.204`。
