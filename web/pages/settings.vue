<template>
  <div class="max-w-2xl mx-auto">
    <!-- 页面标题 -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">系统配置</h1>
      <p class="mt-1 text-sm text-gray-500">选择当前使用的一手账号、配置网络代理</p>
    </div>

    <UiCard>
      <form @submit.prevent="handleSubmit">
        <div class="space-y-6">
          <!-- 当前使用账号 -->
          <div>
            <h3 class="text-lg font-medium text-gray-900 mb-1">当前使用账号</h3>
            <p class="text-xs text-gray-500 mb-4">
              设备与登录信息保存在「账号管理」，这里只决定本浏览器当前用哪个账号发请求。
              匿名检测（库存 / Tab 监控）会自动剔除 uid 和 token。
            </p>

            <!-- 当前账号概览 -->
            <div
              class="rounded-lg border p-3 mb-4"
              :class="activeAccount.id ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 bg-gray-50'"
            >
              <template v-if="activeAccount.id">
                <div class="flex items-center gap-2 flex-wrap">
                  <span
                    class="text-sm font-semibold truncate"
                    :class="activeAccount.title ? '' : 'font-mono'"
                  >{{ accountDisplayName(activeAccount) }}</span>
                  <span v-if="activeAccount.title" class="text-xs text-gray-400 font-mono">{{ activeAccount.phone }}</span>
                  <span
                    v-if="activeAccount.channel"
                    class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                    :class="activeAccount.channel === 'app' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'"
                  >
                    {{ activeAccount.channel === 'app' ? 'App' : '小程序' }}
                  </span>
                  <span v-if="activeAccount.hasRequestProfile" class="text-xs text-gray-500">
                    {{ activeAccount.requestParamCount }} 个请求参数
                  </span>
                </div>
                <p class="mt-1 text-xs text-gray-500">
                  uin：{{ activeAccount.uin || '未填写' }}
                  <span v-if="!activeAccount.hasRequestProfile" class="text-amber-600">· 该账号暂无抓包信息，请求将走默认匿名参数</span>
                  <span v-else-if="!activeAccount.hasCredential" class="text-amber-600">· 抓包缺少 uid/token，只能用于库存查询与 Tab 监控</span>
                </p>
              </template>
              <template v-else-if="configStore.isInitialized">
                <p class="text-sm text-gray-600">未选择账号（匿名模式）</p>
                <p class="mt-1 text-xs text-gray-500">查询库存 / Tab 监控可用；价格监控、SKU 详情、收藏夹、订单、自动下单需要选择带登录态的账号。</p>
              </template>
              <template v-else>
                <p class="text-sm text-gray-500">读取当前账号…</p>
              </template>
            </div>

            <!-- 选择账号 -->
            <label class="block text-sm font-medium text-gray-700 mb-1">从账号列表选择</label>
            <div class="flex flex-col sm:flex-row gap-2">
              <select
                v-model="selectedAccountId"
                :disabled="isLoadingAccounts || isSwitchingAccount"
                class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">不使用账号（匿名模式）</option>
                <option v-for="item in accountList" :key="item.id" :value="item.id">
                  {{ accountDisplayName(item) }}{{ item.uin ? ' · ' + item.uin : '' }}{{ item.requestChannel ? ' · ' + (item.requestChannel === 'app' ? 'App' : '小程序') : '' }}{{ item.hasRequestProfile ? '' : ' · 无抓包信息' }}
                </option>
              </select>
              <UiButton
                type="button"
                variant="outline"
                :loading="isSwitchingAccount"
                :disabled="isLoadingAccounts || isSwitchingAccount"
                @click="selectAccount"
              >
                设为当前账号
              </UiButton>
            </div>
            <div class="mt-2 flex items-center gap-3">
              <NuxtLink to="/accounts" class="text-xs text-blue-600 hover:text-blue-700">
                去账号管理新增 / 粘贴抓包 →
              </NuxtLink>
              <button
                v-if="activeAccount.id"
                type="button"
                class="text-xs text-gray-400 hover:text-gray-600"
                @click="clearActiveAccount"
              >
                恢复匿名模式
              </button>
            </div>
          </div>

          <hr class="border-gray-200" />

          <!-- 代理设置 -->
          <div>
            <h3 class="text-lg font-medium text-gray-900 mb-4">代理设置（可选）</h3>

            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm font-medium text-gray-900">启用代理</div>
                  <div class="text-sm text-gray-500">通过代理服务器访问</div>
                </div>
                <UiSwitch
                  v-model="formData.proxyEnabled"
                  :disabled="!formData.proxyUrl"
                />
              </div>

              <UiInput
                v-model="formData.proxyUrl"
                label="代理 URL"
                placeholder="如：http://proxy.example.com:8080"
                :disabled="!formData.proxyEnabled"
                help-text="如果需要通过代理访问，请填写代理地址"
              />

              <p v-if="!formData.proxyUrl && formData.proxyEnabled" class="text-sm text-orange-600">
                请先填写代理 URL
              </p>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex items-center justify-between pt-4">
            <UiButton type="button" variant="ghost" @click="handleReset">
              重置配置
            </UiButton>

            <div class="flex space-x-3">
              <UiButton type="button" variant="outline" @click="handleCancel">
                取消
              </UiButton>
              <UiButton type="submit" :loading="isSaving">
                保存配置
              </UiButton>
            </div>
          </div>
        </div>
      </form>
    </UiCard>

    <!-- 使用说明 -->
    <div class="mt-6 p-4 bg-blue-50 rounded-lg">
      <h4 class="text-sm font-medium text-blue-800 mb-2">如何开始使用？</h4>
      <ol class="text-sm text-blue-700 list-decimal list-inside space-y-1">
        <li>用抓包工具（如 Charles）捕获一手 App 或小程序的任意一条 POST 请求</li>
        <li>到「账号管理」新增账号，把整条请求粘进「粘贴抓包请求」并点识别，公共参数会自动填好</li>
        <li>回到本页把它设为当前账号；小程序与 App 两种抓包内容都支持</li>
      </ol>
    </div>
  </div>
