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
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <!-- 任务头部 -->
              <div class="flex flex-wrap items-center gap-2 mb-3">
                <UiBadge :variant="getStatusColor(task.status) as any" size="sm">
                  {{ getStatusText(task.status) }}
                </UiBadge>
                <span class="text-sm text-gray-500 shrink-0">
                  {{ formatTime(task.createdAt) }} · 监控 {{ task.taskCount }} 个商品
                </span>
              </div>

              <!-- 任务配置 -->
              <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500 mb-4">
                <span class="inline-flex items-center">
                  <svg class="w-4 h-4 mr-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>每 {{ task.interval }} 秒</span>
                </span>
                <span class="inline-flex items-center">
                  <svg class="w-4 h-4 mr-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>最多 {{ task.duration }} 秒</span>
                </span>
              </div>

              <!-- 监控结果（如果有） -->
              <div v-if="task.results && task.results.length > 0" class="mb-4">
                <div class="bg-green-50 rounded-lg p-3 border border-green-100">
                  <p class="text-sm font-medium text-green-800 mb-2">✓ 已检测到 {{ task.results.filter(r => r.detected).length }} 个商品到货</p>
                  <div class="space-y-1">
                    <p
                      v-for="(result, index) in task.results"
                      :key="index"
                      class="text-sm text-green-700"
                    >
                      {{ result.productName }}
                      <span v-if="result.emailSent" class="text-xs text-green-600">(已发送邮件)</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 操作按钮组 -->
            <div class="flex items-center gap-2 ml-4">
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

        <!-- 展开/收起按钮 -->
        <button
          v-if="task.products.length > 3"
          type="button"
          class="w-full px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1 border-t border-gray-100"
          @click="toggleExpand(task.id)"
        >
          <span>{{ isExpanded(task.id) ? '收起商品列表' : `展开全部 ${task.products.length} 个商品` }}</span>
          <svg
            :class="['w-4 h-4 transition-transform', isExpanded(task.id) ? 'rotate-180' : '']"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <!-- 商品列表 -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="max-h-0 opacity-0"
          enter-to-class="max-h-screen opacity-100"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="max-h-screen opacity-100"
          leave-to-class="max-h-0 opacity-0"
        >
          <div v-show="task.products.length <= 3 || isExpanded(task.id)" class="border-t border-gray-100 p-4">
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              <div
                v-for="(product, index) in task.products"
                :key="index"
                class="bg-gray-50 rounded-lg p-3"
              >
                <!-- 商品图片 -->
                <div class="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-3">
                  <img
                    v-if="product.productImage"
                    :src="product.productImage"
                    :alt="product.productName"
                    class="w-full h-full object-cover"
                    loading="lazy"
                    @error="handleImageError"
                  />
                  <div
                    v-else
                    class="w-full h-full flex items-center justify-center text-gray-400"
                  >
                    <svg class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>

                <!-- 商品名称 -->
                <h3 class="text-sm font-medium text-gray-900 line-clamp-2" :title="product.productName">
                  {{ product.productName }}
                </h3>

                <!-- 商品 ID -->
                <p class="text-xs text-gray-500 mt-1">
                  ID: {{ product.productId }}
                </p>
              </div>
            </div>
          </div>
        </Transition>
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
  toggleExpand,
  isExpanded,
  getStatusText,
  getStatusColor,
  formatTime,
} = useMonitorTasks()

// 正在删除的任务 ID 集合
const deletingTaskIds = ref<Set<string>>(new Set())

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
