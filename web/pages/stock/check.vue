<template>
  <div class="max-w-4xl mx-auto">
    <!-- 页面标题 -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">库存查询</h1>
      <p class="mt-1 text-sm text-gray-500">纯数字按商品 ID / 货号查库存，输入文字关键词则搜索商品</p>
    </div>

    <!-- 搜索区域 -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <form @submit.prevent="handleSearch">
        <div class="flex flex-col sm:flex-row gap-4">
          <div class="flex-1">
            <UiInput
              v-model="searchQuery"
              placeholder="输入商品 ID / 货号，或输入关键词搜索商品"
              size="lg"
              clearable
              :disabled="isCheckingStock || isSearchingKeyword"
            >
              <template #prefix>
                <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </template>
            </UiInput>
            <p v-if="searchQuery.trim() && !isNumericQuery" class="mt-1 text-xs text-blue-600">
              将按关键词搜索商品（可能有多页结果）
            </p>
          </div>
          <UiButton
            type="submit"
            size="lg"
            :loading="isCheckingStock || isSearchingKeyword"
            :disabled="!searchQuery.trim() || isCheckingStock || isSearchingKeyword || isLoadingMore"
          >
            查询
          </UiButton>
        </div>
      </form>
    </div>

    <!-- 加载状态 -->
    <div v-if="isCheckingStock || isSearchingKeyword" class="bg-white rounded-lg border border-gray-200 p-8">
      <div class="flex flex-col items-center justify-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
        <p class="text-gray-500">{{ isSearchingKeyword ? '正在搜索商品...' : '正在查询库存...' }}</p>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="stockError || keywordError" class="bg-white rounded-lg border border-red-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">{{ keywordError ? '搜索失败' : '查询失败' }}</h3>
        <p class="text-gray-500 mb-4">{{ stockError || keywordError }}</p>
        <UiButton variant="outline" @click="handleRetry">
          重新查询
        </UiButton>
      </div>
    </div>

    <!-- 关键词搜索结果 -->
    <div v-else-if="keywordResults" class="space-y-4">
      <div class="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-2">
        <div class="text-sm text-gray-700">
          「<strong>{{ keywordResults.keyword }}</strong>」共 {{ keywordResults.totals }} 个结果，
          已显示 {{ keywordResults.items.length }} 个
        </div>
        <div class="text-xs text-gray-500">
          第 {{ keywordResults.page }} / {{ keywordResults.pageTotal }} 页
        </div>
      </div>

      <div v-if="keywordResults.items.length" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <a
          v-for="item in keywordResults.items"
          :key="item.productNo || item.productId"
          :href="keywordDetailHref(item)"
          target="_blank"
          rel="noopener noreferrer"
          class="block bg-white rounded-lg border border-gray-200 p-2 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all"
        >
          <div class="aspect-square bg-gray-100 rounded overflow-hidden">
            <img
              v-if="item.image"
              :src="item.image"
              :alt="item.name"
              class="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          <p class="mt-2 text-xs font-medium text-gray-900 line-clamp-2" :title="item.name">
            {{ item.name }}
          </p>
          <p class="mt-1 text-xs text-gray-400 truncate">
            {{ item.brandName }} · 货号 {{ item.productNo }}
          </p>
          <p class="mt-1 text-sm font-bold text-red-600">
            {{ item.price !== undefined ? '¥' + item.price.toFixed(2) : '价格暂不可用' }}
          </p>
        </a>
      </div>
      <div v-else class="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
        没有搜索到相关商品
      </div>

      <div v-if="keywordResults.page < keywordResults.pageTotal" class="flex justify-center">
        <UiButton
          variant="outline"
          :loading="isLoadingMore"
          :disabled="isLoadingMore"
          @click="loadMoreKeywordResults"
        >
          加载更多
        </UiButton>
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
          @click="handleProductClick(stockResult)"
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
            <UiButton
              variant="primary"
              size="sm"
              class="w-full"
              @click="handleProductClick(stockResult)"
            >
              查看 SKU 详情（创建监控）
            </UiButton>
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
          输入商品 ID / 货号查库存，或输入文字关键词搜索商品
        </p>
      </div>
    </div>

    <!-- 使用说明 -->
    <div class="mt-6 p-4 bg-blue-50 rounded-lg">
      <h4 class="text-sm font-medium text-blue-800 mb-2">使用说明</h4>
      <ul class="text-sm text-blue-700 list-disc list-inside space-y-1">
        <li>输入单个纯数字商品 ID / 货号按原有方式查库存；一次只能查询一个</li>
        <li>输入含文字的关键词会搜索商品列表，点击商品进详情页查看实时库存与价格</li>
        <li>两种查询都按当前账号原样发起，不强制要求登录态；账号没有登录态时也能查，价格可能显示为「游客参考价」或暂不可用</li>
        <li>关键词搜索点击卡片在新窗口打开详情页，搜索结果保留在原标签页</li>
        <li>点击商品卡片或「查看 SKU 详情」可查看所有颜色尺码的库存</li>
        <li>到货监控、价格监控统一在商品详情页创建</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ApiResponse } from '@/types'
