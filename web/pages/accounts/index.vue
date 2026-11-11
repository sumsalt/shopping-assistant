<template>
  <div class="max-w-6xl mx-auto">
    <!-- 页面标题 -->
    <LayoutPageHeader
      title="账号管理"
      description="保存一手账号及其抓包请求信息，支持小程序 / App 抓包，可设为当前使用账号"
    >
      <template #actions>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="isLoading"
          @click="handleRefresh"
        >
          刷新
        </UiButton>
        <UiButton size="sm"  @click="openCreate">
          <svg class="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新增账号
        </UiButton>
      </template>
    </LayoutPageHeader>

    <!-- 当前账号提示 -->
    <div
      v-if="mounted && activeAccount.id"
      class="mb-5 flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm"
    >
      <span class="text-blue-800">
        当前使用：<strong class="font-mono">{{ activeAccount.phone }}</strong>
        <span v-if="activeAccount.channel" class="ml-1 text-blue-600">
          （{{ activeAccount.channel === 'app' ? 'App' : '小程序' }}）
        </span>
      </span>
      <NuxtLink to="/settings" class="sm:ml-auto text-xs text-blue-600 hover:text-blue-700 shrink-0">
        去系统配置更换 →
      </NuxtLink>
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
      description="新增账号时可粘贴一条一手抓包请求，自动识别公共参数与登录态"
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
        class="bg-white rounded-lg border p-4 sm:p-5 flex flex-col"
        :class="isActive(item) ? 'border-blue-300 ring-1 ring-blue-100' : 'border-gray-200'"
      >
        <!-- 头部：手机号 + 备注 + 标签 -->
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="w-8 h-8 flex items-center justify-center rounded-full bg-blue-50 text-blue-600 shrink-0">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </span>
            <p class="text-lg font-semibold text-gray-900 font-mono truncate">{{ item.phone }}</p>
            <span v-if="isActive(item)" class="inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white shrink-0">
              当前使用
            </span>
            <span
              v-if="item.requestChannel"
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0"
              :class="item.requestChannel === 'app' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'"
            >
              {{ item.requestChannel === 'app' ? 'App 抓包' : '小程序抓包' }}
            </span>
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
              <button v-if="item.hasPassword" type="button" class="shrink-0 text-xs text-blue-600 hover:text-blue-700" @click="toggleReveal(item, 'password')">
                {{ isRevealed(item, 'password') ? '隐藏' : '显示' }}
              </button>
              <button v-if="item.hasPassword" type="button" class="shrink-0 text-xs text-gray-400 hover:text-gray-600" @click="handleCopy(item, 'password')">
                复制
              </button>
            </dd>
          </div>

          <!-- uin -->
          <div class="flex items-center gap-2">
            <dt class="w-14 shrink-0 text-xs text-gray-500">uin</dt>
            <dd class="flex-1 min-w-0 flex items-center gap-2">
              <span class="font-mono text-gray-900 truncate">{{ item.uin || '未填写' }}</span>
              <button v-if="item.uin" type="button" class="shrink-0 text-xs text-gray-400 hover:text-gray-600" @click="copyValue(item.uin)">
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
              <button v-if="item.hasToken" type="button" class="shrink-0 text-xs text-blue-600 hover:text-blue-700" @click="toggleReveal(item, 'token')">
                {{ isRevealed(item, 'token') ? '隐藏' : '显示' }}
              </button>
              <button v-if="item.hasToken" type="button" class="shrink-0 text-xs text-gray-400 hover:text-gray-600" @click="handleCopy(item, 'token')">
                复制
              </button>
            </dd>
          </div>
        </dl>

        <!-- 请求信息：默认折叠 -->
        <div class="mt-3 border-t border-gray-100 pt-3">
          <button
            type="button"
            class="w-full flex items-center justify-between gap-2 text-left text-xs text-gray-600 hover:text-gray-900"
            @click="toggleProfile(item.id)"
          >
            <span class="flex items-center gap-1.5 min-w-0">
              <svg class="w-3.5 h-3.5 shrink-0 transition-transform" :class="isProfileExpanded(item.id) ? 'rotate-90' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
              <span class="truncate">
                请求信息
                <span v-if="item.hasRequestProfile" class="text-gray-400">
                  · {{ item.requestParamCount }} 个公共参数
                </span>
                <span v-else class="text-gray-400">· 未保存抓包</span>
              </span>
            </span>
            <span class="shrink-0 text-gray-400">{{ isProfileExpanded(item.id) ? '收起' : '展开' }}</span>
          </button>

          <div v-if="isProfileExpanded(item.id)" class="mt-2 rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-3">
            <p v-if="!item.hasRequestProfile" class="text-xs text-gray-500">
              还没有保存抓包请求。编辑账号时粘贴一条一手请求即可自动识别填入。
            </p>
            <template v-else>
              <p v-if="item.requestPath" class="text-[11px] text-gray-500 break-all">
                请求路径：<span class="font-mono">{{ item.requestPath }}</span>
              </p>

              <div v-for="group in paramGroupsOf(item)" :key="group.label">
                <p class="text-[11px] font-medium text-gray-500 mb-1">{{ group.label }}</p>
                <div class="grid grid-cols-1 gap-x-3 gap-y-0.5">
                  <div v-for="entry in group.entries" :key="entry.key" class="flex items-start gap-2 text-[11px] min-w-0">
                    <span class="w-28 shrink-0 text-gray-400 font-mono truncate">{{ entry.key }}</span>
                    <span class="font-mono text-gray-700 break-all min-w-0">{{ entry.value || '（空）' }}</span>
                  </div>
                </div>
              </div>

              <div v-if="headerEntriesOf(item).length > 0">
                <p class="text-[11px] font-medium text-gray-500 mb-1">请求头</p>
                <div class="space-y-0.5">
                  <div v-for="[key, value] in headerEntriesOf(item)" :key="key" class="flex items-start gap-2 text-[11px] min-w-0">
                    <span class="w-28 shrink-0 text-gray-400 font-mono truncate">{{ key }}</span>
                    <span class="font-mono text-gray-700 break-all min-w-0">{{ value }}</span>
                  </div>
                </div>
              </div>

              <p class="text-[11px] text-gray-400">token 已打码；业务参数与 t_t / sign 不保存，发请求时自动生成</p>
            </template>
          </div>
        </div>

        <!-- 登录态自检结果 -->
        <div
          v-if="verifyResults[item.id]"
          class="mt-3 flex items-start gap-1.5 text-xs"
          :class="verifyResults[item.id].ok ? 'text-emerald-600' : 'text-red-600'"
        >
          <span class="shrink-0">{{ verifyResults[item.id].ok ? '✓' : '!' }}</span>
          <span class="min-w-0 break-all">{{ verifyResults[item.id].message }}</span>
        </div>

        <!-- 底部 -->
        <div class="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs text-gray-400">更新于 {{ formatAccountTime(item.updatedAt) }}</span>
          <div class="flex items-center gap-1 flex-wrap">
            <UiButton
              variant="ghost"
              size="sm"
              :loading="verifyingId === item.id"
              :disabled="!item.hasRequestProfile"
              :title="item.hasRequestProfile ? '' : '请先粘贴抓包保存请求信息'"
              @click="handleVerify(item)"
            >
              {{ verifyingId === item.id ? '校验中…' : '校验登录态' }}
            </UiButton>
            <UiButton
              v-if="!isActive(item)"
              variant="ghost"
              size="sm"
              :disabled="switchingAccountId === item.id"
              @click="handleSetActive(item)"
            >
              {{ switchingAccountId === item.id ? '设置中…' : '设为当前账号' }}
            </UiButton>
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
        <UiInput v-model="form.phone" label="手机号" placeholder="请输入手机号" required autocomplete="off" />
        <UiInput
          v-model="form.password"
          label="密码"
          :type="showFormPassword ? 'text' : 'password'"
          :placeholder="editingId ? '留空则不修改' : '请输入密码'"
          autocomplete="new-password"
        >
          <template #suffix>
            <button type="button" class="text-xs text-gray-400 hover:text-gray-600" @click="showFormPassword = !showFormPassword">
              {{ showFormPassword ? '隐藏' : '显示' }}
            </button>
          </template>
        </UiInput>
        <UiInput v-model="form.uin" label="uin" placeholder="一手账号的 uid（粘贴抓包可自动填）" autocomplete="off" />
        <UiInput v-model="form.token" label="token" :placeholder="editingId ? '留空则不修改' : '一手 token（粘贴抓包可自动填）'" autocomplete="off" />
        <UiTextarea v-model="form.remark" label="备注" placeholder="例如：主号 / 备用 / 绑定哪个微信" :rows="2" :max-length="500" />

        <!-- 粘贴抓包自动识别 -->
        <div class="border-t border-gray-100 pt-4">
          <div class="flex items-center justify-between gap-2 mb-1">
            <p class="text-xs font-medium text-gray-700">粘贴抓包请求（自动识别）</p>
            <span v-if="profileStateText" class="text-[11px]" :class="profileStateClass">{{ profileStateText }}</span>
          </div>
          <p class="text-[11px] text-gray-400 mb-2">
            支持完整 HTTP 请求或一行 form 参数；小程序与 App 抓包都可以。识别后只保存公共参数，业务参数与 t_t / sign 会自动忽略。
          </p>
          <UiTextarea
            v-model="captureRaw"
            placeholder="POST /goods/get_goods_info_v2 HTTP/1.1&#10;User-Agent: okhttp/3.14.9&#10;Content-Type: application/x-www-form-urlencoded&#10;&#10;uid=xxx&token=xxx&udid=xxx&model=..."
            :rows="5"
          />
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <UiButton size="sm" variant="outline" :disabled="!captureRaw.trim()" @click="handleParseCapture">
              识别并填入
            </UiButton>
            <UiButton v-if="canClearProfile" size="sm" variant="ghost" class="text-red-600 hover:text-red-700" @click="clearProfile">
              清除抓包信息
            </UiButton>
          </div>

          <p v-if="captureError" class="mt-2 text-xs text-red-600">{{ captureError }}</p>
          <div v-if="captureInfo" class="mt-2 rounded-lg bg-green-50 border border-green-200 p-2.5 text-xs text-green-800 space-y-1">
            <p class="font-medium">
              识别成功：{{ captureInfo.channel === 'app' ? 'App' : '小程序' }} 通道 · {{ captureInfo.matched }} 个公共参数
            </p>
            <p v-if="captureInfo.filled.length" class="text-green-700">已自动填入：{{ captureInfo.filled.join('、') }}</p>
            <p v-if="captureInfo.ignored" class="text-green-700 text-[11px] break-all">
              已忽略业务参数：{{ captureInfo.ignored }}
            </p>
            <p v-for="(warning, index) in captureInfo.warnings" :key="index" class="text-amber-700 text-[11px]">
              ⚠ {{ warning }}
            </p>
          </div>
        </div>

        <!-- 账号标签 -->
        <div class="border-t border-gray-100 pt-4">
          <p class="text-xs font-medium text-gray-500 mb-2">账号标签</p>
          <div class="flex flex-wrap gap-2">
            <div class="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
              <span class="text-xs text-gray-700 whitespace-nowrap" title="已完成实名或资质认证">是否认证</span>
              <UiSwitch :model-value="form.isVerified" @update:model-value="(v) => (form.isVerified = toBoolean(v))" />
            </div>
            <div class="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
              <span class="text-xs text-gray-700 whitespace-nowrap" title="尚未下过首单的新号">是否新用户</span>
              <UiSwitch :model-value="form.isNewUser" @update:model-value="(v) => (form.isNewUser = toBoolean(v))" />
            </div>
            <div class="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
              <span class="text-xs text-gray-700 whitespace-nowrap" title="已用该账号成功下过单">是否下单</span>
              <UiSwitch :model-value="form.hasOrdered" @update:model-value="(v) => (form.hasOrdered = toBoolean(v))" />
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
import type {
  AccountItem,
  AccountVerifyResult,
  RevealField,
  AccountPayload,
} from '@/composables/useAccounts'
import type { RequestProfile } from '@/types'
import {
  parseYishouCapture,
  PROFILE_PARAM_GROUPS,
} from '@/utils/yishou-capture'

