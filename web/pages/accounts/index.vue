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

    <!-- 搜索 -->
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
      <p v-if="searchKeyword" class="mt-2 text-xs text-gray-500">
        匹配到 {{ filteredAccounts.length }} 个账号
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

    <!-- 搜索无结果 -->
    <div v-else-if="filteredAccounts.length === 0" class="bg-white rounded-lg border border-gray-200 p-10 text-center">
      <p class="text-sm text-gray-500">没有匹配「{{ searchKeyword }}」的账号</p>
      <UiButton variant="outline" size="sm" class="mt-3" @click="searchKeyword = ''">清空搜索</UiButton>
    </div>

    <!-- 账号卡片 -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div
        v-for="item in filteredAccounts"
        :key="item.id"
        class="bg-white rounded-lg border border-gray-200 p-4 sm:p-5 flex flex-col"
      >
        <!-- 头部：手机号 + 备注 -->
        <div class="flex items-start justify-between gap-3">
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
          </div>
          <span
            v-if="item.hasToken"
            class="shrink-0 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
          >
            有 token
          </span>
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

/** 搜索过滤 */
const filteredAccounts = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return accounts.value
  }
  return accounts.value.filter(item =>
    [item.phone, item.uin, item.remark].some(field => (field || '').toLowerCase().includes(keyword))
  )
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
})

const resetForm = () => {
  formError.value = ''
  showFormPassword.value = false
  form.value = { phone: '', password: '', uin: '', token: '', remark: '' }
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
