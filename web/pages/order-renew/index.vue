<template>
  <div class="max-w-6xl mx-auto">
    <TaskListHeader
      v-model="statusFilter"
      title="订单续期"
      description="每分钟扫描账号下的待支付订单，自动为支付有效期不足 5 分钟的订单刷新有效期"
      :is-loading="isLoading"
      :total="tasks.length"
      :counts="statusCounts"
      @refresh="fetchTasks()"
    >
      <template #actions>
        <UiButton size="sm" @click="showCreateDialog = true">
          <svg class="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建任务
        </UiButton>
      </template>
    </TaskListHeader>

    <div v-if="isLoading && tasks.length === 0" class="space-y-4">
      <div v-for="i in 3" :key="i" class="bg-white rounded-lg border border-gray-200 p-6">
        <UiSkeleton variant="text" width="200" height="24" class="mb-4" />
        <UiSkeleton variant="text" width="400" height="16" class="mb-2" />
        <UiSkeleton variant="text" width="300" height="16" />
      </div>
    </div>

    <div v-else-if="error && tasks.length === 0" class="bg-white rounded-lg border border-red-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <h3 class="text-lg font-medium text-gray-900 mb-2">加载失败</h3>
        <p class="text-gray-500 mb-4">{{ error }}</p>
        <UiButton variant="outline" @click="fetchTasks()">重新加载</UiButton>
      </div>
    </div>

    <!-- 完全没有任务 -->
    <div v-else-if="tasks.length === 0" class="bg-white rounded-lg border border-gray-200 p-8">
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
        <UiButton @click="showCreateDialog = true">新建续期任务</UiButton>
      </div>
    </div>

    <!-- 有任务但当前状态下没有（筛选后无结果） -->
    <div v-else-if="filteredTasks.length === 0" class="bg-white rounded-lg border border-gray-200">
      <UiEmptyState
        type="search"
        title="该状态下暂无任务"
        description="换个状态看看，或切回「全部」。"
        action-text="查看全部"
        action-variant="outline"
        @action="statusFilter = 'all'"
      />
    </div>

    <!-- 任务列表 -->
    <div v-else class="space-y-4">
      <TaskCard
        v-for="task in filteredTasks"
        :key="task.id"
        :task="task"
        :busy="busyId === task.id"
        @restart="handleRestart"
        @delete="handleDelete"
      />
    </div>

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

    <OrderRenewDialog v-model:open="showCreateDialog" @created="fetchTasks()" />
  </div>
</template>

<script setup lang="ts">
import { taskEndpoint } from '@/utils/taskApi'
import type { TaskSummary } from '@core/contract'

definePageMeta({ title: '订单续期' })

const { tasks, isLoading, error, busyId, statusFilter, filteredTasks, statusCounts, fetchTasks, remove, restart } =
  useTaskList(taskEndpoint('renew'))

const confirmDialog = useConfirmDialog()
const showCreateDialog = ref(false)

const handleRestart = async (task: TaskSummary) => {
  await restart(task)
}

const handleDelete = async (task: TaskSummary) => {
  const confirmed = await confirmDialog.confirm({
    title: '删除订单续期任务',
    message: `确定要删除「${task.target.name}」的订单续期任务吗？`,
    confirmText: '删除',
    cancelText: '取消',
  })
  if (confirmed) await remove(task)
}

onMounted(fetchTasks)
</script>
