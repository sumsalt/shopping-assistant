<template>
  <div class="max-w-2xl mx-auto">
    <!-- 页面标题 -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">系统配置</h1>
      <p class="mt-1 text-sm text-gray-500">配置平台认证信息以使用库存查询功能</p>
    </div>

    <!-- 配置表单 -->
    <UiCard>
      <form @submit.prevent="handleSubmit">
        <div class="space-y-6">
          <!-- 认证信息区域 -->
          <div>
            <h3 class="text-lg font-medium text-gray-900 mb-4">
              认证信息
              <span class="text-sm font-normal text-gray-500">（可选）</span>
            </h3>

            <div class="space-y-4">
              <!-- 用户 ID -->
              <UiInput
                v-model="formData.uid"
                label="用户 ID (uid)"
                placeholder="请输入用户 ID"
                :error="formErrors.uid"
                @blur="handleFieldBlur('uid')"
              />

              <!-- Token -->
              <div class="relative">
                <UiInput
                  v-model="formData.token"
                  :type="showSensitive ? 'text' : 'password'"
                  label="Token"
                  placeholder="请输入 Token"
                  :error="formErrors.token"
                  @blur="handleFieldBlur('token')"
                >
                  <template #suffix>
                    <button
                      type="button"
                      class="text-gray-400 hover:text-gray-600"
                      :aria-label="showSensitive ? '隐藏' : '显示'"
                      @click="toggleSensitiveDisplay"
                    >
                      <svg v-if="showSensitive" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                      <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                  </template>
                </UiInput>
              </div>

              <!-- OpenID -->
              <UiInput
                v-model="formData.openid"
                :type="showSensitive ? 'text' : 'password'"
                label="OpenID"
                placeholder="请输入微信 OpenID"
                :error="formErrors.openid"
                @blur="handleFieldBlur('openid')"
              />
            </div>
          </div>

          <!-- 分隔线 -->
          <hr class="border-gray-200" />

          <!-- 可选信息区域 -->
          <div>
            <h3 class="text-lg font-medium text-gray-900 mb-4">设备信息（可选）</h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- 设备型号 -->
              <UiInput
                v-model="formData.model"
                label="设备型号"
                placeholder="如：iPhone 14 Pro Max"
              />

              <!-- 版本号 -->
              <UiInput
                v-model="formData.version"
                label="版本号"
                placeholder="如：5.11.0"
              />

              <!-- 版本名称 -->
              <UiInput
                v-model="formData.version_name"
                label="版本名称"
                placeholder="如：5.11.0"
              />

              <!-- 微信版本 -->
              <UiInput
                v-model="formData.wx_version_name"
                label="微信版本"
                placeholder="如：8.0.43"
              />
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex items-center justify-between pt-4">
            <UiButton
              type="button"
              variant="ghost"
              @click="handleReset"
            >
              重置配置
            </UiButton>

            <div class="flex space-x-3">
              <UiButton
                type="button"
                variant="outline"
                @click="handleCancel"
              >
                取消
              </UiButton>
              <UiButton
                type="submit"
                :loading="isSaving"
              >
                保存配置
              </UiButton>
            </div>
          </div>
        </div>
      </form>
    </UiCard>

    <!-- 使用说明 -->
    <div class="mt-6 p-4 bg-blue-50 rounded-lg">
      <h4 class="text-sm font-medium text-blue-800 mb-2">如何获取配置信息？</h4>
      <ol class="text-sm text-blue-700 list-decimal list-inside space-y-1">
        <li>打开一手 App 或小程序</li>
        <li>使用抓包工具（如 Charles）捕获网络请求</li>
        <li>在请求头或参数中找到对应的 uid、token、openid 等信息</li>
        <li>将获取到的信息填入上方表单并保存</li>
      </ol>
    </div>
  </div>
</template>

<script setup lang="ts">
// 页面元信息
definePageMeta({
  title: '系统配置',
})

// 使用配置管理 composable
const {
  formData,
  formErrors,
  showSensitive,
  isSaving,
  initFormData,
  saveConfig,
  resetConfig,
  toggleSensitiveDisplay,
} = useConfig()

const router = useRouter()
const route = useRoute()

// 字段失焦验证
const handleFieldBlur = (field: string) => {
  // 清除该字段的错误
  if (formErrors.value[field]) {
    delete formErrors.value[field]
  }
}

// 提交表单
const handleSubmit = async () => {
  const success = await saveConfig()
  if (success) {
    // 如果有重定向参数，则跳转
    const redirect = route.query.redirect as string
    if (redirect) {
      router.push(redirect)
    }
  }
}

// 重置配置
const handleReset = () => {
  if (confirm('确定要重置所有配置吗？')) {
    resetConfig()
  }
}

// 取消操作
const handleCancel = () => {
  initFormData()
  router.back()
}
</script>
