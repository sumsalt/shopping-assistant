<template>
  <div class="max-w-6xl mx-auto">
    <TaskListHeader
      v-model="statusFilter"
      title="Tab 监控任务"
      description="监控 Tab 商品列表，累计发现新商品后邮件提醒"
      :is-loading="isLoading"
      :total="tasks.length"
      :counts="statusCounts"
      @refresh="fetchTasks()"
    >
      <template #actions>
        <UiButton size="sm" @click="showAddDialog = true">新增监控</UiButton>
      </template>
    </TaskListHeader>

    <!-- 加载状态 -->
    <div v-if="isLoading && tasks.length === 0" class="space-y-4">
      <div v-for="i in 3" :key="i" class="bg-white rounded-lg border border-gray-200 p-6">
        <UiSkeleton variant="text" width="200" height="24" class="mb-4" />
        <UiSkeleton variant="text" width="400" height="16" class="mb-2" />
        <UiSkeleton variant="text" width="300" height="16" />
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error && tasks.length === 0" class="bg-white rounded-lg border border-red-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <h3 class="text-lg font-medium text-gray-900 mb-2">加载失败</h3>
        <p class="text-gray-500 mb-4">{{ error }}</p>
        <UiButton variant="outline" @click="fetchTasks()">重新加载</UiButton>
      </div>
    </div>

    <!-- 完全没有任务 -->
    <div v-else-if="tasks.length === 0" class="bg-white rounded-lg border border-gray-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">暂无 Tab 监控任务</h3>
        <p class="text-gray-500 max-w-sm mb-4">创建一个 Tab 监控，任务会定时抓取该 Tab 的商品列表并累计新商品</p>
        <UiButton @click="showAddDialog = true">新增监控</UiButton>
      </div>
    </div>

    <!-- 有任务但当前状态下没有（筛选后无结果） -->
    <div v-else-if="filteredTasks.length === 0" class="bg-white rounded-lg border border-gray-200">
      <UiEmptyState
        type="search"
        title="该状态下暂无任务"
        description="换个状态看看，或切回「全部」。"
        action-text="查看全部"
        action-variant="outline"
        @action="statusFilter = 'all'"
      />
    </div>

    <!-- 任务列表 -->
    <div v-else class="space-y-4">
      <TaskCard
        v-for="task in filteredTasks"
        :key="task.id"
        :task="task"
        :busy="busyId === task.id"
        @restart="handleRestart"
        @delete="handleDelete"
      >
        <template #actions="{ task: item }">
          <UiButton
            v-if="item.config.mode !== 'diff' && seenCountOf(item) > 0"
            variant="outline"
            size="sm"
            class="text-teal-600 border-teal-200 hover:bg-teal-50 hover:border-teal-300"
            @click="openSeenDialog(item)"
          >
            累计商品 ({{ seenCountOf(item) }})
          </UiButton>
        </template>
      </TaskCard>
    </div>

    <TabCreateDialog v-model:open="showAddDialog" @created="handleCreated" />

    <!-- 累计商品对话框 -->
    <UiDialog
      :open="seenDialogOpen"
      title="累计商品"
      size="lg"
      :teleport="false"
      :fill="true"
      :compact="true"
      @update:open="seenDialogOpen = $event"
    >
      <div class="flex h-full min-h-0 flex-col gap-3">
        <!-- 排序切换：折扣排序在服务端做（全量排序后再分页），翻页顺序才连续 -->
        <div v-if="!seenLoading && seenItems.length > 0" class="flex items-center justify-end">
          <div class="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs">
            <button
              type="button"
              class="rounded-md px-3 py-1.5 font-medium transition-colors"
              :class="seenSort === 'recent' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'"
              @click="changeSeenSort('recent')"
            >
              最近发现
            </button>
            <button
              type="button"
              class="rounded-md px-3 py-1.5 font-medium transition-colors"
              :class="seenSort === 'discount' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'"
              @click="changeSeenSort('discount')"
            >
              折扣优先
            </button>
          </div>
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
          class="seen-list-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
          @scroll.passive="handleSeenScroll"
        >
          <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            <div
              v-for="item in seenItems"
              :key="item.productId"
              class="relative overflow-hidden rounded-xl bg-gray-50 ring-1 ring-gray-100"
            >
              <button
                v-if="item.productNo"
                type="button"
                class="absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full backdrop-blur-sm transition-colors"
                :class="[
                  isSeenCollected(item)
                    ? 'bg-amber-500/90 text-white'
                    : 'bg-black/45 text-white active:bg-black/70',
                  addingNo === item.productNo ? 'animate-pulse' : '',
                ]"
                :disabled="seenCollectionBusy(item)"
                :title="isSeenCollected(item) ? '从一手收藏夹移除' : '加入一手收藏夹'"
                @click.stop="handleSeenCollection(item)"
              >
                <svg
                  class="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  :fill="isSeenCollected(item) ? 'currentColor' : 'none'"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                  />
                </svg>
              </button>
              <span
                v-if="seenDiscount(item)"
                class="absolute right-1.5 top-1.5 z-10 rounded-md bg-red-500/90 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm"
                :title="`现价 ¥${formatSeenPrice(item.price)}，原价 ¥${formatSeenPrice(item.originalPrice ?? 0)}`"
              >
                {{ seenDiscount(item) }}
              </span>
              <a
                :href="seenDetailPath(item) || undefined"
                :target="seenDetailPath(item) ? '_blank' : undefined"
                rel="noopener noreferrer"
                class="relative block aspect-[3/4] bg-gray-100"
                :class="seenDetailPath(item) ? 'cursor-pointer' : 'cursor-default'"
                :title="formatSeenTitle(item)"
                @click="openSeenDetail($event, item)"
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

              <div class="px-2 py-2">
                <p
                  class="line-clamp-2 min-h-[2rem] text-xs font-medium leading-4 text-gray-800"
                  :title="formatSeenTitle(item)"
                >
                  {{ formatSeenName(item) }}
                </p>
                <StockProductQuickActions
                  show-order
                  :show-price="false"
                  :show-app="isMobileViewport"
                  :order-disabled="!item.productNo || orderingId === item.productId"
                  :order-loading="orderingId === item.productId"
                  @stock="openSeenStockMonitor(item)"
                  @open-app="openSeenApp(item)"
                  @order="orderSeenItem(item)"
                />
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

    <!-- 到货监控弹窗（与收藏夹、详情页同一组件） -->
    <StockMonitorDialog
      v-model:open="showStockMonitorDialog"
      :product="stockMonitorProduct"
    />
  </div>
