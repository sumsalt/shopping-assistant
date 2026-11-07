<template>
  <div class="max-w-4xl mx-auto">
    <!-- 页面标题 -->
    <div class="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">店铺黑名单</h1>
        <p class="mt-1 text-sm text-gray-500">
          黑名单店铺的商品不再出现在 Tab 监控里，也不会写进提醒邮件
        </p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <UiButton
          variant="outline"
          size="sm"
          class="whitespace-nowrap"
          :disabled="isLoading"
          @click="fetchBlacklist"
        >
          刷新
        </UiButton>
        <UiButton size="sm" class="whitespace-nowrap" @click="openCreate">
          <svg class="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          加入黑名单
        </UiButton>
      </div>
    </div>

    <!-- 说明 -->
    <div class="mb-5 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
      黑名单按「供应商标识」过滤：一手商品列表只返回 supply_id，没有店铺名。
      在 Tab 监控的「累计商品」里点「拉黑店铺」会自动带上供应商标识，无需手填。
    </div>

    <!-- 搜索 -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <UiInput
        v-model="searchKeyword"
        size="sm"
        placeholder="搜索名称、供应商标识、市场或备注"
        clearable
        aria-label="搜索黑名单"
      >
        <template #prefix>
          <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </template>
      </UiInput>
    </div>

    <!-- 加载中 -->
    <div v-if="isLoading && items.length === 0" class="bg-white rounded-lg border border-gray-200 p-8">
      <UiSkeleton variant="text" width="180" height="20" class="mb-3" />
      <UiSkeleton variant="text" width="260" height="14" class="mb-2" />
      <UiSkeleton variant="text" width="220" height="14" />
    </div>

    <!-- 加载失败 -->
    <div v-else-if="error && items.length === 0" class="bg-white rounded-lg border border-red-200">
      <UiEmptyState
        type="error"
        title="加载失败"
        :description="error"
        action-text="重新加载"
        action-variant="outline"
        @action="fetchBlacklist"
      />
    </div>

    <!-- 空状态 -->
    <div v-else-if="items.length === 0" class="bg-white rounded-lg border border-gray-200">
      <UiEmptyState
        type="empty"
        title="黑名单是空的"
        description="遇到不想再看的店铺，可以在累计商品里点「拉黑店铺」，也可以在这里手动添加供应商标识。"
        action-text="手动添加"
        @action="openCreate"
      />
    </div>

    <!-- 搜索无结果 -->
    <div v-else-if="filteredItems.length === 0" class="bg-white rounded-lg border border-gray-200">
      <UiEmptyState
        type="search"
        title="没有匹配的店铺"
        description="换个关键词试试"
        action-text="清空搜索"
        action-variant="outline"
        @action="searchKeyword = ''"
      />
    </div>

    <!-- 黑名单列表 -->
    <div v-else class="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
      <div
        v-for="item in filteredItems"
        :key="item.id"
        class="flex items-start justify-between gap-4 px-4 py-3.5"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-medium text-gray-900 break-words">
              {{ blacklistDisplayName(item) }}
            </p>
            <span
              v-if="item.name"
              class="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-500"
            >
              ID {{ item.supplyId }}
            </span>
          </div>
          <p class="mt-1 text-xs text-gray-500">
            <span v-if="item.marketName">{{ item.marketName }} · </span>
            {{ formatShopTime(item.createdAt) }} 加入
          </p>
          <p v-if="item.note" class="mt-1 text-xs text-gray-600 break-words">{{ item.note }}</p>
        </div>
        <UiButton
          variant="ghost"
          size="xs"
          class="shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          @click="handleRemove(item)"
        >
          移出
        </UiButton>
      </div>
    </div>

    <!-- 新增对话框 -->
    <UiDialog v-model:open="showDialog" title="加入店铺黑名单" size="md">
      <form id="blacklistForm" class="space-y-4" @submit.prevent="handleSubmit">
        <UiInput
          v-model="form.supplyId"
          label="供应商标识"
          required
          placeholder="例如：32972"
          hint="一手商品的 supply_id，可在累计商品的店铺信息里看到"
        />
        <UiInput
          v-model="form.name"
          label="店铺名称"
          placeholder="选填，方便自己认"
          hint="不填就显示为「供应商 + 标识」"
        />
        <UiInput v-model="form.marketName" label="市场" placeholder="选填，例如：濮院市场" />
        <UiTextarea
          v-model="form.note"
          label="备注"
          :rows="3"
          :max-length="200"
          show-count
          placeholder="选填，例如：质量差、发货慢"
        />

        <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>
      </form>

      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <UiButton variant="outline" size="sm" :disabled="isSubmitting" @click="showDialog = false">
            取消
          </UiButton>
          <UiButton
            type="submit"
            form="blacklistForm"
            size="sm"
            :loading="isSubmitting"
            :disabled="isSubmitting"
          >
            加入黑名单
          </UiButton>
        </div>
      </template>
    </UiDialog>
  </div>
</template>

<script setup lang="ts">
import type { ShopBlacklistItem } from '@/composables/useShopBlacklist'
import { blacklistDisplayName } from '@/composables/useShopBlacklist'
import { formatShopTime } from '@/composables/useShops'

definePageMeta({
  title: '店铺黑名单',
})

const { items, isLoading, isSubmitting, error, fetchBlacklist, addBlacklist, removeBlacklist } =
  useShopBlacklist()

const { confirm: confirmDialog } = useConfirmDialog()

const searchKeyword = ref('')
const showDialog = ref(false)
const formError = ref('')
const form = ref({
  supplyId: '',
  name: '',
  marketName: '',
  note: '',
})

/** 搜索过滤 */
const filteredItems = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return items.value
  }

  return items.value.filter(item =>
    [item.name, item.supplyId, item.marketName, item.note].some(field =>
      (field || '').toLowerCase().includes(keyword)
    )
  )
})

/** 打开新增 */
const openCreate = () => {
  formError.value = ''
  form.value = { supplyId: '', name: '', marketName: '', note: '' }
  showDialog.value = true
}

/** 提交 */
const handleSubmit = async () => {
  const supplyId = form.value.supplyId.trim()
  if (!supplyId) {
    formError.value = '请填写供应商标识'
    return
  }
  if (!/^[0-9A-Za-z_-]+$/.test(supplyId)) {
    formError.value = '供应商标识只能是数字、字母、下划线或短横线'
    return
  }

  formError.value = ''
  const result = await addBlacklist({
    supplyId,
    name: form.value.name.trim(),
    marketName: form.value.marketName.trim(),
    note: form.value.note.trim(),
  })

  if (result.success) {
    showDialog.value = false
  } else {
    formError.value = result.error || '保存失败'
  }
}

/** 移出黑名单 */
const handleRemove = async (item: ShopBlacklistItem) => {
  const confirmed = await confirmDialog({
    title: '移出黑名单',
    message: `确定把「${blacklistDisplayName(item)}」移出黑名单吗？移出后该店铺的商品会重新被抓取。`,
    confirmText: '移出',
    type: 'warning',
  })

  if (confirmed) {
    await removeBlacklist(item.id)
  }
}

onMounted(() => {
  fetchBlacklist()
})
</script>
