<template>
  <LayoutPageHeader :title="title" :description="description">
    <template #actions>
      <!-- 状态筛选：下拉形式，与刷新等操作按钮同一行 -->
      <UiSelect
        v-if="total > 0"
        v-model="statusFilterModel"
        :options="filterOptions"
        size="sm"
        :block="false"
        aria-label="按状态筛选任务"
      />
      <!-- 账号筛选：按任务绑定的账号过滤，选项由列表数据聚合 -->
      <UiSelect
        v-if="accountOptions.length > 1"
        v-model="accountFilterModel"
        :options="accountFilterOptions"
        size="sm"
        :block="false"
        aria-label="按账号筛选任务"
      />
      <UiButton variant="outline" size="sm" :disabled="isLoading" @click="emit('refresh')">
        <svg class="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        刷新
      </UiButton>
      <slot name="actions" />
    </template>
  </LayoutPageHeader>
</template>

<script setup lang="ts">
/**
 * 任务列表页统一头部：标题 + 状态筛选下拉 + 统一刷新按钮
 *
 * 四个任务列表页（到货 / 价格 / Tab / 续期）共用，保证按钮样式与筛选交互一致。
 * 各页特有的操作按钮（新增监控 / 新建任务）通过 actions 插槽追加。
 */
import {
  TASK_STATUS_VALUES,
  type TaskStatusCounts,
  type TaskStatusFilter,
  type TaskAccountFilter,
  type TaskAccountOption,
} from '@core/utils/task-filter'
import { getStatusText } from '@/utils/taskFormat'

const props = defineProps<{
  title: string
  description?: string
  isLoading: boolean
  /** 任务总数（未筛选） */
  total: number
  counts: TaskStatusCounts
  modelValue: TaskStatusFilter
  /** 账号筛选项（由列表数据聚合） */
  accountOptions: TaskAccountOption[]
  accountFilter: TaskAccountFilter
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TaskStatusFilter]
  'update:accountFilter': [value: TaskAccountFilter]
  refresh: []
}>()

const options = computed(() => [
  { value: 'all' as TaskStatusFilter, label: '全部', count: props.counts.all },
  ...TASK_STATUS_VALUES.map(value => ({
    value: value as TaskStatusFilter,
    label: getStatusText(value),
    count: props.counts[value],
  })),
])

/** 下拉选项：数量直接拼进文案，避免额外的角标样式 */
const filterOptions = computed(() =>
  options.value.map(option => ({
    value: option.value,
    label: `${option.label}（${option.count}）`,
  }))
)

const statusFilterModel = computed({
  get: () => props.modelValue,
  set: (value: string | number) => emit('update:modelValue', value as TaskStatusFilter),
})

/** 账号下拉：前置"全部账号"，其余选项把数量拼进文案 */
const accountFilterOptions = computed(() => [
  { value: 'all' as TaskAccountFilter, label: `全部账号（${props.total}）` },
  ...props.accountOptions.map(option => ({
    value: option.value,
    label: `${option.label}（${option.count}）`,
  })),
])

const accountFilterModel = computed({
  get: () => props.accountFilter,
  set: (value: string | number) => emit('update:accountFilter', String(value) as TaskAccountFilter),
})
</script>