definePageMeta({
  title: '账号管理',
})

const {
  accounts,
  total,
  isLoading,
  isSubmitting,
  verifyingId,
  error,
  fetchAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  revealField,
  verifyAccount,
} = useAccounts()

const configStore = useConfigStore()
const { confirm: confirmDialog } = useConfirmDialog()
const toast = useToast()

// 当前账号来自服务端；mounted 守卫避免 SSR 首屏与水合结果不一致
const mounted = ref(false)
onMounted(async () => {
  await configStore.load()
  mounted.value = true
})

const EMPTY_ACTIVE_ACCOUNT = {
  id: '',
  phone: '',
  uin: '',
  channel: null,
  hasCredential: false,
  hasRequestProfile: false,
  requestParamCount: 0,
}

const activeAccount = computed(() => configStore.activeAccount ?? EMPTY_ACTIVE_ACCOUNT)
const isActive = (item: AccountItem): boolean => mounted.value && activeAccount.value.id === item.id

/** 请求信息折叠状态，默认全部收起 */
const expandedProfiles = reactive<Record<string, boolean>>({})
const isProfileExpanded = (id: string): boolean => Boolean(expandedProfiles[id])
const toggleProfile = (id: string) => {
  expandedProfiles[id] = !expandedProfiles[id]
}

