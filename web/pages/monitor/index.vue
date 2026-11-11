<template>
  <div class="max-w-6xl mx-auto">
    <!-- 页面标题 -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">监控任务</h1>
        <p class="mt-1 text-sm text-gray-500">管理商品到货监控任务</p>
      </div>
      <UiButton
        :loading="isLoading"
        :disabled="isLoading"
        @click="handleRefresh"
      >
        <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        刷新
      </UiButton>
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
    <div v-else-if="error" class="bg-white rounded-lg border border-red-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
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
        <div class="p-6">
          <!-- 任务信息行 -->
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <!-- 左侧：状态和时间 -->
            <div class="flex flex-wrap items-center gap-3">
              <UiBadge :variant="getStatusColor(task.status) as 'default' | 'success' | 'warning' | 'danger' | 'info' | 'stock-available' | 'stock-unavailable'" size="md">
                {{ getStatusText(task.status) }}
              </UiBadge>
              <span class="text-sm text-gray-500">
                {{ formatTime(task.createdAt) }}
              </span>
              <span class="text-sm text-gray-400">·</span>
              <span class="text-sm text-gray-600 font-medium">
                {{ task.product.productName }}
              </span>
              <span
                v-if="task.autoOrder?.enabled"
                class="text-xs px-2 py-0.5 rounded border bg-orange-50 text-orange-600 border-orange-100"
              >
                自动下单 × {{ task.autoOrder.num || 1 }}
              </span>
              <span
                v-if="task.skus?.length"
                class="text-xs px-2 py-0.5 rounded border bg-purple-50 text-purple-600 border-purple-100"
              >
                限定 {{ task.skus.length }} 个规格
              </span>
            </div>

            <!-- 右侧：配置信息 -->
            <div class="flex flex-wrap items-center gap-4 text-sm">
              <div class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="text-gray-600">频率由请求闸门控制</span>
              </div>
              <div class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="text-gray-600">最多 {{ formatMonitorDuration(task.duration) }}</span>
              </div>
            </div>
          </div>

          <!-- 请求统计信息 -->
          <div v-if="getTotalRequestCount(task) > 0 || getFailedRequestCount(task) > 0" class="flex flex-wrap items-center gap-4 mb-4 text-sm">
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
              <svg class="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span class="text-blue-700 font-medium">{{ getTotalRequestCount(task) }}</span>
              <span class="text-blue-600">次请求</span>
            </div>
            <div v-if="getFailedRequestCount(task) > 0" class="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-lg border border-red-100">
              <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span class="text-red-700 font-medium">{{ getFailedRequestCount(task) }}</span>
              <span class="text-red-600">次失败</span>
            </div>
          </div>

          <!-- 操作按钮行 -->
          <div class="flex items-center gap-2 pt-3 border-t border-gray-100">
            <UiButton
              variant="outline"
              size="sm"
              :loading="isRestarting(task.id)"
              :disabled="isRestarting(task.id)"
              class="text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300"
              @click="handleRestart(task)"
            >
              <svg v-if="!isRestarting(task.id)" class="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              重新发起
            </UiButton>
            <UiButton
              variant="outline"
              size="sm"
              :loading="isDeleting(task.id)"
              :disabled="isDeleting(task.id)"
              class="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              @click="handleDelete(task)"
            >
              <svg v-if="!isDeleting(task.id)" class="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              删除
            </UiButton>
          </div>

          <!-- 监控结果（已自动下单） -->
          <div v-if="task.result?.orderSn" class="mt-4">
            <div class="bg-green-50 rounded-lg p-3 border border-green-100">
              <p class="text-sm font-medium text-green-800">
                ✓ 已自动下单
                <span v-if="task.result.emailSent" class="text-xs text-green-600">（已发送邮件）</span>
              </p>
              <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-green-800">
                <span>订单号：<strong class="tabular-nums">{{ task.result.orderSn }}</strong></span>
                <span>金额：{{ formatAmount(task.result.orderAmount) }}</span>
                <span v-if="task.result.orderSkuLabel">
                  规格：{{ task.result.orderSkuLabel }}<template v-if="task.result.orderNum"> × {{ task.result.orderNum }}</template>
                </span>
                <span v-if="task.result.orderExpireAt">
                  付款截止：{{ formatExpire(task.result.orderExpireAt) }}
                </span>
              </div>
              <p class="mt-2 text-xs text-green-700">
                订单已锁库存但尚未付款，请到一手 App「我的 → 待付款」完成支付，超时会自动关闭。
              </p>
            </div>
          </div>

          <!-- 自动下单失败 -->
          <div v-else-if="task.result?.orderError" class="mt-4">
            <div class="bg-amber-50 rounded-lg p-3 border border-amber-100">
              <p class="text-sm font-medium text-amber-800">自动下单未成功</p>
              <p class="mt-1 text-xs text-amber-700 break-all">{{ task.result.orderError }}</p>
              <p v-if="task.result.orderUncertain" class="mt-1 text-xs font-medium text-red-600">
                订单可能已经生成，请先到一手 App 核对，避免重复下单。
              </p>
            </div>
          </div>

          <!-- 监控结果（已到货，未开启自动下单） -->
          <div v-else-if="task.result?.detected" class="mt-4">
            <div class="bg-green-50 rounded-lg p-3 border border-green-100">
              <p class="text-sm font-medium text-green-800">
                ✓ 已检测到商品到货
                <span v-if="task.result.emailSent" class="text-xs text-green-600">（已发送邮件）</span>
              </p>
            </div>
          </div>

          <!-- 商品整体有货，但所选规格都还没货 -->
          <div v-else-if="task.result?.skuWaiting" class="mt-4">
            <div class="bg-amber-50 rounded-lg p-3 border border-amber-100">
              <p class="text-sm font-medium text-amber-800">
                商品已补货，但所选规格还没货，继续等待
              </p>
              <p class="mt-1 text-xs text-amber-700">
                该任务只监控你选择的规格，其他规格有货不会提醒
              </p>
            </div>
          </div>
        </div>

        <!-- 商品信息（一个任务只监控一个商品） -->
        <div class="border-t border-gray-100 p-4">
          <div class="flex items-center gap-3">
            <div class="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
              <img
                v-if="task.product.productImage"
                :src="task.product.productImage"
                :alt="task.product.productName"
                class="w-full h-full object-cover"
                loading="lazy"
                @error="handleImageError"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center text-gray-400"
              >
                <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div class="min-w-0">
              <h3 class="text-sm font-medium text-gray-900 truncate" :title="task.product.productName">
                {{ task.product.productName }}
              </h3>
              <p class="text-xs text-gray-500 mt-1">
                ID: {{ task.product.productId }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="bg-white rounded-lg border border-gray-200 p-12">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">暂无监控任务</h3>
        <p class="text-gray-500 mb-4">
          您还没有创建任何监控任务
        </p>
        <NuxtLink to="/collection">
          <UiButton>
            去收藏夹创建
          </UiButton>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatMonitorDuration } from '@/utils/stockMonitorConfig'

