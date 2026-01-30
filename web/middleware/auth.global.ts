/**
 * 全局页面认证中间件
 * 
 * 检查用户登录状态，未登录时重定向到登录页
 * 
 * 注意：此中间件同时在服务端和客户端执行
 * - 服务端：通过 Cookie 验证会话
 * - 客户端：使用预取的数据，避免闪烁
 */

export default defineNuxtRouteMiddleware(async (to) => {
  // 登录页不需要认证
  if (to.path === '/login') {
    return
  }

  const { user, initialized, checkAuth } = useAuth()
  const nuxtApp = useNuxtApp()

  // 服务端渲染时，通过 API 检查登录状态
  if (import.meta.server) {
    await checkAuth()
    
    if (!user.value) {
      return navigateTo({
        path: '/login',
        query: {
          redirect: to.fullPath,
        },
      })
    }
    return
  }

  // 客户端水合时
  if (import.meta.client) {
    // 如果是从服务端水合而来，状态已经同步，无需再检查
    if (nuxtApp.isHydrating && initialized.value) {
      // 服务端已验证过，直接使用同步的状态
      if (!user.value) {
        return navigateTo({
          path: '/login',
          query: {
            redirect: to.fullPath,
          },
        })
      }
      return
    }

    // 客户端导航（非水合），需要检查状态
    if (!initialized.value) {
      await checkAuth()
    }

    if (!user.value) {
      return navigateTo({
        path: '/login',
        query: {
          redirect: to.fullPath,
        },
      })
    }
  }
})
