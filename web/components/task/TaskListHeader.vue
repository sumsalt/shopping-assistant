<template>
  <div>
    <LayoutPageHeader :title="title" :description="description">
      <template #actions>
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

    <!-- 状态筛选条：只有存在任务时才显示 -->
    <div v-if="total > 0" class="mb-4 flex flex-wrap items-center gap-2">
      <span class="shrink-0 text-xs text-gray-400">状态筛选</span>
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap"
        :class="modelValue === option.value
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'"
        @click="emit('update:modelValue', option.value)"
      >
        {{ option.label }}
        <span :class="modelValue === option.value ? 'text-blue-100' : 'text-gray-400'">
          {{ option.count }}
        </span>
      </button>
      <span v-if="modelValue !== 'all'" class="ml-auto text-xs text-gray-500">
        显示 {{ counts[modelValue] }} / {{ total }} 个任务
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 任务列表页统一头部：标题 + 统一刷新按钮 + 状态筛选条
 *
 * 四个任务列表页（到货 / 价格 / Tab / 续期）共用，保证按钮样式与筛选交互一致。
 * 各页特有的操作按钮（新增监控 / 新建任务）通过 actions 插槽追加。
 */
import { TASK_STATUS_VALUES, type TaskStatusCounts, type TaskStatusFilter } from '@core/utils/task-filter'
import { getStatusText } from '@/utils/taskFormat'

const props = defineProps<{
  title: string
  description?: string
  isLoading: boolean
  /** 任务总数（未筛选） */
  total: number
  counts: TaskStatusCounts
  modelValue: TaskStatusFilter
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TaskStatusFilter]
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
</script>
