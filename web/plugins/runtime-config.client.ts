/**
 * 启动时拉取服务端运行配置
 *
 * 当前账号 / 代理都保存在服务端，页面与组件（包括各监控弹窗）都要读它，
 * 放在 plugin 里比各页面 onMounted 更可靠：布局的 mounted 晚于子页面，
 * 直接打开 /stock/xxx 时首个读取会拿到空值。
 */

export default defineNuxtPlugin(() => {
  const configStore = useConfigStore()
  // 不阻塞首屏：store 是响应式的，拉回来会自己刷新
  void configStore.load()
})