import type { KeywordSearchItem, KeywordSearchResult } from '@core/types'
import { isNumericProductQuery } from '@core/utils/product-query'

// 页面元信息
definePageMeta({
  title: '库存查询',
})

// 使用库存查询 composable
const {
  stockResult,
  isCheckingStock,
  stockError,
  checkStock,
  goToProductDetail,
} = useStock()

const toast = useToast()

// 搜索关键词
const searchQuery = ref('')
const isNumericQuery = computed(() => isNumericProductQuery(searchQuery.value))

// 关键词搜索状态
const keywordResults = ref<KeywordSearchResult | null>(null)
const isSearchingKeyword = ref(false)
const isLoadingMore = ref(false)
const keywordError = ref<string | null>(null)

/** 上次的搜索模式，供「重新查询」复用 */
const lastSearchMode = ref<'stock' | 'keyword'>('stock')
const lastKeyword = ref('')

/** 切换搜索模式时清空两类结果，避免旧结果残留 */
const clearResults = () => {
  stockResult.value = null
  stockError.value = null
  keywordResults.value = null
  keywordError.value = null
}

/** 调用关键词搜索接口；append=true 时把下一页追加到现有列表 */
const searchByKeyword = async (keyword: string, page: number, append: boolean) => {
  if (append) isLoadingMore.value = true
  else isSearchingKeyword.value = true
  keywordError.value = null

  try {
    const response = await $fetch<ApiResponse<KeywordSearchResult>>('/api/stock/search', {
      method: 'POST',
      body: { keyword, page },
    })

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '搜索失败')
    }

    const data = response.data
    keywordResults.value =
      append && keywordResults.value
        ? { ...data, items: [...keywordResults.value.items, ...data.items] }
        : data
  } catch (error) {
    const message = error instanceof Error ? error.message : '网络请求失败'
    keywordError.value = message
    toast.error(message)
  } finally {
    isSearchingKeyword.value = false
    isLoadingMore.value = false
  }
}

// 搜索处理：单个纯数字走原有库存查询，其余走关键词搜索
const handleSearch = async () => {
  const query = searchQuery.value.trim()
  if (!query || isCheckingStock.value || isSearchingKeyword.value || isLoadingMore.value) {
    return
  }

  // 一次只查一个商品：多个 ID 输入给出明确提示，避免被当成关键词搜出空结果
  const idParts = query.split(/[,，]/).map(part => part.trim()).filter(Boolean)
  if (idParts.length > 1 && idParts.every(part => /^\d+$/.test(part))) {
    toast.warning('一次只能查询一个商品 ID / 货号，请分开查询')
    return
  }

  if (isNumericProductQuery(query)) {
    lastSearchMode.value = 'stock'
    clearResults()
    await checkStock(query)
  } else {
    lastSearchMode.value = 'keyword'
    lastKeyword.value = query
    clearResults()
    await searchByKeyword(query, 1, false)
  }
}

// 加载下一页
const loadMoreKeywordResults = async () => {
  const current = keywordResults.value
  if (!current || isLoadingMore.value || isSearchingKeyword.value) return
  const nextPage = current.page + 1
  if (current.pageTotal && nextPage > current.pageTotal) return
  await searchByKeyword(current.keyword, nextPage, true)
}

// 重试
const handleRetry = () => {
  if (lastSearchMode.value === 'keyword' && lastKeyword.value) {
    clearResults()
    void searchByKeyword(lastKeyword.value, 1, false)
  } else {
    void handleSearch()
  }
}

// 点击商品卡片（库存查询结果）
const handleProductClick = (item: any) => {
  if (item?.productNo) {
    goToProductDetail(item.productNo)
  }
}

/** 关键词结果卡片用新窗口打开详情，保留原标签页的搜索列表 */
const keywordDetailHref = (item: KeywordSearchItem): string | undefined =>
  item.productNo ? `/stock/${encodeURIComponent(item.productNo)}` : undefined
</script>
