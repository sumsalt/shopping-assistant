<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
    <div class="w-full max-w-md">
      <!-- Logo 和标题 -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
        <h1 class="text-3xl font-bold text-gray-900">购物助手</h1>
        <p class="text-gray-500 mt-2">登录以访问系统</p>
      </div>

      <!-- 登录表单卡片 -->
      <div class="bg-white rounded-2xl shadow-lg p-8 border border-gray-200">
        <form @submit.prevent="handleSubmit" class="space-y-6">
          <!-- 错误提示 -->
          <div 
            v-if="errorMessage" 
            class="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg flex items-center gap-2"
            role="alert"
            aria-live="polite"
          >
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{{ errorMessage }}</span>
          </div>

          <!-- 用户名输入 -->
          <div>
            <label for="username" class="block text-sm font-medium text-gray-700 mb-2">
              用户名
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                id="username"
                v-model="formData.username"
                type="text"
                autocomplete="username"
                required
                :disabled="isLoading"
                placeholder="请输入用户名"
                tabindex="0"
                aria-label="用户名"
                class="block w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
                @keydown.enter="focusPassword"
              />
            </div>
          </div>

          <!-- 密码输入 -->
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
              密码
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                ref="passwordInput"
                id="password"
                v-model="formData.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                required
                :disabled="isLoading"
                placeholder="请输入密码"
                tabindex="0"
                aria-label="密码"
                class="block w-full pl-10 pr-12 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
              />
              <!-- 密码可见性切换 -->
              <button
                type="button"
                tabindex="0"
                aria-label="切换密码可见性"
                class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                @click="togglePasswordVisibility"
                @keydown.enter.prevent="togglePasswordVisibility"
              >
                <svg v-if="showPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            </div>
          </div>

          <!-- 登录按钮 -->
          <button
            type="submit"
            :disabled="isLoading || !isFormValid"
            tabindex="0"
            aria-label="登录"
            class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg 
              v-if="isLoading" 
              class="animate-spin w-5 h-5" 
              fill="none" 
              viewBox="0 0 24 24"
            >
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>{{ isLoading ? '登录中...' : '登录' }}</span>
          </button>
        </form>
      </div>

      <!-- 底部信息 -->
      <p class="text-center text-gray-400 text-sm mt-6">
        © {{ new Date().getFullYear() }} 购物助手 - 保留所有权利
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
})

const router = useRouter()
const route = useRoute()
const { login: authLogin, user, checkAuth } = useAuth()

// 服务端检查登录状态，已登录则重定向
await checkAuth()
if (user.value) {
  await navigateTo((route.query.redirect as string) || '/')
}

// 表单数据
const formData = ref({
  username: '',
  password: '',
})

// 状态
const isLoading = ref(false)
const errorMessage = ref('')
const showPassword = ref(false)

// 密码输入框引用
const passwordInput = ref<HTMLInputElement | null>(null)

// 表单是否有效
const isFormValid = computed(() => {
  return formData.value.username.trim() !== '' && formData.value.password !== ''
})

// 切换密码可见性
const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value
}

// 聚焦到密码输入框
const focusPassword = () => {
  passwordInput.value?.focus()
}

// 提交表单
const handleSubmit = async () => {
  // 客户端验证
  if (!formData.value.username.trim()) {
    errorMessage.value = '请输入用户名'
    return
  }

  if (!formData.value.password) {
    errorMessage.value = '请输入密码'
    return
  }

  // 清除错误
  errorMessage.value = ''
  isLoading.value = true

  try {
    const result = await authLogin(
      formData.value.username.trim(),
      formData.value.password
    )

    if (result.success) {
      // 登录成功，跳转到原请求页面或首页
      const redirectTo = (route.query.redirect as string) || '/'
      await router.push(redirectTo)
    } else {
      errorMessage.value = result.error || '登录失败，请稍后重试'
    }
  } catch (error: any) {
    // 显示错误信息
    errorMessage.value = error.data?.message || error.message || '登录失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}
</script>
