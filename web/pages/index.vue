<template>
  <div class="max-w-4xl mx-auto">
    <!-- 配置缺失提醒 -->
    <div
      v-if="!isConfigured"
      class="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg"
    >
      <div class="flex items-start">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div class="ml-3 flex-1">
          <h3 class="text-sm font-medium text-yellow-800">配置未完成</h3>
          <p class="mt-1 text-sm text-yellow-700">
            请先完成平台认证信息配置，才能使用库存查询功能
          </p>
          <div class="mt-3">
            <NuxtLink
              to="/settings"
              class="inline-flex items-center px-3 py-1.5 border border-yellow-300 text-sm font-medium rounded-md text-yellow-700 bg-yellow-100 hover:bg-yellow-200 transition-colors"
            >
              立即配置
              <svg class="ml-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <!-- 欢迎区域 -->
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
        <svg class="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </div>
      <h1 class="text-3xl font-bold text-gray-900 mb-2">库存监控助手</h1>
      <p class="text-gray-500 max-w-md mx-auto">
        实时监控商品库存状态，快速查询商品 SKU 信息，再也不错过心仪商品的补货时机
      </p>
    </div>

    <!-- 快捷入口 -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      <!-- 库存查询 -->
      <NuxtLink
        to="/stock/check"
        class="block p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all group"
      >
        <div class="flex items-center mb-4">
          <div class="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
            <svg class="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-1">库存查询</h3>
        <p class="text-sm text-gray-500">输入商品 ID 或货号，快速查询库存状态</p>
      </NuxtLink>

      <!-- 收藏夹监控 -->
      <NuxtLink
        to="/collection"
        class="block p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md hover:border-green-300 transition-all group"
      >
        <div class="flex items-center mb-4">
          <div class="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
            <svg class="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-1">收藏夹监控</h3>
        <p class="text-sm text-gray-500">一键监控收藏夹中所有商品的库存状态</p>
      </NuxtLink>

      <!-- 系统配置 -->
      <NuxtLink
        to="/settings"
        class="block p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md hover:border-purple-300 transition-all group"
      >
        <div class="flex items-center mb-4">
          <div class="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
            <svg class="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-1">系统配置</h3>
        <p class="text-sm text-gray-500">配置平台认证信息，管理账户设置</p>
      </NuxtLink>
    </div>

    <!-- 使用说明 -->
    <UiCard title="使用说明">
      <div class="space-y-4">
        <div class="flex items-start">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
            1
          </div>
          <div class="ml-4">
            <h4 class="text-sm font-medium text-gray-900">配置认证信息</h4>
            <p class="text-sm text-gray-500 mt-1">
              首先进入"系统配置"页面，填写平台认证信息（uid、token、openid 等）。这些信息可以通过抓包工具从一手 App 获取。
            </p>
          </div>
        </div>

        <div class="flex items-start">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
            2
          </div>
          <div class="ml-4">
            <h4 class="text-sm font-medium text-gray-900">查询单品库存</h4>
            <p class="text-sm text-gray-500 mt-1">
              在"库存查询"页面输入商品 ID 或货号，即可查看商品的库存状态。点击商品卡片可查看详细的 SKU 库存信息。
            </p>
          </div>
        </div>

        <div class="flex items-start">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
            3
          </div>
          <div class="ml-4">
            <h4 class="text-sm font-medium text-gray-900">监控收藏夹</h4>
            <p class="text-sm text-gray-500 mt-1">
              在"收藏夹监控"页面可以一键查看所有收藏商品的库存状态，有货商品会优先展示，方便及时下单。
            </p>
          </div>
        </div>
      </div>
    </UiCard>

    <!-- 功能特点 -->
    <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="flex items-center p-4 bg-gray-50 rounded-lg">
        <svg class="w-8 h-8 text-green-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <div>
          <h4 class="text-sm font-medium text-gray-900">实时查询</h4>
          <p class="text-xs text-gray-500">直接调用平台接口，获取最新库存数据</p>
        </div>
      </div>

      <div class="flex items-center p-4 bg-gray-50 rounded-lg">
        <svg class="w-8 h-8 text-blue-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <div>
          <h4 class="text-sm font-medium text-gray-900">数据安全</h4>
          <p class="text-xs text-gray-500">配置信息仅存储在本地浏览器中</p>
        </div>
      </div>

      <div class="flex items-center p-4 bg-gray-50 rounded-lg">
        <svg class="w-8 h-8 text-purple-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        <div>
          <h4 class="text-sm font-medium text-gray-900">响应式设计</h4>
          <p class="text-xs text-gray-500">支持手机、平板、电脑多端访问</p>
        </div>
      </div>

      <div class="flex items-center p-4 bg-gray-50 rounded-lg">
        <svg class="w-8 h-8 text-orange-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
        <div>
          <h4 class="text-sm font-medium text-gray-900">美观界面</h4>
          <p class="text-xs text-gray-500">采用现代化 UI 设计，操作简洁直观</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 页面元信息
definePageMeta({
  title: '首页',
})

// 使用配置 store
const configStore = useConfigStore()

// 配置状态
const isConfigured = computed(() => configStore.isConfigured)
</script>
