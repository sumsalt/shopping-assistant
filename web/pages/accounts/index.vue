<template>
  <div class="max-w-6xl mx-auto">
    <!-- 页面标题 -->
    <div class="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">账号管理</h1>
        <p class="mt-1 text-sm text-gray-500">
          保存一手账号的手机号、密码、uin、token，方便随时取用
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
          新增账号
        </UiButton>
      </div>
    </div>

    <!-- 搜索与筛选 -->
    <div v-if="!error && (isLoading || total > 0)" class="bg-white rounded-lg border border-gray-200 p-4 mb-5">
      <UiInput
        v-model="searchKeyword"
        size="sm"
        placeholder="搜索手机号、uin 或备注"
        clearable
        aria-label="搜索账号"
      >
        <template #prefix>
          <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </template>
      </UiInput>

      <!-- 三态筛选：不限 → 只看「是」 → 只看「否」 → 不限，多个条件取交集 -->
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <span class="shrink-0 text-xs text-gray-400">筛选</span>
        <button
          v-for="option in filterOptions"
          :key="option.key"
          type="button"
          :title="filterHint(option)"
          class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
          :class="filterChipClass(filterStates[option.key])"
          @click="cycleFilter(option.key)"
        >
          {{ filterLabel(option) }}
        </button>
        <button
          v-if="hasActiveFilters"
          type="button"
          class="ml-auto text-xs text-gray-400 hover:text-gray-600"
          @click="clearFilters"
        >
          清空筛选
        </button>
      </div>
      <p v-if="hasActiveFilters" class="mt-2 text-xs text-gray-500">
        匹配到 {{ filteredAccounts.length }} / {{ total }} 个账号
      </p>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading && accounts.length === 0" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div v-for="i in 2" :key="i" class="bg-white rounded-lg border border-gray-200 p-5">
        <UiSkeleton variant="text" width="160" height="22" class="mb-4" />
        <UiSkeleton variant="text" width="100%" height="16" class="mb-2" />
        <UiSkeleton variant="text" width="80%" height="16" class="mb-2" />
        <UiSkeleton variant="text" width="60%" height="16" />
      </div>
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
      <p class="text-sm text-red-700">{{ error }}</p>
      <UiButton variant="outline" size="sm" class="mt-3" @click="handleRefresh">重试</UiButton>
    </div>

    <!-- 空状态 -->
    <UiEmptyState
      v-else-if="accounts.length === 0"
      title="还没有保存账号"
      description="把常用的一手账号存进来，手机号、密码、uin、token 都能随时查看和复制"
      action-text="新增账号"
      @action="openCreate"
    />

    <!-- 搜索 / 筛选无结果 -->
    <div v-else-if="filteredAccounts.length === 0" class="bg-white rounded-lg border border-gray-200 p-10 text-center">
      <p class="text-sm text-gray-500">
        {{ searchKeyword ? '没有匹配「' + searchKeyword + '」的账号' : '没有符合当前筛选条件的账号' }}
      </p>
      <UiButton variant="outline" size="sm" class="mt-3" @click="clearFilters">清空筛选</UiButton>
    </div>

    <!-- 账号卡片 -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div
        v-for="item in filteredAccounts"
        :key="item.id"
        class="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 flex flex-col"
      >
        <!-- 头部：手机号 + 备注 + 标签 -->
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="w-8 h-8 flex items-center justify-center rounded-full bg-blue-50 text-blue-600 shrink-0">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </span>
            <p class="text-lg font-semibold text-gray-900 font-mono truncate">{{ item.phone }}</p>
          </div>
          <p v-if="item.remark" class="mt-2 text-xs text-gray-500 break-all">{{ item.remark }}</p>
          <p v-else class="mt-2 text-xs text-gray-300">未填写备注</p>

          <div v-if="hasAnyTag(item)" class="mt-2.5 flex flex-wrap gap-1.5">
            <span v-if="item.isVerified" class="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
              已认证
            </span>
            <span v-if="item.isNewUser" class="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              新用户
            </span>
            <span v-if="item.hasOrdered" class="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              已下单
            </span>
            <span v-if="item.hasToken" class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              有 token
            </span>
            <span v-if="item.hasPassword" class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              有密码
            </span>
          </div>
        </div>

        <!-- 字段 -->
        <dl class="mt-4 space-y-2 text-sm">
          <!-- 密码 -->
          <div class="flex items-center gap-2">
            <dt class="w-14 shrink-0 text-xs text-gray-500">密码</dt>
            <dd class="flex-1 min-w-0 flex items-center gap-2">
              <span class="font-mono text-gray-900 truncate">
                {{ item.hasPassword ? displayed(item, 'password') : '未填写' }}
              </span>
              <button
                v-if="item.hasPassword"
                type="button"
                class="shrink-0 text-xs text-blue-600 hover:text-blue-700"
                @click="toggleReveal(item, 'password')"
              >
                {{ isRevealed(item, 'password') ? '隐藏' : '显示' }}
              </button>
              <button
                v-if="item.hasPassword"
                type="button"
                class="shrink-0 text-xs text-gray-400 hover:text-gray-600"
                @click="handleCopy(item, 'password')"
              >
                复制
              </button>
            </dd>
          </div>

          <!-- uin -->
          <div class="flex items-center gap-2">
            <dt class="w-14 shrink-0 text-xs text-gray-500">uin</dt>
            <dd class="flex-1 min-w-0 flex items-center gap-2">
              <span class="font-mono text-gray-900 truncate">{{ item.uin || '未填写' }}</span>
              <button
                v-if="item.uin"
                type="button"
                class="shrink-0 text-xs text-gray-400 hover:text-gray-600"
                @click="copyValue(item.uin)"
              >
                复制
              </button>
            </dd>
          </div>

          <!-- token -->
          <div class="flex items-center gap-2">
            <dt class="w-14 shrink-0 text-xs text-gray-500">token</dt>
            <dd class="flex-1 min-w-0 flex items-center gap-2">
              <span class="font-mono text-gray-900 truncate">
                {{ item.hasToken ? displayed(item, 'token') : '未填写' }}
              </span>
              <button
                v-if="item.hasToken"
                type="button"
                class="shrink-0 text-xs text-blue-600 hover:text-blue-700"
                @click="toggleReveal(item, 'token')"
              >
                {{ isRevealed(item, 'token') ? '隐藏' : '显示' }}
              </button>
              <button
                v-if="item.hasToken"
                type="button"
                class="shrink-0 text-xs text-gray-400 hover:text-gray-600"
                @click="handleCopy(item, 'token')"
              >
                复制
              </button>
            </dd>
          </div>
        </dl>

        <!-- 底部 -->
        <div class="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
          <span class="text-xs text-gray-400">更新于 {{ formatAccountTime(item.updatedAt) }}</span>
          <div class="flex items-center gap-1">
            <UiButton variant="ghost" size="sm" @click="openEdit(item)">编辑</UiButton>
            <UiButton variant="ghost" size="sm" class="text-red-600 hover:text-red-700" @click="handleDelete(item)">
              删除
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增 / 编辑对话框 -->
    <UiDialog v-model:open="showDialog" :title="editingId ? '编辑账号' : '新增账号'" size="md">
      <div class="space-y-4">
        <UiInput
          v-model="form.phone"
          label="手机号"
          placeholder="请输入手机号"
          required
          autocomplete="off"
        />

        <UiInput
          v-model="form.password"
          label="密码"
          :type="showFormPassword ? 'text' : 'password'"
          :placeholder="editingId ? '留空则不修改' : '请输入密码'"
          autocomplete="new-password"
        >
          <template #suffix>
            <button
              type="button"
              class="text-xs text-gray-400 hover:text-gray-600"
              @click="showFormPassword = !showFormPassword"
            >
              {{ showFormPassword ? '隐藏' : '显示' }}
            </button>
          </template>
        </UiInput>

        <UiInput
          v-model="form.uin"
          label="uin"
          placeholder="一手账号的 uid"
          autocomplete="off"
        />

        <UiInput
          v-model="form.token"
          label="token"
          :placeholder="editingId ? '留空则不修改' : '一手 token'"
          autocomplete="off"
        />

        <UiTextarea
          v-model="form.remark"
          label="备注"
          placeholder="例如：主号 / 备用 / 绑定哪个微信"
          :rows="3"
          :max-length="500"
        />

        <!-- 账号标签：手动标记的布尔属性，用于列表筛选（紧凑排列，避免对话框过高） -->
        <div class="border-t border-gray-100 pt-4">
          <p class="text-xs font-medium text-gray-500 mb-2">账号标签</p>
          <div class="flex flex-wrap gap-2">
            <div class="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
              <span class="text-xs text-gray-700 whitespace-nowrap" title="已完成实名或资质认证">是否认证</span>
              <UiSwitch
                :model-value="form.isVerified"
                @update:model-value="(v) => (form.isVerified = toBoolean(v))"
              />
            </div>
            <div class="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
              <span class="text-xs text-gray-700 whitespace-nowrap" title="尚未下过首单的新号">是否新用户</span>
              <UiSwitch
                :model-value="form.isNewUser"
                @update:model-value="(v) => (form.isNewUser = toBoolean(v))"
              />
            </div>
            <div class="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
              <span class="text-xs text-gray-700 whitespace-nowrap" title="已用该账号成功下过单">是否下单</span>
              <UiSwitch
                :model-value="form.hasOrdered"
                @update:model-value="(v) => (form.hasOrdered = toBoolean(v))"
              />
            </div>
          </div>
          <p class="mt-2 text-xs text-gray-400">标记账号状态，可在列表上方按标签筛选</p>
        </div>

        <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <template #footer>
        <div class="flex gap-2 w-full">
          <UiButton variant="outline" class="flex-1" :disabled="isSubmitting" @click="showDialog = false">
            取消
          </UiButton>
          <UiButton class="flex-1" :loading="isSubmitting" @click="handleSubmit">
            {{ editingId ? '保存' : '添加' }}
          </UiButton>
        </div>
      </template>
    </UiDialog>
  </div>
