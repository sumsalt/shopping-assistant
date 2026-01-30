<template>
  <header class="bg-white border-b border-gray-200 sticky top-0 z-40">
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <!-- 左侧：Logo 和菜单按钮 -->
        <div class="flex items-center">
          <!-- 移动端菜单按钮 -->
          <button
            type="button"
            class="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="打开菜单"
            @click="handleMenuToggle"
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <!-- Logo -->
          <NuxtLink to="/" class="flex items-center ml-2 lg:ml-0">
            <svg class="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span class="ml-2 text-xl font-bold text-gray-900">库存监控</span>
          </NuxtLink>
        </div>

        <!-- 右侧：配置按钮和用户信息 -->
        <div class="flex items-center space-x-4">
          <!-- 配置状态指示器 -->
          <div
            v-if="!isConfigured"
            class="hidden sm:flex items-center text-sm text-yellow-600"
          >
            <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>请先完成配置</span>
          </div>

          <!-- 配置按钮 -->
          <NuxtLink
            to="/settings"
            class="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="设置"
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </NuxtLink>

          <!-- 用户信息和登出按钮 -->
          <div v-if="user" class="relative">
            <button
              type="button"
              class="flex items-center space-x-2 p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
              tabindex="0"
              aria-label="用户菜单"
              aria-haspopup="true"
              :aria-expanded="showUserMenu"
              @click="handleToggleUserMenu"
              @keydown.enter.prevent="handleToggleUserMenu"
            >
              <!-- 用户头像 -->
              <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <span class="text-white text-sm font-medium">
                  {{ user.username.charAt(0).toUpperCase() }}
                </span>
              </div>
              <!-- 用户名（桌面端显示） -->
              <span class="hidden sm:block text-sm font-medium">{{ user.username }}</span>
              <!-- 下拉箭头 -->
              <svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <!-- 下拉菜单 -->
            <div
              v-show="showUserMenu"
              class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
            >
              <!-- 用户信息 -->
              <div class="px-4 py-3 border-b border-gray-100">
                <p class="text-sm font-medium text-gray-900">{{ user.username }}</p>
                <p class="text-xs text-gray-500 truncate">{{ user.email }}</p>
              </div>

              <!-- 登出按钮 -->
              <button
                type="button"
                class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center space-x-2"
                tabindex="0"
                aria-label="登出"
                :disabled="isLoggingOut"
                @click="handleLogout"
                @keydown.enter.prevent="handleLogout"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>{{ isLoggingOut ? '登出中...' : '登出' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 点击外部关闭下拉菜单 -->
    <div
      v-if="showUserMenu"
      class="fixed inset-0 z-40"
      aria-hidden="true"
      @click="showUserMenu = false"
    />
  </header>
</template>

<script setup lang="ts">
// 组件属性定义
interface Props {
  isConfigured?: boolean
}

// 默认属性
withDefaults(defineProps<Props>(), {
  isConfigured: false,
})

// 定义事件
const emit = defineEmits<{
  menuToggle: []
}>()

// 认证相关
const { user, logout } = useAuth()
const router = useRouter()

// 状态
const showUserMenu = ref(false)
const isLoggingOut = ref(false)

// 菜单切换处理
const handleMenuToggle = () => {
  emit('menuToggle')
}

// 切换用户菜单
const handleToggleUserMenu = () => {
  showUserMenu.value = !showUserMenu.value
}

// 登出处理
const handleLogout = async () => {
  if (isLoggingOut.value) return

  isLoggingOut.value = true
  showUserMenu.value = false

  try {
    await logout()
    await router.push('/login')
  } catch (error) {
    console.error('登出失败:', error)
  } finally {
    isLoggingOut.value = false
  }
}
</script>
