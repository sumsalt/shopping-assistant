<template>
  <div class="max-w-4xl mx-auto">
    <!-- 页面标题 -->
    <LayoutPageHeader
      title="订单"
      :description="accountId ? '查看指定账号的订单，不改变当前使用账号' : '查看当前账号的订单，点击商品可进入详情页'"
    >
      <template #actions>
        <UiButton
          :loading="isLoading"
          :disabled="isLoading"
          @click="refresh"
        >
          <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </UiButton>
      </template>
    </LayoutPageHeader>

    <!-- 指定账号提示：临时查看，不改变当前使用账号 -->
    <div
      v-if="accountId"
      class="mb-5 flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm"
    >
      <span class="text-blue-800">
        <template v-if="viewingAccount">
          正在查看
          <strong>{{ accountDisplayName(viewingAccount) }}</strong>
          的订单（不改变当前使用账号）
        </template>
        <template v-else-if="isLoading">
          正在加载指定账号的订单…
        </template>
        <template v-else>
          正在查看指定账号的订单（不改变当前使用账号）
        </template>
      </span>
      <NuxtLink to="/orders" class="sm:ml-auto text-xs text-blue-600 hover:text-blue-700 shrink-0">
        返回默认订单 →
      </NuxtLink>
    </div>

    <!-- 状态筛选：一手 5 个 tab，切换时整页重拉 -->
    <div class="mb-4 flex flex-wrap gap-2">
      <button
        v-for="tab in ORDER_STATUS_OPTIONS"
        :key="tab.value"
        type="button"
        class="px-3 py-1 text-xs font-medium rounded-full border transition-colors whitespace-nowrap"
        :class="status === tab.value
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'"
        @click="status = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 加载骨架 -->
    <div v-if="isLoading && orders.length === 0" class="space-y-4">
      <div v-for="i in 3" :key="i" class="bg-white rounded-lg border border-gray-200 p-4">
        <div class="flex items-center justify-between mb-4">
          <UiSkeleton variant="text" width="200" height="18" />
          <UiSkeleton variant="text" width="60" height="18" />
        </div>
        <div class="flex gap-3">
          <UiSkeleton variant="rounded" width="56" height="56" />
          <div class="flex-1 space-y-2">
            <UiSkeleton variant="text" width="80%" height="16" />
            <UiSkeleton variant="text" width="40%" height="14" />
          </div>
        </div>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="bg-white rounded-lg border border-red-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">订单加载失败</h3>
        <p class="text-gray-500 mb-4 break-all">{{ error }}</p>
        <UiButton variant="outline" @click="refresh">
          重新加载
        </UiButton>
      </div>
    </div>

    <!-- 订单内容 -->
    <div v-else-if="orders.length > 0" class="space-y-4">
      <div class="flex items-center justify-between px-1 text-sm text-gray-500">
        <span>已加载 {{ orders.length }} 笔{{ activeStatusLabel === '全部' ? '' : activeStatusLabel }}订单</span>
        <span class="text-xs text-gray-400">一手按时间倒序返回，每页 10 笔</span>
      </div>

      <article
        v-for="order in orders"
        :key="order.orderSn"
        class="bg-white rounded-lg border border-gray-200 overflow-hidden"
      >
        <!-- 订单头 -->
        <header class="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div class="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="font-mono text-sm text-gray-700">{{ order.orderSn }}</span>
            <UiBadge :variant="statusVariant(order.statusName)" size="sm">
              {{ order.statusName || '未知状态' }}
            </UiBadge>
            <!-- 待付款订单：按支付截止时间实时倒数 -->
            <span
              v-if="remainingSeconds(order.cancelExpireAt) !== null"
              :class="['text-xs tabular-nums', remainingClass(remainingSeconds(order.cancelExpireAt) || 0)]"
            >
              {{ remainingLabel(order.cancelExpireAt) }}
            </span>
          </div>
          <span class="ml-auto shrink-0 text-xs text-gray-500">{{ formatOrderTime(order.addTime) }}</span>
        </header>

        <!-- 商品明细 -->
        <div class="divide-y divide-gray-100">
          <component
            :is="item.goodsNo ? 'button' : 'div'"
            v-for="item in order.items"
            :key="`${order.orderSn}-${item.goodsId}-${item.specText}`"
            :type="item.goodsNo ? 'button' : undefined"
            class="w-full flex gap-3 px-4 py-3 text-left"
            :class="item.goodsNo ? 'hover:bg-gray-50 transition-colors' : ''"
            @click="item.goodsNo && goToProduct(item.goodsNo)"
          >
            <img
              v-if="item.goodsImage"
              :src="item.goodsImage"
              :alt="item.goodsName"
              class="w-14 h-14 rounded-md border border-gray-200 object-cover shrink-0 bg-gray-50"
              loading="lazy"
            >
            <div v-else class="w-14 h-14 rounded-md border border-gray-200 bg-gray-100 shrink-0" />

            <div class="min-w-0 flex-1">
              <p class="text-sm text-gray-900 line-clamp-2" :title="item.goodsName">
                {{ item.goodsName || '未知商品' }}
              </p>
              <p v-if="item.specText" class="mt-0.5 text-xs text-gray-500 break-all">
                {{ item.specText }}
              </p>
              <div class="mt-1 flex items-center justify-between gap-2 text-sm">
                <span class="text-gray-500">
                  ¥{{ formatAmount(item.price) }} × {{ item.num }}
                </span>
                <span v-if="item.num > 1" class="font-medium text-gray-900">
                  ¥{{ formatAmount(item.price * item.num) }}
                </span>
              </div>
            </div>
          </component>
        </div>

        <!-- 订单汇总 -->
        <footer class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 text-sm">
          <span class="text-gray-500">
            共 {{ order.totalNum }} 件
            <template v-if="order.shippingFee !== undefined">
              · 运费 ¥{{ formatAmount(order.shippingFee) }}
            </template>
            <span
              v-if="order.message && order.message !== order.statusName"
              class="ml-2 text-gray-400"
            >{{ order.message }}</span>
          </span>
          <span class="text-gray-900">
            合计
            <strong class="text-base text-red-600">¥{{ formatAmount(order.orderAmount) }}</strong>
          </span>
        </footer>
      </article>

      <!-- 加载更多 -->
      <div v-if="hasMore" class="flex justify-center pt-2 pb-4">
        <UiButton variant="outline" :loading="isLoading" @click="loadMore">
          加载更多
        </UiButton>
      </div>
      <p v-else class="text-center text-xs text-gray-400 pb-4">没有更多订单了</p>
    </div>

    <!-- 空状态 -->
    <div v-else class="bg-white rounded-lg border border-gray-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">
          {{ status === 'all' ? '还没有订单' : `没有${activeStatusLabel}的订单` }}
        </h3>
        <p class="text-gray-500">
          {{ accountId ? '该账号在一手上还没有此类订单' : '当前账号在一手上还没有此类订单' }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { OrderStatusTab } from '@core'
import { accountDisplayName } from '@/utils/accountName'
import { formatRemaining } from '@/utils/taskFormat'

definePageMeta({
  title: '订单',
})

// 指定账号 ID：从账号管理跳转时带上，只临时查看、不改变当前使用账号
const route = useRoute()
const accountId = computed<string | null>(() => {
  const value = route.query.accountId
  return typeof value === 'string' && value.trim() ? value.trim() : null
})

/** 状态 tab：默认「全部」，与一手 order_status 一一对应 */
const status = ref<OrderStatusTab>('all')

const activeStatusLabel = computed(
  () => ORDER_STATUS_OPTIONS.find(tab => tab.value === status.value)?.label ?? '全部'
)

const { orders, isLoading, error, hasMore, account, refresh, loadMore } = useOrders(accountId, status)

/** 本次查询实际使用的账号（查询成功后由服务端返回） */
const viewingAccount = computed(() => {
  if (!accountId.value) {
    return null
  }
  return account.value?.id === accountId.value ? account.value : null
})

/** 金额统一两位小数，缺值显示 0.00 */
const formatAmount = (value?: number): string => (value ?? 0).toFixed(2)

/** 时间：2026-11-12 02:18:32 → 11-12 02:18；格式不符时原样返回 */
const formatOrderTime = (value: string): string =>
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? value.slice(5, 16) : value

/** 状态配色：按文案关键词归类，避免依赖会变的一手状态码 */
const statusVariant = (name: string): 'default' | 'success' | 'warning' | 'danger' | 'info' => {
  if (/退款|售后|失败/.test(name)) return 'danger'
  if (/待付款|待支付|待确认/.test(name)) return 'warning'
  if (/待发货|待收货|已发货|配送|运输|待自提/.test(name)) return 'info'
  if (/完成|已收货|交易成功/.test(name)) return 'success'
  return 'default'
}

const goToProduct = (productNo: string) => {
  navigateTo(`/stock/${productNo}`)
}

onMounted(() => {
  refresh()
})

// 切换账号或返回默认订单（query 变化）时重新拉取，并清空上一账号的列表
watch(accountId, () => {
  refresh()
})

// 切换状态 tab 也要重新从第一页拉
watch(status, () => {
  refresh()
})

/**
 * 支付倒计时
 *
 * 一手只在待付款订单上给 cancelExpireAt（毫秒时间戳），列表里其它状态没有，
 * 所以有值就说明这单还没付款。秒级刷新一个 now，所有订单共用。
 */
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})

/** 剩余秒数；没有截止时间返回 null（不显示） */
const remainingSeconds = (expireAt?: number): number | null => {
  if (!expireAt) return null
  return Math.ceil((expireAt - now.value) / 1000)
}

const remainingLabel = (expireAt?: number): string => {
  const seconds = remainingSeconds(expireAt)
  if (seconds === null) return ''
  return seconds > 0 ? `支付剩余 ${formatRemaining(seconds)}` : '支付已超时'
}

/** 剩余不足 5 分钟标红（与续期窗口一致），不足 30 分钟标黄 */
const remainingClass = (seconds: number): string => {
  if (seconds <= 0) return 'text-gray-400'
  if (seconds <= 5 * 60) return 'text-red-600 font-medium'
  if (seconds <= 30 * 60) return 'text-amber-600'
  return 'text-gray-500'
}
</script>
