<template>
  <div class="max-w-6xl mx-auto">
    <!-- 页面标题 -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-gray-900">Tab 监控任务</h1>
        <p class="mt-1 text-sm text-gray-500">监控 Tab 商品列表，累计发现新商品后邮件提醒</p>
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
              <span
                class="text-xs px-2 py-0.5 rounded border"
                :class="task.mode === 'diff'
                  ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                  : 'bg-emerald-50 text-emerald-600 border-emerald-100'"
              >
                {{ task.mode === 'diff' ? '逐轮对比' : '累计新商品' }}
              </span>
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
              <div
                v-if="(task.pageCount ?? 1) > 1"
                class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100"
              >
                <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span class="text-gray-600">每轮 {{ task.pageCount }} 页</span>
              </div>
              <div
                v-if="task.activeWindow"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border"
                :class="isInActiveWindow(task)
                  ? 'bg-gray-50 border-gray-100'
                  : 'bg-amber-50 border-amber-100'"
              >
                <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span :class="isInActiveWindow(task) ? 'text-gray-600' : 'text-amber-700 font-medium'">
                  时段 {{ task.activeWindow.start }}–{{ task.activeWindow.end }}{{ isInActiveWindow(task) ? '' : '（休眠中）' }}
                </span>
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
              <span class="text-green-600">次提醒</span>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 rounded-lg border border-purple-100">
              <svg class="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span class="text-purple-700 font-medium">{{ task.currentTotal }}</span>
              <span class="text-purple-600">当前商品数</span>
            </div>
            <div
              v-if="task.mode !== 'diff'"
              class="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 rounded-lg border border-teal-100"
            >
              <svg class="w-4 h-4 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span class="text-teal-700 font-medium">{{ task.seenCount ?? 0 }}</span>
              <span class="text-teal-600">已记录商品</span>
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
                ✓ 已推送 {{ task.detectedCount }} 次新商品提醒
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
    <UiDialog v-model:open="showAddDialog" title="新增 Tab 监控" size="lg">
      <form id="tabMonitorForm" @submit.prevent="handleAddTask">
        <div class="space-y-5">
          <!-- Tab 选择（快速选择） -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              快速选择
            </label>
            <div class="relative">
              <select
                v-model="selectedTabOption"
                @change="handleSelectTabFromDropdown"
                class="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white appearance-none"
              >
                <option value="">-- 请选择 --</option>
                <option
                  v-for="option in tabOptions"
                  :key="option.id"
                  :value="option.id"
                >
                  {{ option.name }} (ID: {{ option.id }})
                </option>
              </select>
              <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <!-- Tab ID 和 Tab 名称 -->
          <div class="grid grid-cols-2 gap-4">
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
          </div>

          <!-- 检测间隔、监控时长和抓取页数 -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <p class="mt-1 text-xs text-gray-500">建议 60 秒以上，避免频繁请求</p>
            </div>
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
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">
                抓取页数
              </label>
              <input
                v-model.number="formData.pageCount"
                type="number"
                min="1"
                max="20"
                placeholder="默认 1 页"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
              <p class="mt-1 text-xs text-gray-500">每页 20 条，最多 20 页；多一页多一次请求</p>
            </div>
          </div>

          <!-- 监控模式 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">监控模式</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                class="flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="formData.mode === 'accumulate'
                  ? 'border-blue-500 bg-blue-50/60'
                  : 'border-gray-200 hover:border-gray-300'"
              >
                <input
                  v-model="formData.mode"
                  type="radio"
                  value="accumulate"
                  class="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span>
                  <span class="block text-sm font-medium text-gray-900">累计新商品</span>
                  <span class="block mt-1 text-xs text-gray-500 leading-relaxed">
                    记住任务内出现过的所有商品，累计够数量才提醒一次；反复上下架不重复提醒。
                  </span>
                </span>
              </label>

              <label
                class="flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="formData.mode === 'diff'
                  ? 'border-blue-500 bg-blue-50/60'
                  : 'border-gray-200 hover:border-gray-300'"
              >
                <input
                  v-model="formData.mode"
                  type="radio"
                  value="diff"
                  class="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span>
                  <span class="block text-sm font-medium text-gray-900">逐轮对比</span>
                  <span class="block mt-1 text-xs text-gray-500 leading-relaxed">
                    每轮和上一轮对比，新增 + 下架达到数量就提醒，邮件里同时列出新增和下架商品。
                  </span>
                </span>
              </label>
            </div>
          </div>

          <!-- 触发阈值 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              {{ formData.mode === 'accumulate' ? '累计新增多少件商品后提醒' : '每轮变化多少件商品后提醒' }}
            </label>
            <input
              v-model.number="formData.minChangeCount"
              type="number"
              min="1"
              placeholder="默认 10"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
            <p class="mt-1 text-xs text-gray-500">
              <template v-if="formData.mode === 'accumulate'">
                任务内按商品去重累计，凑够这个数量才发一次邮件；同一商品反复上下架只记一次。
              </template>
              <template v-else>
                每轮与上一轮对比，新增和下架商品合计达到这个数量就发一次邮件；反复上下架会反复提醒。
              </template>
            </p>
          </div>

          <!-- 高级选项（默认收起，避免表单过长） -->
          <details class="border border-gray-200 rounded-lg">
            <summary class="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none">
              <span class="text-sm font-medium text-gray-700">高级选项</span>
              <span class="text-xs text-gray-400">生效时段 · 排序方式</span>
            </summary>

            <div class="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100">
              <!-- 生效时段（可选） -->
              <div class="pt-3">
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    v-model="formData.useActiveWindow"
                    type="checkbox"
                    class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span class="text-sm font-medium text-gray-700">只在指定时段运行（可选）</span>
                </label>
                <div v-if="formData.useActiveWindow" class="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1.5">每天开始时间</label>
                    <input
                      v-model="formData.windowStart"
                      type="time"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1.5">每天结束时间</label>
                    <input
                      v-model="formData.windowEnd"
                      type="time"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <p v-if="formData.useActiveWindow" class="mt-2 text-xs text-gray-500">
                  时段外任务休眠、不发请求，也不消耗监控时长；结束时间早于开始时间表示跨天（如 22:00–02:00）。
                  进入时段时会重新建立基线，休眠期间的商品变化不会补推。
                </p>
              </div>

              <!-- 排序方式 -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">
                  价格排序方式
                </label>
                <div class="relative">
                  <select
                    v-model.number="formData.sort"
                    class="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white appearance-none"
                  >
                    <option :value="1">默认排序</option>
                    <option :value="3">从高到低</option>
                    <option :value="4">从低到高</option>
                  </select>
                  <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <p class="mt-1 text-xs text-gray-500">只影响抓取到的商品顺序，不改变监控范围</p>
              </div>
            </div>
          </details>
        </div>
      </form>

      <!-- 底部按钮固定，不随表单滚动 -->
      <template #footer>
        <div class="flex items-center justify-end gap-3">
          <UiButton
            type="button"
            variant="outline"
            @click="showAddDialog = false"
          >
            取消
          </UiButton>
          <UiButton
            type="submit"
            form="tabMonitorForm"
            :loading="isAdding"
            :disabled="isAdding"
          >
            创建监控
          </UiButton>
        </div>
      </template>
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
  { id: '33713', name: '3折-19元封顶' },
  { id: '78820', name: '3折-39元封顶' },
  { id: '78821', name: '3折-79元封顶' },
  { id: '78822', name: '3折-更多超值' },
  { id: '33478', name: '5折-19元封顶' },
  { id: '78823', name: '5折-39元封顶' },
  { id: '78824', name: '5折-79元封顶' },
  { id: '78825', name: '5折-更多超值' },
  { id: '91342', name: '800-400-上装预告' },
]