</template>

<script setup lang="ts">
import type { AccountItem, RevealField } from '@/composables/useAccounts'

definePageMeta({
  title: '账号管理',
})

const {
  accounts,
  total,
  isLoading,
  isSubmitting,
  error,
  fetchAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  revealField,
} = useAccounts()

const { confirm: confirmDialog } = useConfirmDialog()

const toast = useToast()

/** 搜索关键词：手机号 / uin / 备注 */
const searchKeyword = ref('')

/**
 * 筛选维度：三个账号标签 + 凭据是否填写。
 * 每个维度三态循环：不限 → 只看「是」 → 只看「否」，多个维度同时生效（取交集）。
 */
type FilterKey = 'isVerified' | 'isNewUser' | 'hasOrdered' | 'hasPassword' | 'hasToken'
type FilterState = 'any' | 'yes' | 'no'

interface FilterOption {
  key: FilterKey
  label: string
  negativeLabel: string
}

const filterOptions: FilterOption[] = [
  { key: 'isVerified', label: '已认证', negativeLabel: '未认证' },
  { key: 'isNewUser', label: '新用户', negativeLabel: '非新用户' },
  { key: 'hasOrdered', label: '已下单', negativeLabel: '未下单' },
  { key: 'hasPassword', label: '有密码', negativeLabel: '无密码' },
  { key: 'hasToken', label: '有 token', negativeLabel: '无 token' },
]

