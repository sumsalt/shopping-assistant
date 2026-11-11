<template>
  <div class="max-w-4xl mx-auto">
    <!-- 页面标题 -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">库存查询</h1>
      <p class="mt-1 text-sm text-gray-500">输入商品 ID 或货号查询库存状态，支持批量查询</p>
    </div>

    <!-- 搜索区域 -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <form @submit.prevent="handleSearch">
        <div class="flex flex-col sm:flex-row gap-4">
          <div class="flex-1">
            <UiInput
              v-model="searchQuery"
              placeholder="请输入商品 ID 或货号，多个 ID 用逗号分隔"
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
            <p v-if="searchQuery.includes(',') || searchQuery.includes('，')" class="mt-1 text-xs text-gray-500">
              检测到多个商品 ID，将进行批量查询
            </p>
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

    <!-- 批量查询结果 -->
    <div v-else-if="batchStockResults" class="space-y-6">
      <!-- 统计信息 -->
      <div class="bg-white rounded-lg border border-gray-200 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-medium text-gray-900">查询结果统计</h3>
          <UiButton
            v-if="outOfStockCount > 0"
            variant="primary"
            size="sm"
            :loading="isCreatingMonitor"
            :disabled="isCreatingMonitor"
            @click="handleBatchMonitor"
          >
            <svg v-if="!isCreatingMonitor" class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {{ isCreatingMonitor ? '创建中' : '监控所有无货商品' }}
          </UiButton>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div class="text-center">
            <div class="text-3xl font-bold text-blue-600">{{ batchStockResults.total }}</div>
            <div class="text-sm text-gray-500">总数</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-green-600">{{ batchStockResults.successCount }}</div>
            <div class="text-sm text-gray-500">成功</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-red-600">{{ batchStockResults.failedCount }}</div>
            <div class="text-sm text-gray-500">失败</div>
          </div>
        </div>
        <div v-if="outOfStockCount > 0" class="mt-4 p-3 bg-orange-50 rounded-lg">
          <div class="flex items-center justify-between">
            <div class="text-sm text-orange-800">
              发现 <span class="font-bold">{{ outOfStockCount }}</span> 个无货商品
            </div>
            <UiButton
              variant="outline"
              size="xs"
              @click="handleBatchMonitor"
            >
              点击批量创建监控
            </UiButton>
          </div>
        </div>
      </div>

      <!-- 成功的商品列表 -->
      <div v-if="batchStockResults.successItems.length > 0" class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900">查询成功（{{ batchStockResults.successCount }}）</h3>
        <div class="grid grid-cols-1 gap-4">
          <div
            v-for="item in batchStockResults.successItems"
            :key="item.productId"
            class="bg-white rounded-lg border border-gray-200 p-4"
          >
            <StockProductCard
              :product-id="item.productId"
              :product-no="item.productNo"
              :name="item.productName"
              :image-url="item.productImage"
              :price="item.price"
              :price-note="item.priceNote"
              :in-stock="item.inStock"
              :message="item.message"
              :show-monitor-button="!item.inStock"
              show-price-monitor-button
              @click="handleProductClick(item)"
              @monitor="handleMonitor(item)"
              @price-monitor="openPriceMonitor(item)"
            />
          </div>
        </div>
      </div>

      <!-- 失败的商品列表 -->
      <div v-if="batchStockResults.failedItems.length > 0" class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900">查询失败（{{ batchStockResults.failedCount }}）</h3>
        <div class="space-y-2">
          <div
            v-for="item in batchStockResults.failedItems"
            :key="item.productId"
            class="bg-red-50 rounded-lg border border-red-200 p-4"
          >
            <div class="flex items-start justify-between">
              <div>
                <div class="font-medium text-gray-900">{{ item.productId }}</div>
                <div class="mt-1 text-sm text-red-700">{{ item.error }}</div>
              </div>
              <div class="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded">
                {{ item.errorType }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 单个查询结果 -->
    <div v-else-if="stockResult" class="space-y-6">
      <!-- 商品卡片 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StockProductCard
          :product-id="stockResult.productId"
          :product-no="stockResult.productNo"
          :name="stockResult.productName"
          :image-url="stockResult.productImage"
          :price="stockResult.price"
          :price-note="stockResult.priceNote"
          :in-stock="stockResult.inStock"
          :message="stockResult.message"
          :show-monitor-button="!stockResult.inStock"
          show-price-monitor-button
          @click="handleProductClick(stockResult)"
          @monitor="handleMonitor(stockResult)"
          @price-monitor="openPriceMonitor(stockResult)"
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
              <dd class="text-sm font-medium text-red-600">
                ¥{{ stockResult.price.toFixed(2) }}
                <span v-if="stockResult.priceNote" class="ml-1 text-xs font-normal text-gray-400">
                  {{ stockResult.priceNote }}
                </span>
              </dd>
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
              <!-- 到货监控按钮（打开统一配置弹窗） -->
              <UiButton
                v-if="!stockResult.inStock"
                variant="primary"
                size="sm"
                class="flex-1"
                @click="handleMonitor(stockResult)"
              >
                <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                到货监控
              </UiButton>
              <!-- 价格监控按钮 -->
              <UiButton
                variant="outline"
                size="sm"
                class="flex-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
                @click="openPriceMonitor(stockResult)"
              >
                <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                价格监控
              </UiButton>
              <!-- 查看详情按钮 -->
              <UiButton
                variant="outline"
                size="sm"
                :class="stockResult.inStock ? 'flex-1' : ''"
                @click="handleProductClick(stockResult)"
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
        <li>支持输入单个或多个商品 ID 进行查询，多个 ID 用逗号分隔</li>
        <li>批量查询时，会显示成功和失败的商品列表及统计信息</li>
        <li>查询结果显示商品基本信息和库存状态</li>
        <li>点击商品卡片或"查看 SKU 详情"按钮可查看所有颜色尺码的库存</li>
        <li>点击"价格监控"可监控该商品拿货价的涨跌变化</li>
      </ul>
    </div>

    <!-- 价格监控弹窗 -->
    <PriceMonitorDialog
      v-model:open="showPriceDialog"
      :product="priceMonitorProduct"
    />

    <!-- 到货监控配置弹窗（监控时长、是否自动下单） -->
    <StockMonitorDialog
      v-model:open="showStockMonitorDialog"
      :product="monitorProduct"
    />
  </div>
</template>

<script setup lang="ts">
import { DEFAULT_STOCK_MONITOR_DURATION, formatMonitorDuration } from '@/utils/stockMonitorConfig'

// 页面元信息
definePageMeta({
  title: '库存查询',
})

// 使用 toast
const toast = useToast()

// 使用确认对话框
const confirmDialog = useConfirmDialog()

// 使用库存查询 composable
const {
  stockResult,
  batchStockResults,
  isCheckingStock,
  stockError,
  checkStock,
  checkStockBatch,
  goToProductDetail,
} = useStock()

// 使用监控 composable（单商品走配置弹窗，只有批量还直接创建）
const { monitorAllOutOfStock, isLoading: isCreatingMonitor } = useMonitor()

// 搜索关键词
const searchQuery = ref('')

// 到货监控配置弹窗
const showStockMonitorDialog = ref(false)
const monitorProduct = ref<{
  productId: string
  productName?: string
  productImage?: string
  productNo?: string
} | null>(null)

// 价格监控弹窗
const showPriceDialog = ref(false)
const priceMonitorProduct = ref<{
  productId: string
  productName?: string
  productImage?: string
} | null>(null)

// 打开价格监控弹窗
const openPriceMonitor = (item: any) => {
  if (!item?.productId) {
    return
  }

  priceMonitorProduct.value = {
    productId: item.productId,
    productName: item.productName,
    productImage: item.productImage,
  }
  showPriceDialog.value = true
}

// 计算无货商品数量
const outOfStockCount = computed(() => {
  if (!batchStockResults.value) {
    return 0
  }
  return batchStockResults.value.successItems.filter(item => !item.inStock).length
})

// 搜索处理
const handleSearch = async () => {
  const query = searchQuery.value.trim()
  if (!query) {
    return
  }

  // 检查是否是批量查询（包含逗号）
  const productIds = query.split(/[,，]/).map(id => id.trim()).filter(id => id)

  if (productIds.length > 1) {
    // 批量查询
    await checkStockBatch(productIds)
  } else {
    // 单个查询
    await checkStock(productIds[0])
  }
}

// 重试
const handleRetry = () => {
  handleSearch()
}

// 点击商品卡片
const handleProductClick = (item: any) => {
  if (item?.productNo) {
    goToProductDetail(item.productNo)
  }
}

// 打开到货监控配置弹窗（单商品入口）
const handleMonitor = (item: any) => {
  if (!item?.productId) {
    return
  }

  // 如果有货，提示用户
  if (item.inStock) {
    toast.warning('商品当前有货，无需监控')
    return
  }

  monitorProduct.value = {
    productId: item.productId,
    productName: item.productName,
    productImage: item.productImage,
    productNo: item.productNo,
  }
  showStockMonitorDialog.value = true
}

// 批量监控所有无货商品
const handleBatchMonitor = async () => {
  if (!batchStockResults.value) {
    return
  }

  const outOfStockItems = batchStockResults.value.successItems.filter(item => !item.inStock)

  if (outOfStockItems.length === 0) {
    toast.info('没有需要监控的无货商品')
    return
  }

  const confirmed = await confirmDialog.confirm({
    title: '批量创建监控',
    message: `确定要为 ${outOfStockItems.length} 个无货商品创建到货监控吗？将使用默认配置：仅邮件提醒、时长 ${formatMonitorDuration(DEFAULT_STOCK_MONITOR_DURATION)}。单独商品可点「到货监控」自定义配置（含自动下单）。`,
    confirmText: '确定',
    cancelText: '取消',
  })

  if (!confirmed) {
    return
  }

  // 一个任务只监控一个商品，批量场景拆成多个任务串行创建（提示由 composable 统一给出）
  await monitorAllOutOfStock(
    outOfStockItems.map(item => ({
      productId: item.productId,
      productName: item.productName,
      productImage: item.productImage,
    }))
  )
}
</script>
