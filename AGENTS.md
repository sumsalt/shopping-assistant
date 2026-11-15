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
