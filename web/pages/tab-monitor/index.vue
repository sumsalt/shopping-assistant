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
                v-if="task.fullScanInterval"
                class="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 rounded-lg border border-teal-100"
              >
                <svg class="w-4 h-4 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span class="text-teal-700 font-medium">全量更新 每 {{ formatFullScanInterval(task.fullScanInterval) }}</span>
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
              <span class="text-purple-600">本轮抓取</span>
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
          <div class="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
            <UiButton
              v-if="task.mode !== 'diff' && (task.seenCount ?? 0) > 0"
              variant="outline"
              size="sm"
              class="w-full whitespace-nowrap sm:w-auto text-teal-600 border-teal-200 hover:bg-teal-50 hover:border-teal-300"
              @click="openSeenDialog(task)"
            >
              <svg class="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              累计商品 ({{ task.seenCount }})
            </UiButton>
            <UiButton
              variant="outline"
              size="sm"
              :loading="isRestarting(task.id)"
              :disabled="isRestarting(task.id)"
              class="flex-1 whitespace-nowrap sm:flex-none text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300"
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
              class="flex-1 whitespace-nowrap sm:flex-none text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
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

          <!-- 定时全量抓取（仅累计模式） -->
          <div v-if="formData.mode === 'accumulate'">
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              定时全量抓取
            </label>
            <div class="relative">
              <select
                v-model.number="formData.fullScanInterval"
                class="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white appearance-none"
              >
                <option :value="0">关闭（每轮只抓设定页数）</option>
                <option :value="1800">每 30 分钟</option>
                <option :value="3600">每 1 小时</option>
                <option :value="7200">每 2 小时</option>
                <option :value="21600">每 6 小时</option>
                <option :value="43200">每 12 小时</option>
                <option :value="86400">每 24 小时</option>
              </select>
              <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <p class="mt-1 text-xs text-gray-500">
              每隔该时间翻页抓取全部商品（最多 100 页），补齐常规只抓前几页时漏掉的新商品；间隔需小于监控时长，全量轮发现的新商品照常计入提醒。
            </p>
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

    <!-- 累计商品对话框 -->
    <UiDialog
      :open="seenDialogOpen"
      title="累计商品"
      size="lg"
      @update:open="seenDialogOpen = $event"
    >
      <div class="space-y-3">
        <div class="flex items-center justify-between text-sm text-gray-500">
          <span class="truncate">{{ seenTaskName }} · 按首次发现时间倒序</span>
          <span class="shrink-0 ml-3">共 {{ seenTotal }} 个</span>
        </div>

        <div v-if="seenLoading" class="py-12 text-center text-sm text-gray-500">
          加载中...
        </div>
        <div v-else-if="seenItems.length === 0" class="py-12 text-center text-sm text-gray-500">
          暂无记录，任务发现新商品后会出现在这里
        </div>
        <div
          v-else
          ref="seenListRef"
          class="max-h-[65vh] overflow-y-auto"
          @scroll.passive="handleSeenScroll"
        >
          <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            <div
              v-for="item in seenItems"
              :key="item.productId"
              class="overflow-hidden rounded-xl bg-gray-50 ring-1 ring-gray-100"
            >
              <a
                :href="seenDetailPath(item) || undefined"
                class="relative block aspect-[3/4] bg-gray-100"
                :class="seenDetailPath(item) ? 'cursor-pointer' : 'cursor-default'"
                :title="formatSeenTitle(item)"
                @click="handleSeenClick($event, item)"
              >
                <img
                  v-if="item.productImage"
                  :src="item.productImage"
                  :alt="item.productName"
                  class="h-full w-full object-cover"
                  loading="lazy"
                />
                <span
                  v-else
                  class="flex h-full items-center justify-center text-xs text-gray-400"
                >
                  无图
                </span>
                <span
                  class="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white"
                >
                  ¥{{ formatSeenPrice(item.price) }}
                </span>
                <span
                  class="absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white"
                  :title="`首次发现 ${formatSeenTime(item.firstSeenAt)}`"
                >
                  {{ formatSeenClock(item.firstSeenAt) }}
                </span>
              </a>

              <div class="px-2 py-1.5">
                <p
                  class="truncate text-xs font-medium text-gray-800"
                  :title="formatSeenTitle(item)"
                >
                  {{ formatSeenName(item) }}
                </p>
                <div class="mt-0.5 flex items-center justify-between gap-1">
                  <span
                    class="min-w-0 flex-1 truncate text-[11px] text-gray-500"
                    :title="formatSeenShopFull(item)"
                  >
                    {{ formatSeenShop(item) }}
                  </span>
                  <button
                    v-if="item.supplyId"
                    type="button"
                    class="shrink-0 rounded px-1 py-0.5 text-[11px] text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                    :disabled="blacklistingSupplyId === item.supplyId"
                    @click="blacklistSeenItem(item)"
                  >
                    {{ blacklistingSupplyId === item.supplyId ? '加入中' : '拉黑' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="seenLoadingMore" class="py-3 text-center text-xs text-gray-400">
            加载更多...
          </div>
          <div
            v-else-if="!seenHasMore && seenItems.length > 0"
            class="py-3 text-center text-xs text-gray-400"
          >
            已经到底了
          </div>
        </div>
      </div>
    </UiDialog>
  </div>
</template>

<script setup lang="ts">
import type { TabSeenProductItem } from '@/composables/useTabMonitorTasks'

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
  fetchSeenProducts,
  refresh,
  getStatusText,
  getStatusColor,
  formatTime,
  formatLastDetected,
} = useTabMonitorTasks()

// 累计商品弹窗
const seenDialogOpen = ref(false)
const seenTaskId = ref('')
const seenTaskName = ref('')
const seenItems = ref<TabSeenProductItem[]>([])
const seenTotal = ref(0)
const seenHasMore = ref(false)
const seenLoading = ref(false)
const seenLoadingMore = ref(false)
/** 列表滚动容器（滚动到底自动加载下一页） */
const seenListRef = ref<HTMLElement | null>(null)
/** 正在拉黑的供应商标识，避免重复点击 */
const blacklistingSupplyId = ref('')

const toast = useToast()

const SEEN_PAGE_SIZE = 50

// 打开累计商品：每次都从第一页重新拉，避免看到过期数据
const openSeenDialog = async (task: { id: string; tabName: string }) => {
  seenDialogOpen.value = true
  seenTaskId.value = task.id
  seenTaskName.value = task.tabName
  seenItems.value = []
  seenTotal.value = 0
  seenHasMore.value = false
  seenLoading.value = true

  const data = await fetchSeenProducts(task.id, 0, SEEN_PAGE_SIZE)
  if (data) {
    seenItems.value = data.items
    seenTotal.value = data.total
    seenHasMore.value = data.hasMore
  }
  seenLoading.value = false

  // 一页没填满容器时用户看不到滚动条，也就触发不了加载，主动补几页
  await fillSeenList()
}

// 加载更多
const loadMoreSeen = async () => {
  if (seenLoadingMore.value || !seenHasMore.value) {
    return
  }

  seenLoadingMore.value = true
  try {
    const data = await fetchSeenProducts(seenTaskId.value, seenItems.value.length, SEEN_PAGE_SIZE)
    if (data) {
      // 空页说明数据已经到底，避免滚动反复请求同一页
      if (data.items.length === 0) {
        seenHasMore.value = false
        return
      }

      seenItems.value = [...seenItems.value, ...data.items]
      seenTotal.value = data.total
      seenHasMore.value = data.hasMore
    }
  } finally {
    seenLoadingMore.value = false
  }
}

// 滚动到底部自动加载下一页
const handleSeenScroll = (event: Event) => {
  const el = event.target as HTMLElement | null
  if (!el || seenLoadingMore.value || !seenHasMore.value) {
    return
  }

  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
    void loadMoreSeen()
  }
}

