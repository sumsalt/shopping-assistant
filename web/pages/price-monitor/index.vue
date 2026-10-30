<template>
  <div class="max-w-6xl mx-auto">
    <!-- 页面标题 -->
    <div class="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">价格监控</h1>
        <p class="mt-1 text-sm text-gray-500">
          监控登录态下的商品拿货价，价格变动时发送邮件提醒
        </p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <UiButton
          variant="outline"
          size="sm"
          class="whitespace-nowrap"
          :disabled="isLoading"
          @click="handleRefresh"
        >
          刷新
        </UiButton>
        <UiButton
          size="sm"
          class="whitespace-nowrap"
          :disabled="isLoading"
          @click="showCreateDialog = true"
        >
          添加商品
        </UiButton>
      </div>
    </div>

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
            </div>
          </div>

          <!-- 统计信息 -->
          <div class="flex flex-wrap items-center gap-3 mb-4 text-sm">
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
              <span class="text-blue-700 font-medium">{{ task.checkCount }}</span>
              <span class="text-blue-600">次检测</span>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 rounded-lg border border-orange-100">
              <span class="text-orange-700 font-medium">{{ task.detectedCount }}</span>
              <span class="text-orange-600">次价格变化</span>
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
            <div class="flex items-center gap-3 min-w-0">
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
                <p class="text-sm font-medium text-gray-900 truncate">
                  {{ task.product.productName || task.snapshot?.productName || task.product.productId }}
                </p>
                <p class="text-xs text-gray-500">
                  ID：{{ task.product.productId }}
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

          <!-- 变化记录 -->
          <div v-if="task.changes.length > 0" class="mt-4 pt-4 border-t border-gray-100">
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
          添加商品后，系统会按设定的间隔检测拿货价变化，并在变动时发送邮件提醒
        </p>
        <UiButton class="whitespace-nowrap" @click="showCreateDialog = true">
          添加商品
        </UiButton>
      </div>
    </div>

    <!-- 创建弹窗 -->
    <PriceMonitorDialog
      v-model:open="showCreateDialog"
      :product="pendingProduct"
      @created="handleCreated"
    />

    <!-- 使用说明 -->
    <div class="mt-6 p-4 bg-blue-50 rounded-lg">
      <h4 class="text-sm font-medium text-blue-800 mb-2">使用说明</h4>
      <ul class="text-sm text-blue-700 list-disc list-inside space-y-1">
        <li>价格监控只对比登录态（uid + token）下的拿货价，未配置登录态无法使用</li>
        <li>检测间隔最低 60 秒；一个任务只监控一个商品，多个商品请分别创建任务</li>
        <li>首次检测只建立基线，不会发送通知</li>
        <li>价格变化会通过邮件通知，同一商品有通知冷却时间，避免价格抖动刷屏</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PriceMonitorProduct } from '~/composables/usePriceMonitor'

definePageMeta({
  title: '价格监控',
})

const confirmDialog = useConfirmDialog()

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
} = usePriceMonitorTasks()

// 创建弹窗（页面入口不指定商品，弹窗内先查询再设置参数）
const showCreateDialog = ref(false)
const pendingProduct = ref<PriceMonitorProduct | null>(null)

/**
 * 创建成功
 */
const handleCreated = async () => {
  await fetchTasks()
}

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
