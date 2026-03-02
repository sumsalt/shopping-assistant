<template>
  <div class="max-w-6xl mx-auto">
    <!-- 页面标题 -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-gray-900">Tab 监控任务</h1>
        <p class="mt-1 text-sm text-gray-500">管理 Tab 商品列表监控任务</p>
      </div>
      <div class="flex items-center gap-2 sm:gap-3">
        <UiButton
          variant="outline"
          size="sm"
          class="flex-1 sm:flex-none"
          :loading="isRefreshing"
          :disabled="isRefreshing"
          @click="handleRefresh"
        >
          <svg class="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </UiButton>
        <UiButton
          size="sm"
          class="flex-1 sm:flex-none"
          @click="showAddDialog = true"
        >
          <svg class="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新增监控
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
            <!-- 左侧：状态、Tab 名称和时间 -->
            <div class="flex flex-wrap items-center gap-3">
              <UiBadge :variant="getStatusColor(task.status) as 'default' | 'success' | 'warning' | 'danger' | 'info' | 'stock-available' | 'stock-unavailable'" size="md">
                {{ getStatusText(task.status) }}
              </UiBadge>
              <h3 class="text-lg font-semibold text-gray-900">{{ task.tabName }}</h3>
              <span class="text-sm text-gray-500">
                {{ formatTime(task.createdAt) }}
              </span>
              <span class="text-sm text-gray-400">·</span>
              <span class="text-sm text-gray-600 font-medium">
                Tab ID: {{ task.tabId }}
              </span>
            </div>

            <!-- 右侧：配置信息 -->
            <div class="flex flex-wrap items-center gap-4 text-sm">
              <div class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="text-gray-600">每 {{ task.interval }} 秒</span>
              </div>
              <div class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="text-gray-600">最多 {{ task.duration }} 秒</span>
              </div>
            </div>
          </div>

          <!-- 统计信息 -->
          <div class="flex flex-wrap items-center gap-4 mb-4 text-sm">
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
              <svg class="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span class="text-blue-700 font-medium">{{ task.checkCount }}</span>
              <span class="text-blue-600">次检测</span>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-lg border border-green-100">
              <svg class="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span class="text-green-700 font-medium">{{ task.detectedCount }}</span>
              <span class="text-green-600">次变化</span>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 rounded-lg border border-purple-100">
              <svg class="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span class="text-purple-700 font-medium">{{ task.currentTotal }}</span>
              <span class="text-purple-600">当前商品数</span>
            </div>
            <div v-if="task.lastDetectedAt" class="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 rounded-lg border border-orange-100">
              <svg class="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="text-orange-600">最后检测: {{ formatLastDetected(task.lastDetectedAt) }}</span>
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

          <!-- 检测历史（如果有变化记录） -->
          <div v-if="task.detectedCount > 0" class="mt-4">
            <div class="bg-green-50 rounded-lg p-3 border border-green-100">
              <p class="text-sm font-medium text-green-800 mb-2">
                ✓ 已检测到 {{ task.detectedCount }} 次商品列表变化
              </p>
              <p v-if="task.lastDetectedAt" class="text-xs text-green-700">
                最近一次变化: {{ formatLastDetected(task.lastDetectedAt) }}
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
        <h3 class="text-lg font-medium text-gray-900 mb-2">暂无 Tab 监控任务</h3>
        <p class="text-gray-500 mb-4">
          您还没有创建任何 Tab 监控任务
        </p>
        <UiButton @click="showAddDialog = true">
          新增监控
        </UiButton>
      </div>
    </div>

    <!-- 新增监控对话框 -->
    <UiDialog v-model:open="showAddDialog" title="新增 Tab 监控">
      <form @submit.prevent="handleAddTask">
        <div class="space-y-4">
          <!-- Tab 选择（快速选择） -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              快速选择
            </label>
            <div class="flex flex-wrap gap-2">
              <UiButton
                v-for="option in tabOptions"
                :key="option.id"
                type="button"
                variant="outline"
                size="sm"
                @click="handleSelectTab(option.id)"
              >
                {{ option.name }}
              </UiButton>
            </div>
          </div>

          <!-- Tab ID -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              Tab ID <span class="text-red-500">*</span>
            </label>
            <input
              v-model="formData.tabId"
              type="text"
              placeholder="请输入 Tab ID"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
          </div>

          <!-- Tab 名称 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              Tab 名称 <span class="text-red-500">*</span>
            </label>
            <input
              v-model="formData.tabName"
              type="text"
              placeholder="例如：羽绒服专区"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
          </div>

          <!-- 检测间隔 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              检测间隔（秒）
            </label>
            <input
              v-model.number="formData.interval"
              type="number"
              min="10"
              placeholder="默认 60 秒（1 分钟）"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
            <p class="mt-1 text-xs text-gray-500">建议设置为 60 秒以上，避免频繁请求</p>
          </div>

          <!-- 监控时长 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              监控时长（秒）
            </label>
            <input
              v-model.number="formData.duration"
              type="number"
              min="60"
              placeholder="默认 86400 秒（24 小时）"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
            <p class="mt-1 text-xs text-gray-500">设置为 0 表示无限监控</p>
          </div>

          <!-- 价格筛选 -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">
                最低价格
              </label>
              <input
                v-model.number="formData.minPrice"
                type="number"
                min="0"
                placeholder="0"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">
                最高价格
              </label>
              <input
                v-model.number="formData.maxPrice"
                type="number"
                min="0"
                placeholder="0（不限）"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        <!-- 对话框底部按钮 -->
        <div class="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
          <UiButton
            type="button"
            variant="outline"
            @click="showAddDialog = false"
          >
            取消
          </UiButton>
          <UiButton
            type="submit"
            :loading="isAdding"
            :disabled="isAdding"
          >
            创建监控
          </UiButton>
        </div>
      </form>
    </UiDialog>
  </div>
