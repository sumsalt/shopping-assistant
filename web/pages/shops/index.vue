<template>
  <div class="max-w-6xl mx-auto">
    <!-- 页面标题 -->
    <div class="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">店铺评分</h1>
        <p class="mt-1 text-sm text-gray-500">
          记录店铺星级与备注，挑店时先看一眼历史评价
        </p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <UiButton
          variant="outline"
          size="sm"
          class="whitespace-nowrap"
          :disabled="isLoading"
          @click="handleRefresh"
        >
          刷新
        </UiButton>
        <UiButton size="sm" class="whitespace-nowrap" @click="openCreate">
          <svg class="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新增店铺
        </UiButton>
      </div>
    </div>

    <!-- 概览 -->
    <div v-if="!error && (isLoading || total > 0)" class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      <div class="bg-white rounded-lg border border-gray-200 px-4 py-3">
        <p class="text-xs text-gray-500">已记录店铺</p>
        <p class="mt-1 text-2xl font-semibold text-gray-900">
          {{ total }}<span class="ml-1 text-sm font-normal text-gray-400">家</span>
        </p>
      </div>
      <div class="bg-white rounded-lg border border-gray-200 px-4 py-3">
        <p class="text-xs text-gray-500">平均星级</p>
        <p class="mt-1 flex items-center gap-1.5 text-2xl font-semibold text-gray-900">
          {{ averageRating.toFixed(1) }}
          <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </p>
      </div>
      <div class="bg-white rounded-lg border border-gray-200 px-4 py-3">
        <p class="text-xs text-gray-500">五星店铺</p>
        <p class="mt-1 text-2xl font-semibold text-gray-900">
          {{ ratingCounts['5'] ?? 0 }}<span class="ml-1 text-sm font-normal text-gray-400">家</span>
        </p>
      </div>
      <div class="bg-white rounded-lg border border-gray-200 px-4 py-3">
        <p class="text-xs text-gray-500">待观察（2 星及以下）</p>
        <p class="mt-1 text-2xl font-semibold text-gray-900">
          {{ lowRatedCount }}<span class="ml-1 text-sm font-normal text-gray-400">家</span>
        </p>
      </div>
    </div>

    <!-- 搜索与筛选 -->
    <div v-if="!error && (isLoading || total > 0)" class="bg-white rounded-lg border border-gray-200 p-4 mb-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="flex-1 min-w-0">
          <UiInput
            v-model="searchKeyword"
            size="sm"
            placeholder="搜索店铺名、备注或链接"
            clearable
            aria-label="搜索店铺"
          >
            <template #prefix>
              <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </template>
          </UiInput>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <label class="text-xs text-gray-500 whitespace-nowrap" for="shop-sort">排序</label>
          <select
            id="shop-sort"
            v-model="sortBy"
            class="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="updated">最近更新</option>
            <option value="rating-desc">星级从高到低</option>
            <option value="rating-asc">星级从低到高</option>
            <option value="name">店铺名称</option>
          </select>
        </div>
      </div>

      <!-- 星级筛选 -->
      <div class="flex flex-wrap items-center gap-2 mt-3">
        <button
          v-for="option in ratingOptions"
          :key="option.value"
          type="button"
          class="px-3 py-1 text-xs font-medium rounded-full border transition-colors"
          :class="ratingFilter === option.value
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'"
          @click="ratingFilter = option.value"
        >
          {{ option.label }}
          <span :class="ratingFilter === option.value ? 'text-blue-100' : 'text-gray-400'">
            {{ option.count }}
          </span>
        </button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading && shops.length === 0" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div v-for="i in 3" :key="i" class="bg-white rounded-lg border border-gray-200 p-5">
        <UiSkeleton variant="text" width="140" height="20" class="mb-3" />
        <UiSkeleton variant="text" width="100" height="14" class="mb-4" />
        <UiSkeleton variant="text" width="220" height="14" class="mb-2" />
        <UiSkeleton variant="text" width="180" height="14" />
      </div>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="error && shops.length === 0" class="bg-white rounded-lg border border-red-200 p-8">
      <UiEmptyState
        type="error"
        title="加载失败"
        :description="error"
        action-text="重新加载"
        action-variant="outline"
        @action="handleRefresh"
      />
    </div>

    <!-- 完全没有记录 -->
    <div v-else-if="total === 0" class="bg-white rounded-lg border border-gray-200">
      <UiEmptyState
        type="empty"
        title="还没有记录任何店铺"
        description="把常买的店铺记下来，标上星级和备注，下次挑店时一眼就能看出哪家靠谱。"
        action-text="添加第一家店铺"
        @action="openCreate"
      />
    </div>

    <!-- 筛选后无结果 -->
    <div v-else-if="filteredShops.length === 0" class="bg-white rounded-lg border border-gray-200">
      <UiEmptyState
        type="search"
        title="没有匹配的店铺"
        description="换个关键词，或者把星级筛选切回「全部」再看看。"
        action-text="清空筛选"
        action-variant="outline"
        @action="clearFilters"
      />
    </div>

    <!-- 店铺列表 -->
    <div v-else>
      <p class="mb-3 text-xs text-gray-500">
        共 {{ filteredShops.length }} 家{{ filteredShops.length !== total ? `（全部 ${total} 家）` : '' }}
      </p>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="shop in filteredShops"
          :key="shop.id"
          class="bg-white rounded-lg border border-gray-200 p-5 flex flex-col hover:shadow-md transition-shadow"
        >
          <!-- 名称 + 评级标签 -->
          <div class="flex items-start justify-between gap-3">
            <h3 class="min-w-0 flex-1 text-base font-semibold text-gray-900 break-words">
              {{ shop.name }}
            </h3>
            <span
              class="flex-shrink-0 text-xs px-2 py-0.5 rounded-full border"
              :class="getRatingMeta(shop.rating).className"
            >
              {{ getRatingMeta(shop.rating).label }}
            </span>
          </div>

          <!-- 星级 -->
          <div class="flex items-center gap-0.5 mt-2">
            <svg
              v-for="n in 5"
              :key="n"
              class="w-4 h-4"
              :class="n <= shop.rating ? 'text-amber-400' : 'text-gray-200'"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span class="ml-1.5 text-xs font-medium text-gray-500">{{ shop.rating }}.0</span>
          </div>

          <!-- 备注 -->
          <p
            v-if="shop.note"
            class="mt-3 text-sm text-gray-600 whitespace-pre-line break-words line-clamp-4"
          >
            {{ shop.note }}
          </p>
          <p v-else class="mt-3 text-sm text-gray-400">暂无备注</p>

          <!-- 链接 -->
          <a
            v-if="shop.url"
            :href="shop.url"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline truncate"
          >
            <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5m8.828-2.828a4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5" />
            </svg>
            <span class="truncate">{{ displayUrl(shop.url) }}</span>
          </a>

          <!-- 底部操作 -->
          <div class="mt-auto pt-4">
            <div class="flex items-center justify-between border-t border-gray-100 pt-3">
              <span class="text-xs text-gray-400">更新于 {{ formatShopTime(shop.updatedAt) }}</span>
              <div class="flex items-center gap-1">
                <UiButton variant="ghost" size="xs" @click="openEdit(shop)">
                  编辑
                </UiButton>
                <UiButton
                  variant="ghost"
                  size="xs"
                  class="text-red-600 hover:text-red-700 hover:bg-red-50"
                  @click="handleDelete(shop)"
                >
                  删除
                </UiButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增 / 编辑对话框 -->
    <UiDialog
      v-model:open="showDialog"
      :title="editingId ? '编辑店铺' : '新增店铺'"
      size="md"
    >
      <form id="shopForm" class="space-y-5" @submit.prevent="handleSubmit">
        <UiInput
          v-model="form.name"
          label="店铺名称"
          required
          placeholder="例如：优衣库官方旗舰店"
          hint="同一个店铺只记一条，方便对比"
        />

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">
            星级 <span class="text-red-500">*</span>
          </label>
          <div class="flex items-center gap-1">
            <button
              v-for="n in 5"
              :key="n"
              type="button"
              class="p-1 rounded transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500"
              :aria-label="`${n} 星`"
              @click="form.rating = n"
              @mouseenter="hoverRating = n"
              @mouseleave="hoverRating = 0"
            >
              <svg
                class="w-8 h-8 transition-colors"
                :class="n <= (hoverRating || form.rating) ? 'text-amber-400' : 'text-gray-200'"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
            <span class="ml-2 text-sm font-medium text-gray-600">
              {{ getRatingMeta(hoverRating || form.rating).label }}
            </span>
          </div>
        </div>

        <UiTextarea
          v-model="form.note"
          label="备注"
          :rows="4"
          :max-length="2000"
          show-count
          placeholder="发货速度、商品质量、包装、退换货体验……"
          hint="支持换行，最多 2000 字"
        />

        <UiInput
          v-model="form.url"
          label="店铺链接（可选）"
          placeholder="店铺首页地址，可省略 https://"
        />

        <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>
      </form>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UiButton variant="outline" :disabled="isSubmitting" @click="showDialog = false">
            取消
          </UiButton>
          <UiButton type="submit" form="shopForm" :loading="isSubmitting">
            {{ editingId ? '保存修改' : '添加店铺' }}
          </UiButton>
        </div>
      </template>
    </UiDialog>
  </div>