/** 登录态自检结果（按账号 id 存，仅本地展示） */
const verifyResults = reactive<Record<string, AccountVerifyResult>>({})

const handleVerify = async (item: AccountItem) => {
  const result = await verifyAccount(item.id)
  if (result) {
    verifyResults[item.id] = result
    if (result.ok) {
      toast.success(result.message)
    } else {
      toast.error(result.message)
    }
  }
}

/** 按分组整理列表里的（已脱敏）公共参数 */
const paramGroupsOf = (item: AccountItem) => {
  const params = item.requestParams || {}
  const keys = Object.keys(params)
  return PROFILE_PARAM_GROUPS.map(group => ({
    label: group.label,
    entries: group.keys
      .map(key => {
        const actual = keys.find(name => name.toLowerCase() === key.toLowerCase())
        return actual ? { key: actual, value: params[actual] } : null
      })
      .filter((entry): entry is { key: string; value: string } => entry !== null),
  })).filter(group => group.entries.length > 0)
}

const headerEntriesOf = (item: AccountItem): Array<[string, string]> =>
  Object.entries(item.requestHeaders || {})

/** 搜索关键词：手机号 / uin / 备注 */
const searchKeyword = ref('')

/**
 * 筛选维度：三个账号标签 + 凭据是否填写。
 * 每个维度三态循环：不限 → 只看「是」 → 只看「否」，多个维度同时生效（取交集）。
 */
