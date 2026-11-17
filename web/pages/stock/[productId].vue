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
          <div class="w-full sm:w-72 flex-shrink-0">
            <UiSkeleton variant="rounded" class="w-full aspect-square" />
          </div>
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
        <!-- 商品图集：通栏 cover 缩略图，点击全屏预览 -->
        <UiImageGallery :images="skuResult.images || []" :name="skuResult.productName" />

        <!-- 商品信息 -->
        <div class="mt-4 space-y-2">
            <h1 class="text-lg font-bold text-gray-900">{{ skuResult.productName }}</h1>
            <p class="text-sm text-gray-500">货号：{{ skuResult.productNo }}</p>
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span class="text-2xl font-bold text-red-600">¥{{ skuResult.price.toFixed(2) }}</span>
              <template v-if="discountInfo">
                <span class="text-sm text-gray-400 line-through">
                  ¥{{ discountInfo.originalPrice.toFixed(2) }}
                </span>
                <span
                  class="inline-flex items-center rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-600"
                  :title="`原价 ¥${discountInfo.originalPrice.toFixed(2)}，省 ¥${discountInfo.saved.toFixed(2)}`"
                >
                  {{ discountInfo.label }}
                </span>
              </template>
              <span
                v-if="skuResult.priceNote"
                class="text-xs font-normal text-gray-500"
              >{{ skuResult.priceNote }}</span>
            </div>

            <!-- 优惠券：满减券 + 可领红包（仅登录态有数据） -->
            <div
              v-if="skuResult.couponsNew?.length || skuResult.coupons?.length"
              class="flex flex-wrap items-center gap-2 pt-1"
            >
              <template v-for="c in skuResult.couponsNew" :key="`new-${c.couponId}`">
                <span
                  v-if="c.threshold > 0 && c.reduce > 0"
                  class="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600"
                >
                  <span class="font-semibold">满减券</span>
                  <span>满 ¥{{ c.threshold }} 减 ¥{{ c.reduce }}</span>
                </span>
              </template>
              <span
                v-for="c in skuResult.coupons"
                :key="`coupon-${c.couponId}`"
                class="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
              >
                <span class="font-semibold">{{ c.typeTitle || '红包' }}</span>
                <span v-if="c.title" class="text-amber-600">{{ c.title }}</span>
              </span>
            </div>

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

            <!-- 商品级状态提示：停售 / 下架 / 缺货时即便规格还有库存也不可下单 -->
            <div
              v-if="!skuResult.inStock"
              class="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
            >
              <svg class="inline-block w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77.333.192 3 1.732 3z" />
              </svg>
              {{ skuResult.stockMessage }}，暂不可下单
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

            <!-- 操作按钮：到货监控 / 价格监控 / 打开一手 App -->
            <div class="flex flex-wrap gap-2 pt-2">
              <UiButton
                variant="primary"
                size="sm"
                @click="openStockMonitor"
              >
                <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                到货监控
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

              <UiButton
                variant="danger"
                size="sm"
                :loading="isOrdering"
                :disabled="isOrdering || !skuResult.inStock || skuResult.inStockSkuCount <= 0"
                :title="!skuResult.inStock ? skuResult.stockMessage : ''"
                @click="handleManualOrder"
              >
                <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 5h12m-6-3a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2z" />
                </svg>
                一键下单
              </UiButton>

              <UiButton
                variant="outline"
                size="sm"
                :loading="collectionBusy"
                :disabled="collectionBusy"
                :class="isProductCollected
                  ? 'text-amber-600 border-amber-200 bg-amber-50 hover:border-amber-300'
                  : 'text-amber-600 border-amber-200 hover:bg-amber-50 hover:border-amber-300'"
                @click="handleToggleCollection"
              >
                <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" :fill="isProductCollected ? 'currentColor' : 'none'" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                {{ isProductCollected ? '取消收藏' : '收藏' }}
              </UiButton>

              <UiButton
                v-if="isMobileViewport"
                variant="outline"
                size="sm"
                class="text-orange-600 border-orange-200 hover:bg-orange-50 hover:border-orange-300"
                @click="openYishou"
              >
                <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                打开一手 App
              </UiButton>
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

      <!-- 商品补充信息：档口 / 发货 / 文案 / 标签 / 视频 / 属性 -->
      <div
        v-if="skuResult.tags?.length || skuResult.provider || skuResult.originName
          || skuResult.saleNote || skuResult.remindNote || skuResult.props?.length
          || skuResult.videoUrl"
        class="bg-white rounded-lg border border-gray-200 p-4 space-y-4"
      >
        <h2 class="text-lg font-semibold text-gray-900">商品信息</h2>

        <!-- 销售 / 发货文案 -->
        <div v-if="skuResult.saleNote || skuResult.remindNote" class="space-y-2">
          <p v-if="skuResult.saleNote" class="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {{ skuResult.saleNote }}
          </p>
          <p v-if="skuResult.remindNote" class="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            {{ skuResult.remindNote }}
          </p>
        </div>

        <!-- 档口信息 -->
        <div v-if="skuResult.provider" class="flex items-center gap-3">
          <img
            v-if="skuResult.provider.image"
            :src="skuResult.provider.image"
            alt="档口"
            class="w-12 h-12 rounded-lg object-cover border border-gray-200 flex-shrink-0"
          />
          <div class="min-w-0">
            <p class="text-sm font-medium text-gray-900">
              {{ skuResult.provider.name || '档口' }}
              <span v-if="skuResult.provider.market" class="ml-1 text-xs font-normal text-gray-500">
                · {{ skuResult.provider.market }}
              </span>
            </p>
            <p v-if="skuResult.provider.address" class="text-xs text-gray-500">
              地址：{{ skuResult.provider.address }}
            </p>
          </div>
        </div>

        <!-- 发货地 -->
        <p v-if="skuResult.originName" class="text-sm text-gray-600">
          <span class="text-gray-400">发货：</span>{{ skuResult.originName }}
        </p>

        <!-- 商品标签 -->
        <div v-if="skuResult.tags?.length" class="flex flex-wrap gap-2">
          <span
            v-for="(tag, i) in skuResult.tags"
            :key="i"
            class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700"
          >{{ tag }}</span>
        </div>

        <!-- 商品视频 -->
        <div v-if="skuResult.videoUrl">
          <p class="text-sm font-medium text-gray-900 mb-2">商品视频</p>
          <video
            :src="skuResult.videoUrl"
            controls
            playsinline
            preload="metadata"
            class="w-full max-w-md rounded-lg bg-black"
          />
        </div>

        <!-- 商品属性 -->
        <div v-if="skuResult.props?.length">
          <p class="text-sm font-medium text-gray-900 mb-2">商品属性</p>
          <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            <div v-for="(prop, i) in skuResult.props" :key="i" class="flex text-sm border-b border-gray-100 py-1">
              <dt class="text-gray-400 flex-shrink-0">{{ prop.label }}：</dt>
              <dd class="text-gray-700 truncate" :title="prop.value">{{ prop.value }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>

    <!-- 价格监控弹窗 -->
    <PriceMonitorDialog
      v-model:open="showPriceDialog"
      :product="priceMonitorProduct"
    />

    <!-- 到货监控配置弹窗（内部可选是否自动下单） -->
    <StockMonitorDialog
      v-model:open="showStockMonitorDialog"
      :product="monitorProduct"
    />
  </div>
</template>

<script setup lang="ts">
import type { AutoOrderResult } from '@core'
import type { ApiResponse } from '@/types'

// 页面元信息
definePageMeta({
  title: 'SKU 详情',
})
const route = useRoute()
const router = useRouter()
/** 商品 ID（goods_id）：与一手 App 详情页一致，链接、接口都用它 */
const productId = computed(() => route.params.productId as string)

// 一键唤起一手 App 商品详情（手机端才显示入口）
const { isMobileViewport, openYishouProduct } = useYishouApp()

// 使用库存查询 composable
const {
  skuResult,
  isLoadingSkus,
  skuError,
  getProductSkus,
} = useStock()

// 加入 / 移出一手收藏夹
const { addingNo, addToCollection } = useCollectionAdd()
const { removingNo, removeFromCollection } = useCollectionRemove()

/**
 * 收藏状态：商品详情接口（get_goods_info_v2）直接带回 collect_id
 *
 * 匿名请求恒为 '0'，登录态才有真实收藏条目 ID，所以不再额外发一次库存查询。
 */
const isProductCollected = computed(() => isCollectedId(skuResult.value?.collectId))

/** 收藏按钮忙碌态：加/删共用，避免两个请求打架 */
const collectionBusy = computed(() => {
  const no = skuResult.value?.productNo
  return Boolean(no) && (addingNo.value === no || removingNo.value === no)
})

// 手动一键下单：所有有货规格各 1 件，合计不超过 5 件
const toast = useToast()
const { confirm: confirmDialog } = useConfirmDialog()
const isOrdering = ref(false)

// 到货监控配置弹窗（监控时长、是否自动下单都在弹窗里设置）
const showStockMonitorDialog = ref(false)

// 价格监控弹窗
const showPriceDialog = ref(false)
const priceMonitorProduct = ref<{
  productId: string
  productName?: string
  productImage?: string
  productNo?: string
} | null>(null)

// 打开到货监控配置弹窗
const openStockMonitor = () => {
  if (!skuResult.value) {
    return
  }

  showStockMonitorDialog.value = true
}

// 唤起一手 App 到本商品详情页（桌面端不显示入口，无需兜底）
const openYishou = () => {
  const result = skuResult.value
  if (!result) {
    return
  }
  openYishouProduct(result.productId, result.productNo)
}

// 收藏 / 取消收藏当前商品：收藏按 goods_no，取消按 goods_no + collect_id
const handleToggleCollection = async () => {
  const result = skuResult.value
  if (!result || collectionBusy.value) {
    return
  }
  if (isProductCollected.value) {
    if (result.collectId === 'collected') {
      toast.warning('请刷新页面后再取消收藏')
      return
    }
    const outcome = await removeFromCollection(result.productNo, result.productId, result.collectId)
    // 取消成功后本地标记为未收藏，星标立即熄灭
    if (outcome.ok) {
      result.collectId = '0'
    }
    return
  }
  const outcome = await addToCollection(result.productNo)
  // 收藏接口只认货号，成功后就地更新收藏标记（真实 collect_id 或占位值）
  if (outcome.ok) {
    result.collectId = outcome.collectId ?? 'collected'
  }
}

// 弹窗需要的商品信息
const monitorProduct = computed(() => {
  if (!skuResult.value) {
    return null
  }

  return {
    productId: skuResult.value.productId,
    productName: skuResult.value.productName,
    productImage: skuResult.value.productImage,
    productNo: skuResult.value.productNo,
  }
})

// 打开价格监控弹窗
const openPriceMonitor = () => {
  if (!skuResult.value) {
    return
  }

  priceMonitorProduct.value = {
    productId: skuResult.value.productId,
    productName: skuResult.value.productName,
    productImage: skuResult.value.productImage,
    productNo: skuResult.value.productNo,
  }
  showPriceDialog.value = true
}

// 一键下单：不选规格，所有有货 SKU 各 1 件（最多 5 件），建单后去一手 App 付款
const handleManualOrder = async () => {
  const result = skuResult.value
  if (!result || isOrdering.value) {
    return
  }

  if (!result.inStock) {
    toast.warning(result.stockMessage || '商品当前不可下单')
    return
  }

  if (result.inStockSkuCount <= 0) {
    toast.warning('当前没有有货的规格，无法下单')
    return
  }

  const confirmed = await confirmDialog({
    title: '确认下单',
    message: `将为「${result.productName}」所有有货规格各下 1 件（最多 5 件）。下单会立即锁定库存，需到一手 App 内完成付款。`,
    type: 'warning',
    confirmText: '确认下单',
    cancelText: '取消',
  })
  if (!confirmed) {
    return
  }

  isOrdering.value = true
  try {
    const response = await $fetch<
      ApiResponse<AutoOrderResult & { renewAction?: 'created' | 'extended' | 'skipped' }>
    >('/api/order/manual', {
      method: 'POST',
      body: { goodsId: result.productId, goodsNo: result.productNo },
    })

    if (response.success && response.data) {
      const order = response.data
      if (order.success) {
        const amountText =
          typeof order.orderAmount === 'number' ? `，应付 ¥${order.orderAmount.toFixed(2)}` : ''
        const renewText =
          order.renewAction === 'created'
            ? '，已开启订单续期'
            : order.renewAction === 'extended'
              ? '，订单续期已延长至 12 小时'
              : ''
        toast.success(
          `已创建订单 ${order.orderSn ?? ''}（${order.num ?? 0} 件${amountText}）${renewText}，请到一手 App 付款`
        )
      } else {
        toast.error(order.message || '下单失败')
      }
    } else {
      toast.error(response.error?.message || '下单失败')
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '网络请求失败')
  } finally {
    isOrdering.value = false
  }
}

// 折扣信息：原价 + 折扣率（如「5折」）。没有原价、或原价不高于现价时不展示
const discountInfo = computed(() => {
  const result = skuResult.value
  const originalPrice = result?.originalPrice
  if (!result || !originalPrice || result.price <= 0 || originalPrice <= result.price) {
    return null
  }
  // 折数 = 现价 / 原价 × 10，保留一位小数并去掉多余的 .0（5.0 → 5折）
  const discount = (result.price / originalPrice) * 10
  return {
    originalPrice,
    label: `${Number(discount.toFixed(1))}折`,
    saved: originalPrice - result.price,
  }
})

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

// 重试加载
const handleRetry = () => {
  loadSkuData()
}

// 加载 SKU 数据
const loadSkuData = async () => {
  if (!productId.value) return
  await getProductSkus(productId.value)
}

// 页面加载时获取数据
onMounted(() => {
  loadSkuData()
})

// 监听路由参数变化
watch(productId, () => {
  loadSkuData()
})
</script>
