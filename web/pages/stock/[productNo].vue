<template>
  <div class="max-w-4xl mx-auto">
    <!-- 返回按钮 -->
    <div class="mb-4">
      <button
        type="button"
        class="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
        @click="handleBack"
      >
        <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        返回
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoadingSkus" class="space-y-4">
      <!-- 商品信息骨架屏 -->
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <div class="flex flex-col sm:flex-row gap-4">
          <UiSkeleton variant="rounded" :width="160" :height="160" />
          <div class="flex-1 space-y-3">
            <UiSkeleton variant="text" width="60%" height="24" />
            <UiSkeleton variant="text" width="40%" height="20" />
            <UiSkeleton variant="text" width="30%" height="28" />
            <UiSkeleton variant="text" width="50%" height="20" />
          </div>
        </div>
      </div>
      <!-- SKU 表格骨架屏 -->
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <UiSkeleton variant="text" width="100%" height="40" class="mb-4" />
        <UiSkeleton variant="text" width="100%" height="200" />
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="skuError" class="bg-white rounded-lg border border-red-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">加载失败</h3>
        <p class="text-gray-500 mb-4">{{ skuError }}</p>
        <UiButton variant="outline" @click="handleRetry">
          重新加载
        </UiButton>
      </div>
    </div>

    <!-- 商品详情 -->
    <div v-else-if="skuResult" class="space-y-6">
      <!-- 商品基本信息 -->
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <div class="flex flex-col sm:flex-row gap-4">
          <!-- 商品图片 -->
          <div class="w-40 h-40 flex-shrink-0">
            <img
              v-if="skuResult.productImage"
              :src="skuResult.productImage"
              :alt="skuResult.productName"
              class="w-full h-full object-cover rounded-lg"
            />
            <div
              v-else
              class="w-full h-full bg-gray-100 rounded-lg flex items-center justify-center"
            >
              <svg class="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <!-- 商品信息 -->
          <div class="flex-1 space-y-2">
            <h1 class="text-lg font-bold text-gray-900">{{ skuResult.productName }}</h1>
            <p class="text-sm text-gray-500">货号：{{ skuResult.productNo }}</p>
            <p class="text-2xl font-bold text-red-600">¥{{ skuResult.price.toFixed(2) }}</p>
            <div class="flex items-center gap-4 text-sm text-gray-500">
              <span>销量：{{ formatSales(skuResult.sales) }}</span>
              <span>颜色：{{ skuResult.colors.length }} 种</span>
              <span>尺码：{{ skuResult.sizes.length }} 种</span>
            </div>

            <!-- 限购提示 -->
            <div
              v-if="skuResult.restrictionNumber > 0"
              class="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800"
            >
              <svg class="inline-block w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              限购 {{ skuResult.restrictionNumber }} 件
            </div>

            <!-- 库存统计 -->
            <div class="flex items-center gap-4 pt-2">
              <div class="flex items-center">
                <span class="w-3 h-3 rounded-full bg-green-500 mr-2" />
                <span class="text-sm text-gray-600">有货 {{ skuResult.inStockSkuCount }} 个规格</span>
              </div>
              <div class="flex items-center">
                <span class="w-3 h-3 rounded-full bg-red-500 mr-2" />
                <span class="text-sm text-gray-600">无货 {{ skuResult.totalSkuCount - skuResult.inStockSkuCount }} 个规格</span>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="flex flex-wrap gap-2 pt-2">
              <UiButton
                v-if="skuResult.inStockSkuCount < skuResult.totalSkuCount"
                variant="primary"
                size="sm"
                :loading="isCreatingMonitor && monitoringProductId === skuResult.productId"
                :disabled="isCreatingMonitor"
                @click="handleMonitor"
              >
                <svg v-if="!isCreatingMonitor || monitoringProductId !== skuResult.productId" class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {{ isCreatingMonitor && monitoringProductId === skuResult.productId ? '创建中' : '监控到货通知' }}
              </UiButton>

              <UiButton
                variant="outline"
                size="sm"
                class="text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
                @click="openPriceMonitor"
              >
                <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                价格监控
              </UiButton>
            </div>
          </div>
        </div>
      </div>

      <!-- SKU 表格 -->
      <div>
        <h2 class="text-lg font-semibold text-gray-900 mb-3">SKU 库存详情</h2>
        <StockSkuTable
          :skus="skuResult.skuList"
          :colors="skuResult.colors"
        />
      </div>
    </div>

    <!-- 价格监控弹窗 -->
    <PriceMonitorDialog
      v-model:open="showPriceDialog"
      :products="priceMonitorProducts"
    />
  </div>
</template>

<script setup lang="ts">
// 页面元信息
definePageMeta({
  title: 'SKU 详情',
})

// 获取路由参数
const route = useRoute()
const router = useRouter()
const productNo = computed(() => route.params.productNo as string)

// 使用库存查询 composable
const {
  skuResult,
  isLoadingSkus,
  skuError,
  getProductSkus,
} = useStock()

// 使用监控 composable
const { createMonitorTask, isLoading: isCreatingMonitor } = useMonitor()

// 使用 toast
const toast = useToast()

// 正在监控的商品 ID
const monitoringProductId = ref<string | null>(null)

// 价格监控弹窗
const showPriceDialog = ref(false)
const priceMonitorProducts = ref<Array<{
  productId: string
  productName?: string
  productImage?: string
}>>([])

// 打开价格监控弹窗
const openPriceMonitor = () => {
  if (!skuResult.value) {
    return
  }

  priceMonitorProducts.value = [
    {
      productId: skuResult.value.productId,
      productName: skuResult.value.productName,
      productImage: skuResult.value.productImage,
    },
  ]
  showPriceDialog.value = true
}

// 格式化销量
const formatSales = (sales: number): string => {
  if (sales >= 10000) {
    return `${(sales / 10000).toFixed(1)}万`
  }
  if (sales >= 1000) {
    return `${(sales / 1000).toFixed(1)}千`
  }
  return sales.toString()
}

// 返回上一页
const handleBack = () => {
  router.back()
}

// 监控商品
const handleMonitor = async () => {
  if (!skuResult.value) {
    return
  }

  const result = skuResult.value

  // 如果所有 SKU 都有货，提示用户
  if (result.inStockSkuCount === result.totalSkuCount) {
    toast.warning('商品所有规格都有货，无需监控')
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

// 重试加载
const handleRetry = () => {
  loadSkuData()
}

// 加载 SKU 数据
const loadSkuData = async () => {
  if (productNo.value) {
    await getProductSkus(productNo.value)
  }
}

// 页面加载时获取数据
onMounted(() => {
  loadSkuData()
})

// 监听路由参数变化
watch(productNo, () => {
  loadSkuData()
})
</script>
