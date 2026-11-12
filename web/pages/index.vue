<template>
  <div class="max-w-4xl mx-auto">
    <!-- 配置缺失提醒：等配置拉回来再判断，否则首屏会先闪一下 -->
    <div
      v-if="showAccountWarning"
      class="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg"
    >
      <div class="flex items-start">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div class="ml-3 flex-1">
          <h3 class="text-sm font-medium text-yellow-800">未选择当前账号</h3>
          <p class="mt-1 text-sm text-yellow-700">
            库存查询与 Tab 监控可匿名使用；价格监控、SKU 详情、收藏夹、订单、自动下单需要选择带登录态的账号
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
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
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

      <!-- 收藏夹 -->
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
        <h3 class="text-lg font-semibold text-gray-900 mb-1">收藏夹</h3>
        <p class="text-sm text-gray-500">查看收藏商品库存，进详情页创建监控</p>
      </NuxtLink>

      <!-- 订单 -->
      <NuxtLink
        to="/orders"
        class="block p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md hover:border-sky-300 transition-all group"
      >
        <div class="flex items-center mb-4">
          <div class="w-12 h-12 rounded-lg bg-sky-100 flex items-center justify-center group-hover:bg-sky-200 transition-colors">
            <svg class="w-6 h-6 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-1">订单</h3>
        <p class="text-sm text-gray-500">查看当前账号的订单记录，也可从账号管理查看指定账号</p>
      </NuxtLink>

      <!-- 凑单计算器 -->
      <NuxtLink
        to="/calculator"
        class="block p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md hover:border-orange-300 transition-all group"
      >
        <div class="flex items-center mb-4">
          <div class="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
            <svg class="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-1">凑单计算器</h3>
        <p class="text-sm text-gray-500">计算最优凑单方案，快速满足满减条件</p>
      </NuxtLink>

      <!-- 监控任务 -->
      <NuxtLink
        to="/monitor"
        class="block p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md hover:border-indigo-300 transition-all group"
      >
        <div class="flex items-center mb-4">
          <div class="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
            <svg class="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-1">监控任务</h3>
        <p class="text-sm text-gray-500">管理到货监控任务，设置通知提醒</p>
      </NuxtLink>

      <!-- Tab 监控 -->
      <NuxtLink
        to="/tab-monitor"
        class="block p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md hover:border-teal-300 transition-all group"
      >
        <div class="flex items-center mb-4">
          <div class="w-12 h-12 rounded-lg bg-teal-100 flex items-center justify-center group-hover:bg-teal-200 transition-colors">
            <svg class="w-6 h-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-1">Tab 监控</h3>
        <p class="text-sm text-gray-500">监控 Tab 商品列表变化</p>
      </NuxtLink>

      <!-- 价格监控 -->
      <NuxtLink
        to="/price-monitor"
        class="block p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md hover:border-emerald-300 transition-all group"
      >
        <div class="flex items-center mb-4">
          <div class="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
            <svg class="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-1">价格监控</h3>
        <p class="text-sm text-gray-500">监控商品拿货价变化，降价涨价邮件提醒</p>
      </NuxtLink>

      <!-- 店铺评分 -->
      <NuxtLink
        to="/shops"
        class="block p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md hover:border-rose-300 transition-all group"
      >
        <div class="flex items-center mb-4">
          <div class="w-12 h-12 rounded-lg bg-rose-100 flex items-center justify-center group-hover:bg-rose-200 transition-colors">
            <svg class="w-6 h-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.077 10.1c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-1">店铺评分</h3>
        <p class="text-sm text-gray-500">记录店铺星级与备注，挑店前先看历史评价</p>
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
            <h4 class="text-sm font-medium text-gray-900">保存账号并选择当前账号</h4>
            <p class="text-sm text-gray-500 mt-1">
              先到「账号管理」新增账号，粘贴一次抓包请求即可自动识别公共参数，再到「系统配置」把它设为当前使用账号。支持小程序与 App 两种抓包内容。
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
            <h4 class="text-sm font-medium text-gray-900">查看收藏夹</h4>
            <p class="text-sm text-gray-500 mt-1">
              在「收藏夹」页面可以查看所有收藏商品的库存状态，点击商品进入详情页创建到货或价格监控。
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
//
// 当前账号是服务端状态，启动后才拉回来。未初始化时 activeAccount 必为空，
// 直接据此判断会先渲染「未选择当前账号」，等数据到达再消失——也就是刷新时那一下闪烁。
// 所以初始化完成前不给结论。
const showAccountWarning = computed(
  () => configStore.isInitialized && !configStore.isConfigured
)
</script>