</template>

<script setup lang="ts">
import { taskEndpoint } from '@/utils/taskApi'
import type { TaskSummary } from '@core/contract'
import type { AutoOrderResult, ProductSkuResult } from '@core'
import type { ApiResponse } from '@/types'
import type { TabSeenProductItem } from '@/composables/useTabSeen'
import type { PriceMonitorProduct } from '~/composables/usePriceMonitor'

definePageMeta({ title: 'Tab 监控任务', keepalive: true })

const router = useRouter()
const { tasks, isLoading, error, busyId, statusFilter, filteredTasks, statusCounts, fetchTasks, remove, restart } =
  useTaskList(taskEndpoint('tab'))
const { fetchSeenProducts } = useTabSeen()
const { isMobileViewport, openYishouProduct } = useYishouApp()
const { danger: confirmDelete, warning: confirmRestart, confirm } = useConfirmDialog()
const toast = useToast()
const { addingNo, addToCollection } = useCollectionAdd()
const { removingNo, removeFromCollection } = useCollectionRemove()

/** 已收藏判断：用抓取时落盘的 collect_id，老记录没有该字段就按未收藏展示 */
const isSeenCollected = (item: TabSeenProductItem): boolean => isCollectedId(item.collectId)

/** 星标忙碌态：加/删共用，避免同一商品两个请求打架 */
const seenCollectionBusy = (item: TabSeenProductItem): boolean =>
  Boolean(item.productNo) && (addingNo.value === item.productNo || removingNo.value === item.productNo)

const showAddDialog = ref(false)

/** 卡片上的已记录商品数（来自统一 stats，不再读任务原始字段） */
const seenCountOf = (task: TaskSummary): number => {
  const stat = task.stats.find(item => item.key === 'seen')
  return Number(stat?.value ?? 0) || 0
}

const handleCreated = async () => {
  showAddDialog.value = false
  await fetchTasks()
}

const handleDelete = async (task: TaskSummary) => {
  const confirmed = await confirmDelete('确定要删除此监控任务吗？删除后无法恢复。')
  if (confirmed) await remove(task)
}

const handleRestart = async (task: TaskSummary) => {
  const confirmed = await confirmRestart('确定要重新发起此监控任务吗？将创建新的监控任务。')
  if (confirmed) await restart(task)
}

