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
        class="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <!-- 任务头部 -->
            <div class="flex items-center gap-3 mb-3">
              <UiBadge :variant="getStatusColor(task.status) as any" size="sm">
                {{ getStatusText(task.status) }}
              </UiBadge>
              <span class="text-sm text-gray-500">
                {{ formatTime(task.createdAt) }}
              </span>
              <span class="text-sm text-gray-400">·</span>
              <span class="text-sm text-gray-500">
                监控 {{ task.taskCount }} 个商品
              </span>
            </div>

            <!-- 商品列表 -->
            <div class="mb-3">
              <p v-for="(product, index) in task.products.slice(0, 3)" :key="index" class="text-sm text-gray-600 mb-1">
                <span class="font-medium">商品ID:</span> {{ product.productId }}
                <span class="mx-2">→</span>
                <span class="font-medium">接收邮箱:</span> {{ product.recipient }}
              </p>
              <p v-if="task.products.length > 3" class="text-sm text-gray-400">
                还有 {{ task.products.length - 3 }} 个商品...
              </p>
            </div>

            <!-- 任务配置 -->
            <div class="flex items-center gap-4 text-sm text-gray-500">
              <span>
                <svg class="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                每 {{ task.interval }} 秒检查
              </span>
              <span>
                <svg class="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                最多运行 {{ task.duration }} 秒
              </span>
            </div>

            <!-- 监控结果（如果有） -->
            <div v-if="task.results && task.results.length > 0" class="mt-4 pt-4 border-t border-gray-100">
              <p class="text-sm font-medium text-gray-700 mb-2">监控结果:</p>
              <div class="space-y-1">
                <p
                  v-for="(result, index) in task.results"
                  :key="index"
                  :class="[
                    'text-sm',
                    result.detected ? 'text-green-600' : 'text-gray-500'
                  ]"
                >
                  {{ result.productName }}:
                  {{ result.detected ? '✓ 已到货' : '✗ 未检测到' }}
                  <span v-if="result.emailSent" class="text-xs text-gray-400">(已发送邮件)</span>
                </p>
              </div>
            </div>
          </div>

          <!-- 删除按钮 -->
          <UiButton
            variant="ghost"
            size="sm"
            :loading="isDeleting(task.id)"
            :disabled="isDeleting(task.id)"
            class="text-red-600 hover:text-red-700 hover:bg-red-50"
            @click="handleDelete(task)"
          >
            <svg v-if="!isDeleting(task.id)" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除
          </UiButton>
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
  refresh,
  getStatusText,
  getStatusColor,
  formatTime,
} = useMonitorTasks()

// 正在删除的任务 ID 集合
const deletingTaskIds = ref<Set<string>>(new Set())

// 刷新处理
const handleRefresh = () => {
  refresh()
}

// 判断任务是否正在删除
const isDeleting = (taskId: string): boolean => {
  return deletingTaskIds.value.has(taskId)
}

// 删除任务
const handleDelete = async (task: { id: string }) => {
  if (!confirm('确定要删除此监控任务吗？')) {
    return
  }

  deletingTaskIds.value.add(task.id)

  try {
    await deleteTask(task.id)
  } finally {
    deletingTaskIds.value.delete(task.id)
  }
}

// 页面加载时自动获取数据
onMounted(() => {
  fetchTasks()
})
</script>