const FILTER_CYCLE: FilterState[] = ['any', 'yes', 'no']
const filterStates = reactive<Record<FilterKey, FilterState>>({
  isVerified: 'any',
  isNewUser: 'any',
  hasOrdered: 'any',
  hasPassword: 'any',
  hasToken: 'any',
})

const cycleFilter = (key: FilterKey) => {
  const next = FILTER_CYCLE[(FILTER_CYCLE.indexOf(filterStates[key]) + 1) % FILTER_CYCLE.length]
  filterStates[key] = next
}

const filterLabel = (option: FilterOption): string => {
  const state = filterStates[option.key]
  if (state === 'yes') {
    return `✓ ${option.label}`
  }
  if (state === 'no') {
    return `✗ ${option.negativeLabel}`
  }
  return option.label
}

const filterChipClass = (state: FilterState): string => {
  if (state === 'yes') {
    return 'border-blue-300 bg-blue-50 text-blue-700'
  }
  if (state === 'no') {
    return 'border-amber-300 bg-amber-50 text-amber-700'
  }
  return 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
}

const filterHint = (option: FilterOption): string =>
  `${option.label}：点击依次切换「不限 → 只看是 → 只看否」`

const hasAnyTag = (item: AccountItem): boolean =>
  item.isVerified || item.isNewUser || item.hasOrdered || item.hasToken || item.hasPassword

/** UiSwitch 回传的是 '1' / '0'，统一转成布尔再落到表单 */
const toBoolean = (value: boolean | '1' | '0'): boolean => value === true || value === '1'

const hasActiveFilters = computed(
  () =>
    Boolean(searchKeyword.value.trim()) ||
    filterOptions.some(option => filterStates[option.key] !== 'any')
)

const clearFilters = () => {
  searchKeyword.value = ''
  for (const option of filterOptions) {
    filterStates[option.key] = 'any'
  }
}

/** 已读取的明文，key 为 `${id}:${field}` */
const revealedValues = reactive<Record<string, string>>({})

const revealKey = (id: string, field: RevealField) => `${id}:${field}`

const isRevealed = (item: AccountItem, field: RevealField): boolean =>
  revealKey(item.id, field) in revealedValues