/* ---------------- 累计商品弹窗 ---------------- */

const seenDialogOpen = ref(false)
const seenTaskId = ref('')
/** 累计商品排序方式：最近发现（首次发现时间倒序）/ 折扣优先（折数低在前） */
const seenSort = ref<'recent' | 'discount'>('recent')
const seenItems = ref<TabSeenProductItem[]>([])
const seenHasMore = ref(false)
const seenLoading = ref(false)
const seenLoadingMore = ref(false)
/** 列表滚动容器（滚动到底自动加载下一页） */
const seenListRef = ref<HTMLElement | null>(null)
/**
 * 弹窗列表离开时的滚动位置。
 * 从商品详情返回时页面被 keep-alive 恢复，Vue 会把页面 DOM 从隐藏容器移回，
 * 这个过程会把内部滚动容器的 scrollTop 重置为 0。故在滚动时实时记住位置，
 * 返回后用 onActivated 恢复。用普通变量而非 ref，避免无谓触发渲染。
 */
let rememberedSeenScrollTop = 0
/** 正在下单的商品 ID，避免重复点击 */
const orderingId = ref('')

/** 到货监控弹窗 */
const showStockMonitorDialog = ref(false)
const stockMonitorProduct = ref<PriceMonitorProduct | null>(null)

const SEEN_PAGE_SIZE = 50

// 打开累计商品：每次都从第一页重新拉，避免看到过期数据
const openSeenDialog = async (task: TaskSummary) => {
  seenDialogOpen.value = true
  seenTaskId.value = task.id
  seenItems.value = []
  seenHasMore.value = false
  seenLoading.value = true
  // 重新打开弹窗从顶部开始，清掉上一次可能残留的滚动位置
  rememberedSeenScrollTop = 0

  const data = await fetchSeenProducts(task.id, 0, SEEN_PAGE_SIZE, seenSort.value)
  if (data) {
    seenItems.value = data.items
    seenHasMore.value = data.hasMore
  }
  seenLoading.value = false

  // 一页没填满容器时用户看不到滚动条，也就触发不了加载，主动补几页
  await fillSeenList()
}

/** 切换排序：重置到第一页重新拉，排序在服务端全局做完再分页 */
const changeSeenSort = async (sort: 'recent' | 'discount') => {
  if (seenSort.value === sort || !seenTaskId.value) return
  seenSort.value = sort
  seenItems.value = []
  seenHasMore.value = false
  rememberedSeenScrollTop = 0
  if (seenListRef.value) seenListRef.value.scrollTop = 0
  seenLoading.value = true
  try {
    const data = await fetchSeenProducts(seenTaskId.value, 0, SEEN_PAGE_SIZE, seenSort.value)
    if (data) {
      seenItems.value = data.items
      seenHasMore.value = data.hasMore
    }
  } finally {
    seenLoading.value = false
  }
  await fillSeenList()
}

const loadMoreSeen = async () => {
  if (seenLoadingMore.value || !seenHasMore.value) return

  seenLoadingMore.value = true
  try {
    const data = await fetchSeenProducts(
      seenTaskId.value,
      seenItems.value.length,
      SEEN_PAGE_SIZE,
      seenSort.value
    )
    if (data) {
      // 空页说明数据已经到底，避免滚动反复请求同一页
      if (data.items.length === 0) {
        seenHasMore.value = false
        return
      }

      seenItems.value = [...seenItems.value, ...data.items]
      seenHasMore.value = data.hasMore
    }
  } finally {
    seenLoadingMore.value = false
  }
}

const handleSeenScroll = (event: Event) => {
  const el = event.target as HTMLElement | null
  if (!el) return
  // 实时记住位置：进详情前最后一次 scroll 的值，返回时据此恢复
  rememberedSeenScrollTop = el.scrollTop
  if (seenLoadingMore.value || !seenHasMore.value) return

  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
    void loadMoreSeen()
  }
}

// 内容不足一屏时补页（最多补 3 次，避免接口异常时死循环）
const fillSeenList = async (depth = 0): Promise<void> => {
  if (depth >= 3) return

  await nextTick()
  const el = seenListRef.value
  if (!el || !seenHasMore.value) return

  if (el.scrollHeight <= el.clientHeight + 24) {
    await loadMoreSeen()
    await fillSeenList(depth + 1)
  }
}

