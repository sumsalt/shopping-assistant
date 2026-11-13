<template>
  <div class="relative" @keydown.esc="isOpen = false">
    <!-- 触发按钮：显示当前正在查看的账号 -->
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      @click="toggle"
    >
      <svg class="h-4 w-4 flex-shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      <span class="max-w-[8rem] truncate">{{ currentLabel }}</span>
      <svg class="h-4 w-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- 点击空白关闭（层级低于下拉面板，高于页面内容，且低于全局 Toast） -->
    <div
      v-if="isOpen"
      class="fixed inset-0 z-20"
      @click="isOpen = false"
    />

    <!-- 账号下拉：窄屏从按钮左侧展开（right-0 会把 288px 面板顶出视口左边），宽屏再右对齐 -->
    <div
      v-if="isOpen"
      class="absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg sm:left-auto sm:right-0"
      role="listbox"
    >
      <p class="border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500">
        切换账号只改变本页查看的数据，<strong class="font-medium text-gray-700">不会改变「当前使用账号」</strong>
      </p>

      <div class="max-h-72 overflow-y-auto py-1">
        <!-- 默认：当前使用账号 -->
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50"
          :class="!currentAccountId ? 'bg-blue-50 text-blue-700' : 'text-gray-700'"
          role="option"
          :aria-selected="!currentAccountId"
          @click="select(null)"
        >
          <span>
            <span class="block font-medium">当前使用账号（默认）</span>
            <span class="mt-0.5 block text-xs text-gray-500">{{ activeAccountLabel }}</span>
          </span>
          <svg v-if="!currentAccountId" class="h-4 w-4 flex-shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </button>

        <div class="my-1 border-t border-gray-100" />

        <!-- 逐个账号临时查看 -->
        <button
          v-for="item in accounts"
          :key="item.id"
          type="button"
          class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
          :class="[
            !item.hasRequestProfile ? 'cursor-not-allowed opacity-50' : 'hover:bg-blue-50',
            currentAccountId === item.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700',
          ]"
          :disabled="!item.hasRequestProfile"
          role="option"
          :aria-selected="currentAccountId === item.id"
          @click="select(item.id)"
        >
          <span class="min-w-0">
            <span class="block truncate font-medium">{{ accountDisplayName(item) }}</span>
            <span class="mt-0.5 block truncate text-xs text-gray-500">
              {{ item.title ? item.phone : (item.uin || '未设置 uin') }}
              <template v-if="item.isActive"> · 当前使用</template>
              <template v-if="!item.hasRequestProfile"> · 未保存抓包，不可查看</template>
              <template v-else-if="!item.hasCredential"> · 无登录态，可能无法加载</template>
            </span>
          </span>
          <svg v-if="currentAccountId === item.id" class="h-4 w-4 flex-shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </button>

        <p v-if="isLoading" class="px-3 py-3 text-center text-xs text-gray-500">加载账号中…</p>
        <p v-else-if="accounts.length === 0" class="px-3 py-3 text-center text-xs text-gray-500">暂无账号</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 收藏夹 / 订单页的账号快速切换入口
 *
 * 页面本来就支持 ?accountId=xxx 临时查看指定账号（服务端按登录用户校验归属，
 * 不改变 accounts.is_active）。这里只是把「去账号管理页点跳转」变成页内下拉，
 * 切换时改路由 query 即可，页面的 watch(accountId) 会自动重新拉数据。
 */

import { accountDisplayName } from '@/utils/accountName'
import type { AccountItem } from '@/composables/useAccounts'
import type { ApiResponse } from '@/types'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const accounts = ref<AccountItem[]>([])
const isLoading = ref(false)
const isOpen = ref(false)

/** URL 上正在临时查看的账号；为空表示看「当前使用账号」 */
const currentAccountId = computed(() => {
  const value = route.query.accountId
  return typeof value === 'string' && value.trim() ? value.trim() : null
})

const currentLabel = computed(() => {
  if (!currentAccountId.value) return '当前账号'
  const hit = accounts.value.find(item => item.id === currentAccountId.value)
  return hit ? accountDisplayName(hit) : '指定账号'
})

const activeAccountLabel = computed(() => {
  const active = accounts.value.find(item => item.isActive)
  return active ? accountDisplayName(active) : '未选择账号'
})

/** 每次展开都重拉，账号管理页新增/修改后回来立刻可见 */
const fetchAccounts = async () => {
  if (isLoading.value) return
  isLoading.value = true
  try {
    const response = await $fetch<ApiResponse<{ accounts: AccountItem[] }>>('/api/accounts/list')
    if (response.success && response.data) {
      accounts.value = response.data.accounts
    } else {
      toast.error(response.error?.message || '加载账号列表失败')
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '加载账号列表失败')
  } finally {
    isLoading.value = false
  }
}

const toggle = () => {
  isOpen.value = !isOpen.value
  if (isOpen.value) void fetchAccounts()
}

/** 保留其它 query 参数，只增删 accountId；页面监听它自动刷新 */
const select = (id: string | null) => {
  isOpen.value = false
  const query = { ...route.query }
  if (id) {
    query.accountId = id
  } else {
    delete query.accountId
  }
  void router.push({ path: route.path, query })
}
</script>
