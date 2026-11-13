<template>
  <div class="max-w-6xl mx-auto">
    <LayoutPageHeader
      title="价格监控"
      description="监控登录态下的商品拿货价，价格与优惠券变化时发送邮件提醒；任务在商品详情页创建"
    >
      <template #actions>
        <UiButton variant="outline" size="sm" :disabled="isLoading" @click="fetchTasks()">
          刷新
        </UiButton>
      </template>
    </LayoutPageHeader>

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
          <UiButton variant="outline">去库存查询</UiButton>
        </NuxtLink>
      </div>
    </div>

    <div class="mt-6 p-4 bg-blue-50 rounded-lg">
      <h4 class="text-sm font-medium text-blue-800 mb-2">使用说明</h4>
      <ul class="text-sm text-blue-700 list-disc list-inside space-y-1">
        <li>价格监控只对比登录态（uid + token）下的拿货价，未配置登录态无法使用</li>
        <li>检测间隔最低 60 秒；一个任务只监控一个商品，多个商品请分别创建任务</li>
        <li>首次检测只建立基线，不会发送通知</li>
        <li>价格或优惠券变化会通过邮件通知，每轮检测最多一封</li>
        <li>开启「价格到点自动下单」后，拿货价 ≤ 目标价（或折扣 ≤ 目标折扣）时会自动创建待付款订单；下单成功后任务自动结束，货款仍需手动支付</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { taskEndpoint } from '@/utils/taskApi'
import type { TaskSummary } from '@core/contract'

definePageMeta({ title: '价格监控' })

const { tasks, isLoading, error, busyId, fetchTasks, remove, restart } =
  useTaskList(taskEndpoint('price'))

const { danger: confirmDelete } = useConfirmDialog()

const handleDelete = async (task: TaskSummary) => {
  const confirmed = await confirmDelete(
    `确定要删除「${task.target.name}」的价格监控任务吗？`
  )
  if (confirmed) await remove(task)
}

const handleRestart = async (task: TaskSummary) => {
  await restart(task)
}

onMounted(fetchTasks)
</script>
