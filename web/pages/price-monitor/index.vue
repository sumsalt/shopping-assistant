<template>
  <div class="max-w-6xl mx-auto">
    <!-- 页面标题 -->
    <LayoutPageHeader
      title="价格监控"
      description="监控登录态下的商品拿货价，价格变动时发送邮件提醒；任务在商品详情页创建"
    >
      <template #actions>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="isLoading"
          @click="handleRefresh"
        >
          刷新
        </UiButton>
      </template>
    </LayoutPageHeader>

    <!-- 加载状态 -->
    <div v-if="isLoading && tasks.length === 0" class="space-y-4">
      <div v-for="i in 3" :key="i" class="bg-white rounded-lg border border-gray-200 p-6">
        <UiSkeleton variant="text" width="200" height="24" class="mb-4" />
        <UiSkeleton variant="text" width="400" height="16" class="mb-2" />
        <UiSkeleton variant="text" width="300" height="16" />
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error && tasks.length === 0" class="bg-white rounded-lg border border-red-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <h3 class="text-lg font-medium text-gray-900 mb-2">加载失败</h3>
        <p class="text-gray-500 mb-4">{{ error }}</p>
        <UiButton variant="outline" @click="handleRefresh">
          重新加载
        </UiButton>
      </div>
    </div>

    <!-- 任务列表 -->
    <div v-else-if="tasks.length > 0" class="space-y-4">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
      >
        <div class="p-4 sm:p-6">
          <!-- 任务信息 -->
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div class="flex flex-wrap items-center gap-3">
              <UiBadge :variant="getStatusColor(task.status) as 'default' | 'success' | 'warning' | 'danger' | 'info'">
                {{ getStatusText(task.status) }}
              </UiBadge>
              <span class="text-sm text-gray-500">{{ formatTime(task.createdAt) }}</span>
              <span class="text-sm text-gray-400">·</span>
              <span class="text-sm text-gray-600 font-medium">
                {{ task.product.productName }}
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 text-gray-600">
                每轮 {{ formatDuration(task.interval) }}
              </span>
              <span class="px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 text-gray-600">
                最多 {{ formatDuration(task.duration) }}
              </span>
              <span class="px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 text-gray-600">
                {{ getNotifyOnText(task.notifyOn) }}
              </span>
              <span
                v-if="task.autoOrder?.enabled"
                class="px-3 py-1.5 bg-orange-50 rounded-lg border border-orange-100 text-orange-600"
              >
                <template v-if="task.autoOrder.triggerMode === 'discount'">
                  ≤ {{ task.autoOrder.targetDiscount }}折 自动下单 × {{ task.autoOrder.num || 1 }}
                </template>
                <template v-else>
                  ≤ ¥{{ (task.autoOrder.targetPrice ?? 0).toFixed(2) }} 自动下单 × {{ task.autoOrder.num || 1 }}
                </template>
              </span>
            </div>
          </div>

          <!-- 统计信息 -->
          <div class="flex flex-wrap items-center gap-3 mb-4 text-sm">
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
              <span class="text-blue-700 font-medium">{{ task.checkCount }}</span>
              <span class="text-blue-600">次检测</span>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 rounded-lg border border-orange-100">
              <span class="text-orange-700 font-medium">{{ (task.changes?.length ?? 0) }}</span>
              <span class="text-orange-600">次价格变化</span>
            </div>
            <div
              v-if="(task.couponChanges?.length ?? 0) > 0"
              class="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-100"
            >
              <span class="text-amber-700 font-medium">{{ (task.couponChanges?.length ?? 0) }}</span>
              <span class="text-amber-600">次优惠变化</span>
            </div>
            <div
              v-if="task.status === 'running'"
              class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 text-gray-600"
            >
              预计周期 {{ getCycleText(task) }}
            </div>
          </div>

          <!-- 错误提示 -->
          <div v-if="task.lastError" class="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
            {{ task.lastError }}
          </div>

          <!-- 商品当前价格（一个任务只监控一个商品） -->
          <div class="flex items-center justify-between gap-3 p-2 bg-gray-50 rounded-lg">
            <div
              class="flex items-center gap-3 min-w-0 group"
              :class="task.product.productNo ? 'cursor-pointer' : ''"
              :title="task.product.productNo ? '点击查看商品详情' : ''"
              @click="goToProductDetail(task.product.productNo)"
            >
              <div class="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-100">
                <img
                  v-if="task.product.productImage"
                  :src="task.product.productImage"
                  :alt="task.product.productName"
                  class="w-full h-full object-cover"
                >
                <div v-else class="w-full h-full flex items-center justify-center">
                  <svg class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div class="min-w-0">
                <p
                  class="text-sm font-medium truncate"
                  :class="task.product.productNo ? 'text-gray-900 group-hover:text-blue-600' : 'text-gray-900'"
                >
                  {{ task.product.productName || task.snapshot?.productName || task.product.productId }}
                </p>
                <p class="text-xs text-gray-500 flex items-center gap-2">
                  <span>ID：{{ task.product.productId }}</span>
                  <span v-if="task.product.productNo" class="text-blue-600 inline-flex items-center gap-0.5">
                    查看详情
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </p>
              </div>
            </div>

            <div class="text-right flex-shrink-0">
              <p
                v-if="task.snapshot"
                class="text-sm font-bold text-red-600"
              >
                ¥{{ task.snapshot.shopPrice.toFixed(2) }}
              </p>
              <p v-else class="text-sm text-gray-400">待检测</p>
              <p
                v-if="task.snapshot"
                class="text-xs text-gray-400"
              >
                {{ formatTime(task.snapshot.checkedAt) }}
              </p>
            </div>
          </div>

          <!-- 自动下单结果 -->
          <div
            v-if="task.order"
            class="mt-4 p-3 rounded-lg bg-green-50 border border-green-100 text-sm text-green-800"
          >
            <p class="font-medium">✓ 价格到点已自动下单</p>
            <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span>订单号：<strong class="tabular-nums">{{ task.order.orderSn }}</strong></span>
              <span>金额：{{ formatAmount(task.order.orderAmount) }}</span>
              <span v-if="task.order.items?.length">
                规格：{{ task.order.items.map(item => `${item.skuLabel} × ${item.num}`).join('、') }}
              </span>
              <span v-else-if="task.order.skuLabel">
                规格：{{ task.order.skuLabel }}<template v-if="task.order.num"> × {{ task.order.num }}</template>
              </span>
              <span v-if="task.order.expireAt">
                付款截止：{{ formatExpire(task.order.expireAt) }}
              </span>
            </div>
            <p class="mt-2 text-xs text-green-700">
              订单已锁库存但尚未付款，请到一手 App「我的 → 待付款」完成支付，超时会自动关闭。
            </p>
          </div>

          <!-- 到价但没下成：无货时只是跳过，不算下单失败 -->
          <div
            v-else-if="task.orderError"
            class="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-100 text-sm text-amber-800"
          >
            <p class="font-medium">
              {{ task.orderSkipped === 'no_stock' ? '已到目标价，等待补货' : '已到目标价，但自动下单未成功' }}
            </p>
            <p class="mt-1 text-xs">{{ task.orderError }}</p>
            <p v-if="task.status === 'running'" class="mt-1 text-xs text-amber-700">
              {{
                task.orderSkipped === 'no_stock'
                  ? '本轮没有发起下单，补货后会自动买入。'
                  : '任务仍在监控，下一轮会继续尝试。'
              }}
            </p>
          </div>

          <!-- 变化记录 -->
          <div
            v-if="task.changes.length > 0 || (task.couponChanges?.length ?? 0) > 0"
            class="mt-4 pt-4 border-t border-gray-100"
          >
            <p class="text-sm font-medium text-gray-700 mb-2">最近变化</p>
            <div class="space-y-1.5">
              <div
                v-for="(change, index) in task.changes.slice(0, 5)"
                :key="`${change.productId}-${change.detectedAt}-${index}`"
                class="flex flex-wrap items-center gap-2 text-sm"
              >
                <span
                  :class="[
                    'font-medium',
                    change.direction === 'down' ? 'text-green-600' : 'text-red-600',
                  ]"
                >
                  {{ change.direction === 'down' ? '降价' : '涨价' }}
                </span>
                <span class="text-gray-500">
                  ¥{{ change.previousPrice.toFixed(2) }} → ¥{{ change.currentPrice.toFixed(2) }}
                </span>
                <span :class="change.direction === 'down' ? 'text-green-600' : 'text-red-600'">
                  {{ change.delta > 0 ? '+' : '' }}{{ change.delta.toFixed(2) }}
                  （{{ change.deltaPercent > 0 ? '+' : '' }}{{ change.deltaPercent.toFixed(2) }}%）
                </span>
                <span class="text-xs text-gray-400">
                  {{ formatTime(change.detectedAt) }}
                </span>
                <span
                  v-if="change.emailSent === false"
                  class="text-xs text-red-500"
                >
                  邮件发送失败
                </span>
              </div>

              <!-- 优惠券变化 -->
              <div
                v-for="(couponChange, index) in (task.couponChanges || []).slice(0, 5)"
                :key="`coupon-${couponChange.detectedAt}-${index}`"
                class="flex flex-wrap items-center gap-2 text-sm"
              >
                <span class="font-medium text-amber-600">优惠券</span>
                <span
                  v-if="couponChange.added.length > 0"
                  class="text-green-600"
                >
                  新增 {{ couponChange.added.map(item => item.label).join('、') }}
                </span>
                <span
                  v-if="couponChange.removed.length > 0"
                  class="text-gray-400 line-through"
                >
                  失效 {{ couponChange.removed.map(item => item.label).join('、') }}
                </span>
                <span class="text-xs text-gray-400">
                  {{ formatTime(couponChange.detectedAt) }}
                </span>
                <span
                  v-if="couponChange.emailSent === false"
                  class="text-xs text-red-500"
                >
                  邮件发送失败
                </span>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex items-center gap-2 pt-4 mt-4 border-t border-gray-100">
            <UiButton
              variant="outline"
              size="sm"
              class="text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300"
              :disabled="isLoading"
              @click="handleRestart(task)"
            >
              重新发起
            </UiButton>
            <UiButton
              variant="outline"
              size="sm"
              class="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              :disabled="isLoading"
              @click="handleDelete(task)"
            >
              删除
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="bg-white rounded-lg border border-gray-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">还没有价格监控任务</h3>
        <p class="text-gray-500 max-w-sm mb-4">
          价格监控任务请在商品详情页创建：从库存查询或收藏夹进入商品，点击「价格监控」后设置参数即可
        </p>
        <NuxtLink to="/stock/check">
          <UiButton variant="outline">
            去库存查询
          </UiButton>
        </NuxtLink>
      </div>
    </div>

    <!-- 使用说明 -->
    <div class="mt-6 p-4 bg-blue-50 rounded-lg">
      <h4 class="text-sm font-medium text-blue-800 mb-2">使用说明</h4>
      <ul class="text-sm text-blue-700 list-disc list-inside space-y-1">
        <li>价格监控只对比登录态（uid + token）下的拿货价，未配置登录态无法使用</li>
        <li>检测间隔最低 60 秒；一个任务只监控一个商品，多个商品请分别创建任务</li>
        <li>首次检测只建立基线，不会发送通知</li>
        <li>价格变化会通过邮件通知，每轮检测（最短 60 秒）最多一封，检测到变化即推送</li>
        <li>开启「价格到点自动下单」后，拿货价 ≤ 目标价（或折扣 ≤ 目标折扣）时会自动创建待付款订单；下单成功后任务自动结束，货款仍需你手动支付</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  title: '价格监控',
})

