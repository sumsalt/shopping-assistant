<template>
  <div class="max-w-6xl mx-auto">
    <!-- 页面标题 -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">收藏夹监控</h1>
        <p class="mt-1 text-sm text-gray-500">监控收藏夹中商品的库存状态</p>
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
    <div v-if="isLoading && !collectionResult" class="space-y-4">
      <!-- 统计骨架屏 -->
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <div class="flex items-center justify-between">
          <UiSkeleton variant="text" width="200" height="24" />
          <UiSkeleton variant="text" width="150" height="20" />
        </div>
      </div>
      <!-- 商品列表骨架屏 -->
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div v-for="i in 10" :key="i" class="bg-white rounded-lg border border-gray-200 p-3">
          <UiSkeleton variant="rounded" width="100%" :height="150" class="mb-3" />
          <UiSkeleton variant="text" width="80%" height="16" class="mb-2" />
          <UiSkeleton variant="text" width="50%" height="20" />
        </div>
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
        <p class="text-gray-500 mb-4 break-all">{{ error }}</p>
        <UiButton variant="outline" @click="handleRefresh">
          重新加载
        </UiButton>
      </div>
    </div>

    <!-- 收藏夹内容 -->
    <div v-else-if="collectionResult" class="space-y-6">
      <!-- 统计信息 -->
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-6">
            <div class="text-center">
              <div class="text-2xl font-bold text-gray-900">{{ collectionResult.total }}</div>
              <div class="text-sm text-gray-500">总收藏</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-green-600">{{ collectionResult.inStockCount }}</div>
              <div class="text-sm text-gray-500">有货</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-red-600">{{ collectionResult.outOfStockCount }}</div>
              <div class="text-sm text-gray-500">无货</div>
            </div>
          </div>
          <div class="text-sm text-gray-500">
            当前第 {{ currentPage }} 页
          </div>
        </div>
      </div>

      <!-- 无货商品列表 -->
      <div v-if="allOutOfStockItems.length > 0">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold text-gray-900 flex items-center">
            <span class="w-2 h-2 rounded-full bg-red-500 mr-2" />
            无货商品
            <UiBadge variant="danger" size="sm" class="ml-2">{{ allOutOfStockItems.length }}</UiBadge>
          </h2>
          <UiButton
            variant="outline"
            size="sm"
            :loading="isMonitoring"
            :disabled="isMonitoring"
            @click="handleMonitorAll"
          >
            <svg v-if="!isMonitoring" class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {{ isMonitoring ? '创建中...' : '监控到货提醒' }}
          </UiButton>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <StockProductCard
            v-for="item in allOutOfStockItems"
            :key="item.collectId"
            :product-id="item.productId"
            :product-no="item.productNo"
            :name="item.productName"
            :image-url="item.productImage"
            :price="item.price"
            :in-stock="item.inStock"
            :message="item.message"
            :sales="item.salesOf7"
            :show-monitor-button="true"
            :is-monitoring="monitoringItems.has(item.collectId)"
            @click="handleProductClick(item.productNo)"
            @monitor="handleMonitorSingle(item)"
          />
        </div>
      </div>

      <!-- 有货商品列表 -->
      <div v-if="allInStockItems.length > 0">
        <h2 class="text-lg font-semibold text-gray-900 mb-3 flex items-center">
          <span class="w-2 h-2 rounded-full bg-green-500 mr-2" />
          有货商品
          <UiBadge variant="success" size="sm" class="ml-2">{{ allInStockItems.length }}</UiBadge>
        </h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <StockProductCard
            v-for="item in allInStockItems"
            :key="item.collectId"
            :product-id="item.productId"
            :product-no="item.productNo"
            :name="item.productName"
            :image-url="item.productImage"
            :price="item.price"
            :in-stock="item.inStock"
            :sales="item.salesOf7"
            @click="handleProductClick(item.productNo)"
          />
        </div>
      </div>

      <!-- 空状态 -->
      <div
        v-if="allInStockItems.length === 0 && allOutOfStockItems.length === 0"
        class="bg-white rounded-lg border border-gray-200 p-8"
      >
        <div class="flex flex-col items-center justify-center text-center">
          <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">收藏夹为空</h3>
          <p class="text-gray-500">
            您还没有收藏任何商品，去一手 App 添加收藏吧
          </p>
        </div>
      </div>

      <!-- 加载更多按钮 -->
      <div v-if="hasMore" class="flex justify-center pt-4">
        <UiButton
          variant="outline"
          :loading="isLoading"
          @click="handleLoadMore"
        >
          加载更多
        </UiButton>
      </div>

      <!-- 加载中提示 -->
      <div v-if="isLoading && collectionResult" class="flex justify-center py-4">
        <div class="flex items-center text-gray-500">
          <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2" />
          正在加载...
        </div>
      </div>
    </div>

    <!-- 初始空状态 -->
    <div v-else class="bg-white rounded-lg border border-gray-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">开始监控</h3>
        <p class="text-gray-500 mb-4">
          点击刷新按钮开始加载收藏夹商品
        </p>
        <UiButton @click="handleRefresh">
          开始加载
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 页面元信息
definePageMeta({
  title: '收藏夹监控',
})

// 使用收藏夹 composable
const {
  collectionResult,
  isLoading,
  error,
  currentPage,
  hasMore,
  allInStockItems,
  allOutOfStockItems,
  refresh,
  loadMore,
  goToProductDetail,
} = useCollection()

// 使用监控 composable
const {
  isLoading: isMonitoring,
  createMonitorTask,
  monitorAllOutOfStock,
} = useMonitor()

// 单个商品监控状态（记录正在监控的商品 collectId）
const monitoringItems = ref<Set<string>>(new Set())

// 刷新处理
const handleRefresh = () => {
  refresh()
}

// 加载更多处理
const handleLoadMore = () => {
  loadMore()
}

// 点击商品卡片
const handleProductClick = (productNo: string) => {
  goToProductDetail(productNo)
}

// 监控单个商品
const handleMonitorSingle = async (item: {
  productId: string
  productName: string
  collectId: string
}) => {
  // 添加到监控状态
  monitoringItems.value.add(item.collectId)

  try {
    await createMonitorTask([
      {
        productId: item.productId,
        productName: item.productName,
      },
    ])
  } finally {
    // 移除监控状态
    monitoringItems.value.delete(item.collectId)
  }
}

// 监控所有无货商品
const handleMonitorAll = async () => {
  const products = allOutOfStockItems.value.map(item => ({
    productId: item.productId,
    productName: item.productName,
  }))

  await monitorAllOutOfStock(products)
}

// 页面加载时自动获取数据
onMounted(() => {
  refresh()
})
</script>
