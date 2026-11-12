<template>
  <div class="max-w-6xl mx-auto">
    <!-- 页面标题 -->
    <LayoutPageHeader
      title="订单续期"
      description="每分钟扫描账号下的待支付订单，自动为支付有效期不足 5 分钟的订单刷新有效期"
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
        <UiButton size="sm" @click="showCreateDialog = true">
          <svg class="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建任务
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
                {{ accountName(task.account) }}
              </span>
              <span
                v-if="task.source === 'auto'"
                class="text-xs px-2 py-0.5 rounded border bg-purple-50 text-purple-600 border-purple-100"
              >
                自动创建
              </span>
              <span
                v-else
                class="text-xs px-2 py-0.5 rounded border bg-gray-50 text-gray-500 border-gray-100"
              >
                手动创建
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 text-gray-600">
                {{ getCycleText() }}
              </span>
              <span class="px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 text-gray-600">
                持续 {{ formatDuration(task.duration) }}
              </span>
            </div>
          </div>

          <!-- 统计信息 -->
          <div class="flex flex-wrap items-center gap-3 mb-4 text-sm">
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
              <span class="text-blue-700 font-medium">{{ task.checkCount }}</span>
              <span class="text-blue-600">轮扫描</span>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
              <span class="text-gray-700 font-medium">{{ task.scannedCount }}</span>
              <span class="text-gray-600">单扫过</span>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-lg border border-green-100">
              <span class="text-green-700 font-medium">{{ task.renewedCount }}</span>
              <span class="text-green-600">次续期</span>
            </div>
            <div
              v-if="task.finishedCount > 0"
              class="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-100"
            >
              <span class="text-amber-700 font-medium">{{ task.finishedCount }}</span>
              <span class="text-amber-600">单已结束</span>
            </div>
            <div
              v-if="task.lastScanAt"
              class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 text-gray-600"
            >
              最近扫描 {{ formatTime(task.lastScanAt) }}
            </div>
          </div>

          <!-- 错误提示 -->
          <div v-if="task.lastError" class="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
            {{ task.lastError }}
          </div>

          <!-- 最近续期记录 -->
          <div v-if="(task.recentRenewals?.length ?? 0) > 0" class="mb-4">
            <p class="text-sm font-medium text-gray-700 mb-2">最近续期</p>
            <div class="space-y-1.5">
              <div
                v-for="(renewal, index) in (task.recentRenewals ?? []).slice(0, 5)"
                :key="`${renewal.orderSn}-${renewal.renewedAt}-${index}`"
                class="flex flex-wrap items-center gap-2 text-sm"
              >
                <span class="font-medium text-gray-700 tabular-nums">{{ renewal.orderSn }}</span>
                <template v-if="renewal.finishedReason">
                  <span class="text-gray-500">{{ renewal.finishedReason }}</span>
                </template>
                <template v-else>
                  <span class="text-green-600 font-medium">已刷新</span>
                  <span v-if="renewal.remainingBefore !== undefined" class="text-gray-500">
                    剩 {{ formatDuration(renewal.remainingBefore) }} 时续期
                  </span>
                  <span v-if="renewal.expireAfter" class="text-gray-500">
                    → 截止 {{ formatExpire(renewal.expireAfter) }}
                  </span>
                  <span v-if="renewal.orderAmount !== undefined" class="text-gray-500">
                    {{ formatAmount(renewal.orderAmount) }}
                  </span>
                  <span v-if="renewal.verified === false" class="text-xs text-amber-600">
                    有效期未确认后移，待核对
                  </span>
                </template>
                <span class="text-xs text-gray-400">{{ formatTime(renewal.renewedAt) }}</span>
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
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">还没有订单续期任务</h3>
        <p class="text-gray-500 max-w-sm mb-4">
          选择一个带登录态的账号创建任务，系统每分钟会为快到期的待付款订单自动刷新支付有效期
        </p>
        <UiButton @click="showCreateDialog = true">
          新建续期任务
        </UiButton>
      </div>
    </div>

    <!-- 使用说明 -->
    <div class="mt-6 p-4 bg-blue-50 rounded-lg">
      <h4 class="text-sm font-medium text-blue-800 mb-2">使用说明</h4>
      <ul class="text-sm text-blue-700 list-disc list-inside space-y-1">
        <li>每分钟扫描一次所选账号的「待付款」订单，仅当服务端返回的剩余可支付时间不足 5 分钟时才发起续期</li>
        <li>续期通过「重新提交支付」把有效期刷新回 20 分钟，不会新建订单、不会扣款，货款仍需你到一手 App 手动支付</li>
        <li>每个账号同时只能有一个续期任务；到货 / 价格监控自动下单成功后，若该账号还没有续期任务，会自动创建一个 12 小时的任务</li>
        <li>同一订单续期后有 4 分钟冷却，避免有效期未刷新时被反复提交</li>
        <li>任务到期自动结束；账号登录态失效会停止任务，请到账号管理更新抓包快照后重新发起</li>
      </ul>
    </div>

    <!-- 创建弹窗 -->
    <OrderRenewDialog v-model:open="showCreateDialog" @created="handleCreated" />
  </div>
</template>

<script setup lang="ts">
import { accountDisplayName } from '@/utils/accountName'
import type { OrderRenewTaskItem, RenewTaskAccount } from '@/composables/useOrderRenewTasks'

definePageMeta({
  title: '订单续期',
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
  formatDuration,
  formatAmount,
  formatExpire,
  getCycleText,
} = useOrderRenewTasks()

const showCreateDialog = ref(false)

/** 账号摘要可能缺失（老数据 / 账号已删），给个兜底 */
const accountName = (account: RenewTaskAccount | null): string =>
  account ? accountDisplayName(account) : '未知账号'

const handleRefresh = () => {
  fetchTasks()
}

/** 创建成功后刷新列表 */
const handleCreated = () => {
  fetchTasks()
}

const handleRestart = async (task: OrderRenewTaskItem) => {
  await restartTask(task.id)
}

const handleDelete = async (task: OrderRenewTaskItem) => {
  const confirmed = await confirmDialog.confirm({
    title: '删除订单续期任务',
    message: `确定要删除「${accountName(task.account)}」的订单续期任务吗？`,
    confirmText: '删除',
    cancelText: '取消',
  })

  if (!confirmed) {
    return
  }

  await deleteTask(task.id)
}

onMounted(() => {
  fetchTasks()
})
</script>