const confirmDialog = useConfirmDialog()

/**
 * 跳到商品详情页
 *
 * 只有创建时落库了货号的新任务能跳；历史任务没有货号，简单降级为不可点
 * （不做「商品 ID → 货号」的实时解析，避免为老数据引入额外请求与复杂度）。
 */
const goToProductDetail = (productNo?: string) => {
  if (!productNo) return
  navigateTo(`/stock/${encodeURIComponent(productNo)}`)
}

const {
  tasks,
  isLoading,
  error,
  fetchTasks,
  deleteTask,
  restartTask,
  getStatusText,
  getStatusColor,
  formatTime,
  getNotifyOnText,
  getCycleText,
  formatDuration,
  formatAmount,
  formatExpire,
} = usePriceMonitorTasks()

/**
 * 刷新
 */
const handleRefresh = () => {
  fetchTasks()
}

/**
 * 重新发起
 */
const handleRestart = async (task: { id: string }) => {
  await restartTask(task.id)
}

/**
 * 删除任务
 */
const handleDelete = async (task: { id: string; product: { productId: string; productName?: string } }) => {
  const confirmed = await confirmDialog.confirm({
    title: '删除价格监控',
    message: `确定要删除「${task.product.productName || task.product.productId}」的价格监控任务吗？`,
    confirmText: '删除',
    cancelText: '取消',
  })

  if (!confirmed) {
    return
  }

  await deleteTask(task.id)
}

// 页面加载时获取任务列表
onMounted(() => {
  fetchTasks()
})
</script>