</template>

<script setup lang="ts">
// 页面元信息
definePageMeta({
  title: '店铺评分',
})

const {
  shops,
  total,
  averageRating,
  ratingCounts,
  isLoading,
  isSubmitting,
  error,
  fetchShops,
  createShop,
  updateShop,
  deleteShop,
} = useShops()

const { confirm: confirmDialog } = useConfirmDialog()

/** 搜索关键词 */
const searchKeyword = ref('')
/** 星级筛选：0 表示全部 */
const ratingFilter = ref(0)
/** 排序方式 */
const sortBy = ref<'updated' | 'rating-desc' | 'rating-asc' | 'name'>('updated')

/** 筛选条选项 */
const ratingOptions = computed(() => [
  { value: 0, label: '全部', count: total.value },
  ...[5, 4, 3, 2, 1].map(rating => ({
    value: rating,
    label: `${rating} 星`,
    count: ratingCounts.value[String(rating)] ?? 0,
  })),
])

/** 2 星及以下数量 */
const lowRatedCount = computed(
  () => (ratingCounts.value['1'] ?? 0) + (ratingCounts.value['2'] ?? 0)
)

/** 星级对应的文案与配色 */
const RATING_META: Record<number, { label: string; className: string }> = {
  5: { label: '强烈推荐', className: 'bg-rose-50 text-rose-600 border-rose-100' },
  4: { label: '值得回购', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  3: { label: '一般', className: 'bg-slate-50 text-slate-600 border-slate-200' },
  2: { label: '谨慎下单', className: 'bg-orange-50 text-orange-600 border-orange-100' },
  1: { label: '避雷', className: 'bg-gray-100 text-gray-600 border-gray-200' },
}

/** 取星级文案 */
const getRatingMeta = (rating: number) =>
  RATING_META[rating] ?? { label: '未评级', className: 'bg-gray-100 text-gray-600 border-gray-200' }

/** 筛选 + 排序后的列表 */
const filteredShops = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()

  const list = shops.value.filter(shop => {
    if (ratingFilter.value && shop.rating !== ratingFilter.value) {
      return false
    }
    if (!keyword) {
      return true
    }
    return [shop.name, shop.note, shop.url].some(field =>
      (field || '').toLowerCase().includes(keyword)
    )
  })

  const byUpdated = (a: typeof list[number], b: typeof list[number]) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()

  return [...list].sort((a, b) => {
    if (sortBy.value === 'rating-desc') {
      return b.rating - a.rating || byUpdated(a, b)
    }
    if (sortBy.value === 'rating-asc') {
      return a.rating - b.rating || byUpdated(a, b)
    }
    if (sortBy.value === 'name') {
      return a.name.localeCompare(b.name, 'zh-Hans-CN')
    }
    return byUpdated(a, b)
  })
})