/**
 * 从商品详情返回到 Tab 监控页时恢复弹窗列表滚动位置。
 * keep-alive 恢复页面会先把 DOM 从隐藏容器移回（此时内部滚动容器 scrollTop 已被浏览器归零），
 * 再触发 onActivated，所以恢复要放在这里而非 onDeactivated。
 * 注意：列表数据（seenItems / seenHasMore）由 keep-alive 保留，返回时不重新拉取，
 * 因此列表高度与离开时一致，设回 scrollTop 才能落在同一屏。
 */
let isFirstActivation = true
onActivated(() => {
  // keepalive 页面切回时补拉任务列表保持新鲜；首次挂载由 onMounted 负责，跳过以免重复。
  // 注意：累计商品弹窗列表（seenItems）由 keep-alive 保留，刻意不在这里重拉，
  // 否则列表高度变化会让下面的滚动位置恢复失效。
  if (isFirstActivation) {
    isFirstActivation = false
  } else {
    fetchTasks()
  }

  // 恢复累计商品弹窗的滚动位置（见上方说明）
  if (!seenDialogOpen.value || rememberedSeenScrollTop <= 0) return
  void nextTick(() => {
    const el = seenListRef.value
    if (el) el.scrollTop = rememberedSeenScrollTop
  })
})

// 折扣：现价 ÷ 原价 × 10，保留一位小数并去掉多余的 .0；没有原价或原价不高于现价时不展示
const seenDiscount = (item: TabSeenProductItem): string => {
  const original = item.originalPrice
  if (!original || original <= 0 || item.price <= 0 || original <= item.price) return ''
  return `${Number(((item.price / original) * 10).toFixed(1))}折`
}

// 图片悬浮提示：完整商品名 + 首次发现时间
const formatSeenTitle = (item: TabSeenProductItem): string => {
  const base = `${item.productName || formatSeenName(item)} · 首次发现 ${formatSeenTime(item.firstSeenAt)}`
  if (!seenDetailPath(item)) return base
  return `${base}（${isMobileViewport.value ? '点击查看本站库存详情，下方「App」图标用一手 App 打开' : '点击在新窗口查看库存详情'}）`
}

// 系统内 SKU 详情页地址：一手外链已不可用，统一跳到本站详情页
// 按 goods_id 跳转，老快照只有 id 也能进详情
const seenDetailPath = (item: TabSeenProductItem): string =>
  item.productId ? `/stock/${encodeURIComponent(item.productId)}` : ''

const openSeenApp = (item: TabSeenProductItem) => {
  openYishouProduct(item.productId, item.productNo, () => {
    const fallback = seenDetailPath(item)
    if (fallback) void router.push(fallback)
  })
}

/** 卡片左上角星标：未收藏则加入、已收藏则移出，都针对当前账号 */
const handleSeenCollection = async (item: TabSeenProductItem) => {
  if (!item.productNo || seenCollectionBusy(item)) return
  if (isSeenCollected(item)) {
    if (item.collectId === 'collected') {
      toast.warning('请刷新页面后再取消收藏')
      return
    }
    const outcome = await removeFromCollection(item.productNo, item.productId, item.collectId)
    // 取消成功后写回条目：collectId 归零，星标熄灭
    if (outcome.ok) {
      item.collectId = '0'
    }
    return
  }
  const outcome = await addToCollection(item.productNo)
  // 收藏结果写回当前条目：拿到真实 collect_id 就用它，重复收藏时用占位值标记已收藏
  if (outcome.ok) {
    item.collectId = outcome.collectId ?? 'collected'
  }
}

/**
 * 点击商品：进本站库存详情。
 * 桌面端交给卡片的 <a> 在新窗口打开；手机端走 SPA 同窗口跳转，
 * 这样返回时列表页能被 Nuxt 的 keep-alive 缓存，状态保留不依赖 bfcache。
 */
const openSeenDetail = (event: MouseEvent, item: TabSeenProductItem) => {
  const path = seenDetailPath(item)
  if (!path) {
    event.preventDefault()
    return
  }
  if (!isMobileViewport.value) return

  event.preventDefault()
  void router.push(path)
}

// 卡片名称：优先用接口算好的「不带店铺名」短名，老数据兜底去掉【店铺名】前缀
const formatSeenName = (item: TabSeenProductItem): string =>
  item.displayName ||
  item.shortName ||
  item.productName?.replace(/^\s*【[^】]*】\s*/, '').trim() ||
  `商品 ${item.productId}`