type FilterKey = 'isVerified' | 'isNewUser' | 'hasOrdered' | 'hasPassword' | 'hasToken' | 'hasRequestProfile'
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
  { key: 'hasRequestProfile', label: '有抓包', negativeLabel: '无抓包' },
]

const FILTER_CYCLE: FilterState[] = ['any', 'yes', 'no']
const filterStates = reactive<Record<FilterKey, FilterState>>({
  isVerified: 'any',
  isNewUser: 'any',
  hasOrdered: 'any',
  hasPassword: 'any',
  hasToken: 'any',
  hasRequestProfile: 'any',
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

/** 兼容旧版 UiSwitch 回传的 '1' / '0'（现在统一回传布尔） */
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

/** 设为当前账号：只提交 id，快照留在服务端 */
const switchingAccountId = ref('')
const handleSetActive = async (item: AccountItem) => {
  switchingAccountId.value = item.id
  try {
    const ok = await configStore.setActiveAccount(item.id)
    if (!ok) {
      toast.error('切换当前账号失败')
      return
    }
    await fetchAccounts()

    if (!item.hasRequestProfile) {
      toast.warning('该账号还没有抓包信息，请求仍走默认匿名参数')
    } else if (!item.hasCredential) {
      toast.warning('该账号的抓包缺少 uid/token，只能用于库存查询与 Tab 监控')
    } else {
      toast.success(`已切换为「${item.phone}」`)
    }
  } finally {
    switchingAccountId.value = ''
  }
}

// 对话框状态
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formError = ref('')
const showFormPassword = ref(false)

interface AccountForm {
  phone: string
  password: string
  uin: string
  token: string
  remark: string
  isVerified: boolean
  isNewUser: boolean
  hasOrdered: boolean
  /** undefined：不修改；null：清除；对象：替换 */
  requestProfile?: RequestProfile | null
}

const form = ref<AccountForm>({
  phone: '',
  password: '',
  uin: '',
  token: '',
  remark: '',
  isVerified: false,
  isNewUser: false,
  hasOrdered: false,
})

/** 编辑时账号已保存的抓包摘要（列表接口只给脱敏摘要） */
const existingProfile = ref<{ channel: string; paramCount: number } | null>(null)

const captureRaw = ref('')
const captureError = ref('')
const captureInfo = ref<{
  channel: 'wx' | 'app'
  matched: number
  ignored: string
  warnings: string[]
  filled: string[]
} | null>(null)

/** 抓包状态文字 */
const profileStateText = computed(() => {
  if (form.value.requestProfile === null) {
    return '本次将清除抓包信息'
  }
  if (form.value.requestProfile) {
    return `本次识别：${form.value.requestProfile.channel === 'app' ? 'App' : '小程序'} · ${Object.keys(form.value.requestProfile.params).length} 个参数`
  }
  if (existingProfile.value) {
    const channel = existingProfile.value.channel === 'app' ? 'App' : '小程序'
    return `已保存：${channel} · ${existingProfile.value.paramCount} 个参数`
  }
  return ''
})

const profileStateClass = computed(() => {
  if (form.value.requestProfile === null) {
    return 'text-red-600'
  }
  return form.value.requestProfile ? 'text-green-700' : 'text-gray-400'
})

const canClearProfile = computed(
  () => form.value.requestProfile !== undefined || Boolean(existingProfile.value)
)

const resetForm = () => {
  formError.value = ''
  showFormPassword.value = false
  captureRaw.value = ''
  captureError.value = ''
  captureInfo.value = null
  existingProfile.value = null
  form.value = {
    phone: '',
    password: '',
    uin: '',
    token: '',
    remark: '',
    isVerified: false,
    isNewUser: false,
    hasOrdered: false,
    requestProfile: undefined,
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
  // 密码 / token 不回填：留空即保持原值；抓包快照同样保持原值，除非本次重新识别或清除
  form.value = {
    phone: item.phone,
    password: '',
    uin: item.uin,
    token: '',
    remark: item.remark,
    isVerified: item.isVerified,
    isNewUser: item.isNewUser,
    hasOrdered: item.hasOrdered,
    requestProfile: undefined,
  }
  existingProfile.value = item.hasRequestProfile
    ? { channel: item.requestChannel || 'wx', paramCount: item.requestParamCount }
    : null
  showDialog.value = true
}

/** 粘贴抓包 → 解析 → 回填主字段与完整快照 */
const handleParseCapture = () => {
  captureError.value = ''
  captureInfo.value = null

  const result = parseYishouCapture(captureRaw.value)
  if (!result.ok || !result.profile) {
    captureError.value = result.error || '识别失败'
    return
  }

  const filled: string[] = []
  // 为空才回填，避免覆盖用户手动填的内容
  if (!form.value.uin.trim() && result.uid) {
    form.value.uin = result.uid
    filled.push('uin')
  }
  if (!form.value.token.trim() && result.token) {
    form.value.token = result.token
    filled.push('token')
  }

  form.value.requestProfile = result.profile
  captureInfo.value = {
    channel: result.profile.channel,
    matched: result.matched,
    ignored: result.ignored.length ? result.ignored.join('、') : '',
    warnings: result.warnings,
    filled,
  }
  toast.success(`已识别 ${result.matched} 个公共参数`)
}

const clearProfile = () => {
  form.value.requestProfile = null
  captureInfo.value = null
  captureError.value = ''
}

const handleSubmit = async () => {
  const phone = form.value.phone.trim()
  if (!phone) {
    formError.value = '请填写手机号'
    return
  }

  formError.value = ''
  const payload: AccountPayload = {
    phone,
    password: form.value.password,
    uin: form.value.uin.trim(),
    token: form.value.token.trim(),
    remark: form.value.remark.trim(),
    isVerified: form.value.isVerified,
    isNewUser: form.value.isNewUser,
    hasOrdered: form.value.hasOrdered,
  }
  // 不传该字段表示保持原值；传 null 才清空
  if (form.value.requestProfile !== undefined) {
    payload.requestProfile = form.value.requestProfile
  }

  const result = editingId.value
    ? await updateAccount(editingId.value, payload)
    : await createAccount(payload)

  if (result.success) {
    showDialog.value = false
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

  const result = await deleteAccount(item.id)
  if (result.success) {
    delete revealedValues[revealKey(item.id, 'password')]
    delete revealedValues[revealKey(item.id, 'token')]
    delete verifyResults[item.id]
    // 如果删的是当前账号，回到匿名模式
    if (isActive(item)) {
      await configStore.clearActiveAccount()
    }
  }
}

onMounted(() => {
  fetchAccounts()
})
</script>