/** 链接展示：去掉协议与末尾斜杠 */
const displayUrl = (url: string): string =>
  url.replace(/^https?:\/\//i, '').replace(/\/+$/, '')

/** 刷新 */
const handleRefresh = () => {
  fetchShops()
}

/** 清空筛选条件 */
const clearFilters = () => {
  searchKeyword.value = ''
  ratingFilter.value = 0
}

// 对话框状态
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formError = ref('')
const hoverRating = ref(0)
const form = ref({
  name: '',
  rating: 5,
  note: '',
  url: '',
})

/** 打开新增 */
const openCreate = () => {
  editingId.value = null
  formError.value = ''
  hoverRating.value = 0
  form.value = { name: '', rating: 5, note: '', url: '' }
  showDialog.value = true
}

/** 打开编辑 */
const openEdit = (shop: { id: string; name: string; rating: number; note: string; url: string }) => {
  editingId.value = shop.id
  formError.value = ''
  hoverRating.value = 0
  form.value = {
    name: shop.name,
    rating: shop.rating,
    note: shop.note,
    url: shop.url,
  }
  showDialog.value = true
}

/** 提交表单 */
const handleSubmit = async () => {
  const name = form.value.name.trim()
  if (!name) {
    formError.value = '请填写店铺名称'
    return
  }

  formError.value = ''
  const payload = {
    name,
    rating: form.value.rating,
    note: form.value.note.trim(),
    url: form.value.url.trim(),
  }

  const result = editingId.value
    ? await updateShop(editingId.value, payload)
    : await createShop(payload)

  if (result.success) {
    showDialog.value = false
  } else {
    formError.value = result.error || '保存失败'
  }
}

/** 删除店铺 */
const handleDelete = async (shop: { id: string; name: string }) => {
  const confirmed = await confirmDialog({
    title: '删除店铺记录',
    message: `确定删除「${shop.name}」吗？删除后无法恢复。`,
    confirmText: '删除',
    type: 'danger',
  })

  if (confirmed) {
    await deleteShop(shop.id)
  }
}

onMounted(() => {
  fetchShops()
})
</script>