// 页面元信息
definePageMeta({
  title: '监控任务',
})

// 使用监控任务管理 composable
const {
  tasks,
  isLoading,
  error,
  fetchTasks,
  deleteTask,
  restartTask,
  refresh,
  getStatusText,
  getStatusColor,
  formatTime,
  formatAmount,
  formatExpire,
  getTotalRequestCount,
  getFailedRequestCount,
} = useMonitorTasks()

// 使用确认弹窗
const { danger: confirmDelete, warning: confirmRestart } = useConfirmDialog()

// 正在删除的任务 ID 集合
const deletingTaskIds = ref<Set<string>>(new Set())

// 正在重新发起的任务 ID 集合
const restartingTaskIds = ref<Set<string>>(new Set())
// 图片加载失败处理
const handleImageError = (event: Event) => {
  const target = event.target as HTMLImageElement
  target.style.display = 'none'
}

// 刷新处理
const handleRefresh = () => {
  refresh()
}

// 判断任务是否正在删除
const isDeleting = (taskId: string): boolean => {
  return deletingTaskIds.value.has(taskId)
}

// 判断任务是否正在重新发起
const isRestarting = (taskId: string): boolean => {
  return restartingTaskIds.value.has(taskId)
}

// 删除任务
const handleDelete = async (task: { id: string }) => {
  const confirmed = await confirmDelete('确定要删除此监控任务吗？删除后无法恢复。')
  if (!confirmed) {
    return
  }

  deletingTaskIds.value.add(task.id)

  try {
    await deleteTask(task.id)
  } finally {
    deletingTaskIds.value.delete(task.id)
  }
}

// 重新发起监控任务
const handleRestart = async (task: { id: string }) => {
  const confirmed = await confirmRestart('确定要重新发起此监控任务吗？将创建新的监控任务。')
  if (!confirmed) {
    return
  }

  restartingTaskIds.value.add(task.id)

  try {
    await restartTask(task.id)
  } finally {
    restartingTaskIds.value.delete(task.id)
  }
}

// 页面加载时自动获取数据
onMounted(() => {
  fetchTasks()
})
</script>