// 内容不足一屏时补页（最多补 3 次，避免接口异常时死循环）
const fillSeenList = async (depth = 0): Promise<void> => {
  if (depth >= 3) {
    return
  }

  await nextTick()
  const el = seenListRef.value
  if (!el || !seenHasMore.value) {
    return
  }

  if (el.scrollHeight <= el.clientHeight + 24) {
    await loadMoreSeen()
    await fillSeenList(depth + 1)
  }
}

// 店铺展示文案：优先用接口返回的店铺名，老记录没有则退回供应商标识
const formatSeenShop = (item: TabSeenProductItem): string => {
  if (item.shopName) {
    return item.shopName
  }
  return item.supplyId ? `供应商 ${item.supplyId}` : '店铺未知'
}

// 完整文案（带市场名）：拉黑确认时用，便于确认是哪家
const formatSeenShopFull = (item: TabSeenProductItem): string => {
  const name = formatSeenShop(item)
  return item.marketName ? `${name} · ${item.marketName}` : name
}

// 图片悬浮提示：完整商品名 + 首次发现时间
const formatSeenTitle = (item: TabSeenProductItem): string => {
  const base = `${item.productName || formatSeenName(item)} · 首次发现 ${formatSeenTime(item.firstSeenAt)}`
  return seenDetailPath(item) ? `${base}（点击查看库存详情）` : base
}

