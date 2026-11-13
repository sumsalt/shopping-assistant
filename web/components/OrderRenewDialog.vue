<template>
  <UiDialog :open="open" title="订单续期任务" @update:open="handleOpenChange">
    <div class="space-y-5">
      <!-- 功能说明 -->
      <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
        每分钟扫描一次该账号下的待支付订单，仅对
        <strong>支付有效期不足 5 分钟</strong> 的订单执行一次「重新提交支付」，
        把有效期刷新回 20 分钟。不会新建订单、不会扣款，付款仍需人工完成。
      </div>

      <!-- 账号选择 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">账号</label>
        <UiSelect
          v-model="accountId"
          :options="accountOptions"
          :placeholder="isLoadingAccounts ? '加载账号中…' : '请选择账号'"
          :disabled="isLoading || isLoadingAccounts"
        />
        <p v-if="isLoadingAccounts" class="mt-1 text-xs text-gray-500">正在加载账号列表…</p>
        <p v-else-if="availableAccounts.length === 0" class="mt-1 text-xs text-amber-600">
          还没有带登录态的账号，请先到
          <NuxtLink to="/accounts" class="underline font-medium">账号管理</NuxtLink>
          保存抓包快照。
        </p>
        <p v-else class="mt-1 text-xs text-gray-500">
          每个账号只能有一个续期任务；已有运行中的任务时会提示，不会重复创建。
        </p>
      </div>

      <!-- 无登录态账号提示 -->
      <div
        v-if="!isLoadingAccounts && noCredentialAccounts.length > 0"
        class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800"
      >
        以下账号缺少登录态（uid/token），无法续期：
        {{ noCredentialAccounts.map(accountDisplayName).join('、') }}
      </div>

      <!-- 持续时长 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">任务持续时长</label>
        <UiSelect v-model="duration" :options="DURATION_OPTIONS" :disabled="isLoading" />
        <p class="mt-1 text-xs text-gray-500">到期后任务自动结束；到货 / 价格监控自动下单会自动创建一个 12 小时的续期任务。</p>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3">
        <UiButton variant="secondary" :disabled="isLoading" @click="handleClose">
          取消
        </UiButton>
        <UiButton :disabled="isLoading || !accountId" :loading="isLoading" @click="handleSubmit">
          创建任务
        </UiButton>
      </div>
    </template>
  </UiDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { accountDisplayName } from '@/utils/accountName'
import { useAccounts } from '@/composables/useAccounts'
import { useTaskSubmit } from '@/composables/useTaskSubmit'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [taskId: string]
}>()

const DEFAULT_DURATION = 43200 // 12 小时，与自动创建一致

/** 任务持续时长选项（秒） */
const DURATION_OPTIONS = [
  { value: 3600, label: '1 小时' },
  { value: 7200, label: '2 小时' },
  { value: 10800, label: '3 小时' },
  { value: 21600, label: '6 小时' },
  { value: DEFAULT_DURATION, label: '12 小时' },
  { value: 86400, label: '24 小时' },
  { value: 172800, label: '48 小时' },
  { value: 259200, label: '72 小时' },
]

const { accounts, isLoading: isLoadingAccounts, fetchAccounts } = useAccounts()
const { isLoading, submit } = useTaskSubmit()

const accountId = ref('')
const duration = ref(DEFAULT_DURATION)

/** 只有具备登录态的账号才能续期 */
const availableAccounts = computed(() => accounts.value.filter(a => a.hasCredential))
const noCredentialAccounts = computed(() => accounts.value.filter(a => !a.hasCredential))

const accountOptions = computed(() =>
  availableAccounts.value.map(item => ({
    value: item.id,
    label: `${accountDisplayName(item)}${item.uin ? ' · ' + item.uin : ''}`,
  }))
)

const handleClose = () => emit('update:open', false)
const handleOpenChange = (value: boolean) => emit('update:open', value)

const handleSubmit = async () => {
  if (!accountId.value) return
  const data = await submit<{ taskId: string }>(
    '/api/order-renew/create',
    { accountId: accountId.value, config: { duration: duration.value } },
    { successMessage: '订单续期任务已启动' }
  )
  if (data?.taskId) {
    emit('created', data.taskId)
    handleClose()
  }
}

// 每次打开时拉最新账号列表并重置
watch(
  () => props.open,
  open => {
    if (open) {
      accountId.value = ''
      duration.value = DEFAULT_DURATION
      fetchAccounts()
    }
  }
)
</script>