// 下拉选择的值
const selectedTabOption = ref('')

// 表单数据
const formData = ref({
  tabId: '',
  tabName: '',
  interval: 60,
  duration: 86400,
  pageCount: 1,
  sort: 1,
  mode: 'accumulate' as 'accumulate' | 'diff',
  minChangeCount: 10,
  useActiveWindow: false,
  windowStart: '09:00',
  windowEnd: '23:00',
})

// 默认表单值（重置用）
const defaultFormData = () => ({
  tabId: '',
  tabName: '',
  interval: 60,
  duration: 86400,
  pageCount: 1,
  sort: 1,
  mode: 'accumulate' as 'accumulate' | 'diff',
  minChangeCount: 10,
  useActiveWindow: false,
  windowStart: '09:00',
  windowEnd: '23:00',
})

// 选择 Tab 时的处理
const handleSelectTab = (tabId: string) => {
  const selectedTab = tabOptions.find(t => t.id === tabId)
  if (selectedTab) {
    formData.value.tabId = selectedTab.id
    formData.value.tabName = selectedTab.name
  }
}

// 下拉选择处理
const handleSelectTabFromDropdown = () => {
  if (selectedTabOption.value) {
    handleSelectTab(selectedTabOption.value)
  }
}

// 当前是否在该任务的生效时段内（仅用于展示「休眠中」）
const isInActiveWindow = (task: { activeWindow?: { start: string; end: string } }): boolean => {
  const window = task.activeWindow
  if (!window) {
    return true
  }

  const toMinutes = (value: string) => {
    const [hour, minute] = value.split(':').map(Number)
    return hour * 60 + minute
  }

  const start = toMinutes(window.start)
  const end = toMinutes(window.end)
  if (start === end) {
    return true
  }

  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()

  return start < end ? current >= start && current < end : current >= start || current < end
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

  const { useActiveWindow, windowStart, windowEnd, ...rest } = formData.value
  const taskId = await createTabMonitorTask({
    ...rest,
    ...(useActiveWindow ? { activeWindow: { start: windowStart, end: windowEnd } } : {}),
  })
  if (taskId) {
    showAddDialog.value = false
    // 重置表单
    formData.value = defaultFormData()
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
