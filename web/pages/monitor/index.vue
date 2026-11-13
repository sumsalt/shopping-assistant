<template>
  <div class="max-w-6xl mx-auto">
    <LayoutPageHeader title="监控任务" description="管理商品到货监控任务">
      <template #actions>
        <UiButton :loading="isLoading" :disabled="isLoading" @click="fetchTasks">
          <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
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
    <div v-else-if="error" class="bg-white rounded-lg border border-red-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <h3 class="text-lg font-medium text-gray-900 mb-2">加载失败</h3>
        <p class="text-gray-500 mb-4">{{ error }}</p>
        <UiButton variant="outline" @click="fetchTasks">重新加载</UiButton>
      </div>
    </div>

    <!-- 任务列表 -->
    <div v-else-if="tasks.length > 0" class="space-y-4">
      <TaskCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        :busy="busyId === task.id"
        @restart="handleRestart"
        @delete="handleDelete"
      />
    </div>

    <!-- 空状态 -->
    <div v-else class="bg-white rounded-lg border border-gray-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">暂无监控任务</h3>
        <p class="text-gray-500 max-w-sm mb-4">
          到货监控任务请在商品详情页创建：从库存查询或收藏夹进入商品，点击「到货监控」即可
        </p>
        <NuxtLink to="/stock/check">
          <UiButton variant="outline">去库存查询</UiButton>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskSummary } from '@core/contract'

definePageMeta({ title: '监控任务' })

const { tasks, isLoading, error, busyId, fetchTasks, remove, restart } =
  useTaskList('/api/monitor')

const { danger: confirmDelete, warning: confirmRestart } = useConfirmDialog()

const handleDelete = async (task: TaskSummary) => {
  const confirmed = await confirmDelete('确定要删除此监控任务吗？删除后无法恢复。')
  if (confirmed) await remove(task)
}

const handleRestart = async (task: TaskSummary) => {
  const confirmed = await confirmRestart('确定要重新发起此监控任务吗？将创建新的监控任务。')
  if (confirmed) await restart(task)
}

onMounted(fetchTasks)
</script>