/** 展示值：已显示用明文，否则用列表接口给的掩码 */
const displayed = (item: AccountItem, field: RevealField): string => {
  const key = revealKey(item.id, field)
  if (key in revealedValues) {
    return revealedValues[key] || '（空）'
  }
  return field === 'password' ? item.passwordMask : item.tokenMask
}

/** 取明文（没读过就先读一次） */
const resolvePlain = async (item: AccountItem, field: RevealField): Promise<string | null> => {
  const key = revealKey(item.id, field)
  if (key in revealedValues) {
    return revealedValues[key]
  }
  const value = await revealField(item.id, field)
  if (value === null) {
    return null
  }
  revealedValues[key] = value
  return value
}

/** 显示 / 隐藏切换 */
const toggleReveal = async (item: AccountItem, field: RevealField) => {
  const key = revealKey(item.id, field)
  if (key in revealedValues) {
    delete revealedValues[key]
    return
  }
  await resolvePlain(item, field)
}

/**
 * 复制到剪贴板
 *
 * 线上是 http，navigator.clipboard 不可用（非安全上下文），退回 execCommand。
 */
const copyValue = async (value: string) => {
  if (!value) {
    return
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value)
      toast.success('已复制')
      return
    }
  } catch {
    // 继续走兜底方案
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    const copied = document.execCommand('copy')
    if (copied) {
      toast.success('已复制')
    } else {
      toast.error('复制失败，请手动选择')
    }
  } catch {
    toast.error('复制失败，请手动选择')
  } finally {
    document.body.removeChild(textarea)
  }
}

/** 复制凭据（需要明文时先读取） */
const handleCopy = async (item: AccountItem, field: RevealField) => {
  const value = await resolvePlain(item, field)
  if (value) {
    await copyValue(value)
  }
}

/** 搜索 + 标签筛选 */
const filteredAccounts = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  return accounts.value.filter(item => {
    if (
      keyword &&
      ![item.phone, item.uin, item.remark].some(field =>
        (field || '').toLowerCase().includes(keyword)
      )
    ) {
      return false
    }

    return filterOptions.every(option => {
      const state = filterStates[option.key]
      if (state === 'any') {
        return true
      }
      const matched = Boolean(item[option.key])
      return state === 'yes' ? matched : !matched
    })
  })
})

const handleRefresh = () => {
  fetchAccounts()
}

// 对话框状态
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formError = ref('')
const showFormPassword = ref(false)
const form = ref({
  phone: '',
  password: '',
  uin: '',
  token: '',
  remark: '',
  isVerified: false,
  isNewUser: false,
  hasOrdered: false,
})

const resetForm = () => {
  formError.value = ''
  showFormPassword.value = false
  form.value = {
    phone: '',
    password: '',
    uin: '',
    token: '',
    remark: '',
    isVerified: false,
    isNewUser: false,
    hasOrdered: false,
  }
}

const openCreate = () => {
  editingId.value = null
  resetForm()
  showDialog.value = true
}

const openEdit = (item: AccountItem) => {
  editingId.value = item.id
  resetForm()
  // 密码 / token 不回填：留空即保持原值
  form.value = {
    phone: item.phone,
    password: '',
    uin: item.uin,
    token: '',
    remark: item.remark,
    isVerified: item.isVerified,
    isNewUser: item.isNewUser,
    hasOrdered: item.hasOrdered,
  }
  showDialog.value = true
}

const handleSubmit = async () => {
  const phone = form.value.phone.trim()
  if (!phone) {
    formError.value = '请填写手机号'
    return
  }

  formError.value = ''
  const payload = {
    phone,
    password: form.value.password,
    uin: form.value.uin.trim(),
    token: form.value.token.trim(),
    remark: form.value.remark.trim(),
    isVerified: form.value.isVerified,
    isNewUser: form.value.isNewUser,
    hasOrdered: form.value.hasOrdered,
  }

  const result = editingId.value
    ? await updateAccount(editingId.value, payload)
    : await createAccount(payload)

  if (result.success) {
    showDialog.value = false
    // 编辑后列表可能重新排序，已读的明文缓存按 id 保留即可
  } else {
    formError.value = result.error || '保存失败'
  }
}

const handleDelete = async (item: AccountItem) => {
  const confirmed = await confirmDialog({
    title: '删除账号',
    message: `确定删除「${item.phone}」吗？删除后无法恢复。`,
    confirmText: '删除',
    type: 'danger',
  })

  if (!confirmed) {
    return
  }

  await deleteAccount(item.id)
  delete revealedValues[revealKey(item.id, 'password')]
  delete revealedValues[revealKey(item.id, 'token')]
}

onMounted(() => {
  fetchAccounts()
})
</script>