</template>

<script setup lang="ts">
import { accountDisplayName } from '@/utils/accountName'

definePageMeta({
  title: '系统配置',
})

const {
  formData,
  isSaving,
  accountList,
  selectedAccountId,
  isLoadingAccounts,
  isSwitchingAccount,
  activeAccount: rawActiveAccount,
  selectAccount,
  clearActiveAccount,
  saveConfig,
  resetConfig,
  initFormData,
} = useConfig()

// 服务端状态是否已拉回：未完成前不下「没选账号」的结论，避免刷新时闪一下
const configStore = useConfigStore()

// 当前账号来自服务端，SSR 阶段尚未拉取；挂载后再展示，避免水合不一致
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
const EMPTY_ACTIVE_ACCOUNT = {
  id: '',
  phone: '',
  title: '',
  uin: '',
  channel: null as 'wx' | 'app' | null,
  hasCredential: false,
  hasRequestProfile: false,
  requestParamCount: 0,
}

const activeAccount = computed(() =>
  mounted.value && configStore.isInitialized && rawActiveAccount.value
    ? rawActiveAccount.value
    : EMPTY_ACTIVE_ACCOUNT
)

const router = useRouter()
const route = useRoute()

const handleSubmit = async () => {
  const success = await saveConfig()
  if (success) {
    const redirect = route.query.redirect as string
    if (redirect) {
      router.push(redirect)
    }
  }
}

const handleReset = async () => {
  if (confirm('确定要重置所有配置吗？当前账号选择也会被清除。')) {
    await resetConfig()
  }
}

const handleCancel = () => {
  initFormData()
  router.back()
}
</script>