// 系统内 SKU 详情页地址：一手外链已不可用，统一跳到本站详情页
// 老记录没有货号（productNo）时无法查询 SKU，不做跳转
const seenDetailPath = (item: TabSeenProductItem): string =>
  item.productNo ? `/stock/${encodeURIComponent(item.productNo)}` : ''

const handleSeenClick = (event: MouseEvent, item: TabSeenProductItem) => {
  const path = seenDetailPath(item)
  if (!path) {
    return
  }

  // 支持 Ctrl/⌘/中键新窗口打开；普通点击走站内路由，避免整页刷新
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
    return
  }

  event.preventDefault()
  void navigateTo(path)
}

// 卡片名称：优先用接口算好的「不带店铺名」短名，老数据兜底去掉【店铺名】前缀
const formatSeenName = (item: TabSeenProductItem): string =>
  item.displayName ||
  item.shortName ||
  item.productName?.replace(/^\s*【[^】]*】\s*/, '').trim() ||
  `商品 ${item.productId}`

// 把商品所属店铺加入黑名单：加入后该店铺商品不再被抓取，也不再出现在累计记录里
const blacklistSeenItem = async (item: TabSeenProductItem) => {
  const supplyId = item.supplyId
  if (!supplyId || blacklistingSupplyId.value) {
    return
  }

  const confirmed = await confirmSeenBlacklist({
    title: '加入店铺黑名单',
    message: `确定拉黑「${formatSeenShopFull(item)}」吗？之后该店铺的商品不再被抓取，也不会写进提醒邮件。`,
    confirmText: '拉黑',
    type: 'danger',
  })
  if (!confirmed) {
    return
  }

  blacklistingSupplyId.value = supplyId
  try {
    const response = await $fetch<{
      success: boolean
      error?: { message?: string }
    }>('/api/shops/blacklist/create', {
      method: 'POST',
      body: {
        supplyId,
        ...(item.shopName ? { name: item.shopName } : {}),
        ...(item.marketName ? { marketName: item.marketName } : {}),
      },
    })

    if (!response.success) {
      toast.error(response.error?.message || '加入黑名单失败')
      return
    }

    // 同一店铺在本地列表里的其他商品也一并移除
    const removed = seenItems.value.filter(seen => seen.supplyId === supplyId).length
    seenItems.value = seenItems.value.filter(seen => seen.supplyId !== supplyId)
    seenTotal.value = Math.max(0, seenTotal.value - removed)
    toast.success('已加入店铺黑名单，之后不再抓取该店铺商品')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '网络请求失败')
  } finally {
    blacklistingSupplyId.value = ''
  }
}

const formatSeenPrice = (price: number): string => (price > 0 ? price.toFixed(2) : '-')

const formatSeenTime = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

const formatSeenClock = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 使用 Tab 监控 composable
const { createTabMonitorTask, isLoading: isCreating } = useTabMonitor()

// 使用确认弹窗
const { danger: confirmDelete, warning: confirmRestart, confirm: confirmSeenBlacklist } =
  useConfirmDialog()

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
  fullScanInterval: 0,
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
  fullScanInterval: 0,
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

// 全量抓取间隔展示
const formatFullScanInterval = (seconds?: number): string => {
  if (!seconds) return ''
  return seconds < 3600
    ? `${Math.round(seconds / 60)} 分钟`
    : `${Number((seconds / 3600).toFixed(1))} 小时`
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
    fullScanInterval: rest.mode === 'accumulate' ? rest.fullScanInterval : 0,
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
