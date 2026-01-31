<template>
  <div class="max-w-4xl mx-auto">
    <!-- 页面标题 -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">库存查询</h1>
      <p class="mt-1 text-sm text-gray-500">输入商品 ID 或货号查询库存状态</p>
    </div>

    <!-- 搜索区域 -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <form @submit.prevent="handleSearch">
        <div class="flex flex-col sm:flex-row gap-4">
          <div class="flex-1">
            <UiInput
              v-model="searchQuery"
              placeholder="请输入商品 ID 或货号"
              size="lg"
              clearable
              :disabled="isCheckingStock"
            >
              <template #prefix>
                <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </template>
            </UiInput>
          </div>
          <UiButton
            type="submit"
            size="lg"
            :loading="isCheckingStock"
            :disabled="!searchQuery.trim()"
          >
            查询
          </UiButton>
        </div>
      </form>
    </div>

    <!-- 加载状态 -->
    <div v-if="isCheckingStock" class="bg-white rounded-lg border border-gray-200 p-8">
      <div class="flex flex-col items-center justify-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
        <p class="text-gray-500">正在查询库存...</p>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="stockError" class="bg-white rounded-lg border border-red-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">查询失败</h3>
        <p class="text-gray-500 mb-4">{{ stockError }}</p>
        <UiButton variant="outline" @click="handleRetry">
          重新查询
        </UiButton>
      </div>
    </div>

    <!-- 查询结果 -->
    <div v-else-if="stockResult" class="space-y-6">
      <!-- 商品卡片 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StockProductCard
          :product-id="stockResult.productId"
          :product-no="stockResult.productNo"
          :name="stockResult.productName"
          :image-url="stockResult.productImage"
          :price="stockResult.price"
          :in-stock="stockResult.inStock"
          :message="stockResult.message"
          :show-monitor-button="!stockResult.inStock"
          :is-monitoring="isCreatingMonitor && monitoringProductId === stockResult.productId"
          @click="handleProductClick"
          @monitor="handleMonitor"
        />

        <!-- 详细信息卡片 -->
        <UiCard title="商品信息">
          <dl class="space-y-3">
            <div class="flex justify-between">
              <dt class="text-sm text-gray-500">商品 ID</dt>
              <dd class="text-sm font-medium text-gray-900">{{ stockResult.productId }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-sm text-gray-500">货号</dt>
              <dd class="text-sm font-medium text-gray-900">{{ stockResult.productNo }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-sm text-gray-500">价格</dt>
              <dd class="text-sm font-medium text-red-600">¥{{ stockResult.price.toFixed(2) }}</dd>
            </div>
            <div class="flex justify-between items-center">
              <dt class="text-sm text-gray-500">库存状态</dt>
              <dd>
                <StockStockStatus
                  :in-stock="stockResult.inStock"
                  variant="badge"
                />
              </dd>
            </div>
            <div v-if="stockResult.message" class="pt-2 border-t border-gray-100">
              <dt class="text-sm text-gray-500 mb-1">状态说明</dt>
              <dd class="text-sm text-gray-700">{{ stockResult.message }}</dd>
            </div>
          </dl>

          <template #footer>
            <div class="flex gap-2">
              <!-- 监控按钮 -->
              <UiButton
                v-if="!stockResult.inStock"
                variant="primary"
                size="sm"
                class="flex-1"
                :loading="isCreatingMonitor && monitoringProductId === stockResult.productId"
                :disabled="isCreatingMonitor"
                @click="handleMonitor"
              >
                <svg v-if="!isCreatingMonitor || monitoringProductId !== stockResult.productId" class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {{ isCreatingMonitor && monitoringProductId === stockResult.productId ? '创建中' : '监控到货' }}
              </UiButton>
              <!-- 查看详情按钮 -->
              <UiButton
                variant="outline"
                size="sm"
                :class="stockResult.inStock ? 'flex-1' : ''"
                @click="handleProductClick"
              >
                查看 SKU 详情
              </UiButton>
            </div>
          </template>
        </UiCard>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="bg-white rounded-lg border border-gray-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">开始查询</h3>
        <p class="text-gray-500 max-w-sm">
          在上方输入框中输入商品 ID 或货号，点击查询按钮获取库存信息
        </p>
      </div>
    </div>

    <!-- 使用说明 -->
    <div class="mt-6 p-4 bg-blue-50 rounded-lg">
      <h4 class="text-sm font-medium text-blue-800 mb-2">使用说明</h4>
      <ul class="text-sm text-blue-700 list-disc list-inside space-y-1">
        <li>支持输入商品 ID（数字）或货号（字母+数字）进行查询</li>
        <li>查询结果显示商品基本信息和库存状态</li>
        <li>点击商品卡片或"查看 SKU 详情"按钮可查看所有颜色尺码的库存</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
// 页面元信息
definePageMeta({
  title: '库存查询',
})

// 使用 toast
const toast = useToast()

// 使用库存查询 composable
const {
  stockResult,
  isCheckingStock,
  stockError,
  checkStock,
  goToProductDetail,
} = useStock()

// 使用监控 composable
const { createMonitorTask, isLoading: isCreatingMonitor } = useMonitor()

// 搜索关键词
const searchQuery = ref('')

// 正在监控的商品 ID
const monitoringProductId = ref<string | null>(null)

// 搜索处理
const handleSearch = async () => {
  const query = searchQuery.value.trim()
  if (!query) {
    return
  }
  await checkStock(query)
}

// 重试
const handleRetry = () => {
  handleSearch()
}

// 点击商品卡片
const handleProductClick = () => {
  if (stockResult.value?.productNo) {
    goToProductDetail(stockResult.value.productNo)
  }
}

// 监控商品
const handleMonitor = async () => {
  if (!stockResult.value) {
    return
  }

  const result = stockResult.value

  // 如果有货，提示用户
  if (result.inStock) {
    toast.warning('商品当前有货，无需监控')
    return
  }

  monitoringProductId.value = result.productId

  try {
    await createMonitorTask([
      {
        productId: result.productId,
        productName: result.productName,
        productImage: result.productImage,
      },
    ])
  } finally {
    monitoringProductId.value = null
  }
}
</script>