/* ---------------- 卡片快捷操作：到货监控 / 一键下单 ---------------- */

/** Tab 商品条目 → 监控弹窗需要的商品信息 */
const toMonitorProduct = (item: TabSeenProductItem): PriceMonitorProduct => ({
  productId: item.productId,
  productName: item.productName,
  productImage: item.productImage,
  productNo: item.productNo,
})

/** 到货监控：无货商品正是它的主要场景 */
const openSeenStockMonitor = (item: TabSeenProductItem) => {
  stockMonitorProduct.value = toMonitorProduct(item)
  showStockMonitorDialog.value = true
}

/**
 * 一键下单：所有有货规格各 1 件（最多 5 件），建单后到一手 App 付款
 *
 * 列表里的库存是抓取时的快照（甚至没有库存字段），不能作为下单依据。
 * 因此先按商品 ID 拉一次详情接口：停售 / 下架 / 全规格无货直接提示，
 * 确认有货才弹确认框，避免用户点了确认才被服务端拒绝。
 */
const orderSeenItem = async (item: TabSeenProductItem) => {
  if (!item.productNo) {
    toast.warning('缺少货号，无法下单')
    return
  }
  if (orderingId.value) return

  orderingId.value = item.productId
  try {
    let sku: ProductSkuResult
    try {
      const stockResponse = await $fetch<ApiResponse<ProductSkuResult>>(
        `/api/stock/skus/${item.productId}`
      )
      if (!stockResponse.success || !stockResponse.data) {
        toast.error(stockResponse.error?.message || '库存查询失败，请稍后重试')
        return
      }
      sku = stockResponse.data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '库存查询失败，请稍后重试')
      return
    }

    // 商品级状态：停售 / 下架 / 缺货，即便个别规格还有库存也不允许下单
    if (!sku.inStock) {
      toast.warning(`${sku.stockMessage || '商品当前不可下单'}，暂不可下单`)
      return
    }
    if (sku.inStockSkuCount <= 0) {
      toast.warning('当前没有有货的规格，无法下单')
      return
    }

    const confirmed = await confirm({
      title: '确认下单',
      message: `将为「${formatSeenName(item)}」所有有货规格各下 1 件（最多 5 件，当前 ${sku.inStockSkuCount} 个规格有货）。下单会立即锁定库存，需到一手 App 内完成付款。`,
      type: 'warning',
      confirmText: '确认下单',
      cancelText: '取消',
    })
    if (!confirmed) return

    const response = await $fetch<
      ApiResponse<AutoOrderResult & { renewAction?: 'created' | 'extended' | 'skipped' }>
    >('/api/order/manual', {
      method: 'POST',
      body: { goodsId: item.productId, goodsNo: item.productNo },
    })

    if (response.success && response.data) {
      const order = response.data
      if (order.success) {
        const amountText =
          typeof order.orderAmount === 'number' ? `，应付 ¥${order.orderAmount.toFixed(2)}` : ''
        toast.success(
          `已创建订单 ${order.orderSn ?? ''}（${order.num ?? 0} 件${amountText}），请到一手 App 付款`
        )
      } else {
        toast.error(order.message || '下单失败')
      }
    } else {
      toast.error(response.error?.message || '下单失败')
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '网络请求失败')
  } finally {
    orderingId.value = ''
  }
}

const formatSeenPrice = (price: number): string => (price > 0 ? price.toFixed(2) : '-')

const pad2 = (value: number) => String(value).padStart(2, '0')

const formatSeenTime = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

const formatSeenClock = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

onMounted(fetchTasks)
</script>

<style scoped>
/*
 * 累计商品列表：卡片左右边缘与上方标题行对齐，滚动条落在右侧空白且不压图片。
 * 用负 margin 把容器向两侧各撑 0.5rem，再用等额 padding 把内容拉回原位——
 * 净效果是卡片与标题同宽对齐，同时右侧留出一条滚动条槽（悬浮滚动条 iOS/macOS
 * 默认盖在最右列图片上，这条槽让它落在空白处）。不用 both-edges，否则左侧会
 * 白白多留一条滚动条宽、把内容挤窄，看着比标题缩一圈。
 * overflow 容器上的负 margin 只扩展可滚动区、不改变 padding box 的定位基准。
 */
.seen-list-scroll {
  scrollbar-gutter: stable;
  margin-left: -0.5rem;
  margin-right: -0.5rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}
</style>