</template>

<script setup lang="ts">
// 页面元信息
definePageMeta({
  title: 'Tab 监控任务',
})

// 使用 Tab 监控任务管理 composable
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
  formatLastDetected,
} = useTabMonitorTasks()

// 使用 Tab 监控 composable
const { createTabMonitorTask, isLoading: isCreating } = useTabMonitor()

// 使用确认弹窗
const { danger: confirmDelete, warning: confirmRestart } = useConfirmDialog()

// 对话框显示状态
const showAddDialog = ref(false)

// Tab 选项
const tabOptions = [
  { id: '146453', name: '2000-1100-羽绒服' },
  { id: '133353', name: '2000-1100-外套' },
  { id: '78821', name: '3折-79元封顶' },
  { id: '78822', name: '3折-更多超值' },
  { id: '91342', name: '800-400-上装预告' },
]

// 表单数据
const formData = ref({
  tabId: '',
  tabName: '',
  interval: 60,
  duration: 86400,
  minPrice: 0,
  maxPrice: 0,
})

// 选择 Tab 时的处理
const handleSelectTab = (tabId: string) => {
  const selectedTab = tabOptions.find(t => t.id === tabId)
  if (selectedTab) {
    formData.value.tabId = selectedTab.id
    formData.value.tabName = selectedTab.name
  }
}

// 正在添加
const isAdding = computed(() => isCreating.value)

// 正在删除的任务 ID 集合
const deletingTaskIds = ref<Set<string>>(new Set())

// 正在重新发起的任务 ID 集合
const restartingTaskIds = ref<Set<string>>(new Set())

// 刷新处理
const isRefreshing = ref(false)
const handleRefresh = async () => {
  isRefreshing.value = true
  await fetchTasks()
  isRefreshing.value = false
}

// 判断任务是否正在删除
const isDeleting = (taskId: string): boolean => {
  return deletingTaskIds.value.has(taskId)
}

// 判断任务是否正在重新发起
const isRestarting = (taskId: string): boolean => {
  return restartingTaskIds.value.has(taskId)
}

// 添加任务
const handleAddTask = async () => {
  if (!formData.value.tabId.trim()) {
    return
  }

  const taskId = await createTabMonitorTask(formData.value)
  if (taskId) {
    showAddDialog.value = false
    // 重置表单
    formData.value = {
      tabId: '',
      tabName: '',
      interval: 60,
      duration: 86400,
      minPrice: 0,
      maxPrice: 0,
    }
    // 刷新任务列表
    await fetchTasks()
  }
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
