<template>
  <div
    :class="[
      'bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow',
      href ? 'cursor-pointer hover:border-blue-300 transition-colors' : '',
    ]"
    :title="href ? '点击卡片查看商品详情' : undefined"
    :tabindex="href ? 0 : undefined"
    :aria-label="href ? `查看商品详情：${task.target.name}` : undefined"
    @click="handleCardClick"
    @keydown.enter="handleCardActivate"
  >
    <div class="p-4 sm:p-6">
      <!-- 状态 + 目标 + 时间 -->
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div class="flex items-center gap-3 min-w-0">
          <UiBadge :variant="statusVariant">
            {{ getStatusText(task.status) }}
          </UiBadge>
          <span class="text-xs text-gray-400">{{ kindLabel }}</span>
          <span class="text-xs text-gray-400">·</span>
          <span class="text-xs text-gray-500">{{ formatTime(task.createdAt) }}</span>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span
            v-for="badge in task.badges"
            :key="badge.text"
            :class="['px-2.5 py-1 rounded-lg border', badgeClass(badge.tone)]"
          >
            {{ badge.text }}
          </span>
        </div>
      </div>

      <!-- 目标 -->
      <TaskTarget :target="task.target" />

      <!-- 指标 -->
      <div class="flex flex-wrap items-center gap-2 mt-3 text-sm">
        <div
          v-for="stat in task.stats"
          :key="stat.key"
          :class="['flex items-center gap-1.5 px-3 py-1.5 rounded-lg border', statClass(stat.tone)]"
        >
          <span class="font-medium">{{ stat.value }}</span>
          <span class="opacity-80">{{ stat.label }}</span>
        </div>
        <div
          v-for="chip in configChips"
          :key="chip"
          class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 text-gray-600"
        >
          {{ chip }}
        </div>
      </div>

      <!-- 错误 -->
      <div v-if="task.lastError" class="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
        {{ task.lastError }}
      </div>

      <!-- 提示（等待规格 / 到价无货 / 下单失败） -->
      <div
        v-if="task.notice"
        :class="['mt-3 p-3 rounded-lg border text-sm', noticeClass]"
      >
        <p class="font-medium">{{ task.notice.title }}</p>
        <p v-if="task.notice.detail" class="mt-1 text-xs opacity-90">{{ task.notice.detail }}</p>
      </div>

      <!-- 订单 -->
      <div v-if="task.order" class="mt-3 p-3 rounded-lg bg-green-50 border border-green-100 text-sm text-green-800">
        <p class="font-medium">✓ 已自动创建订单</p>
        <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span>订单号：<strong class="tabular-nums">{{ task.order.orderSn }}</strong></span>
          <span v-if="task.order.amount !== undefined">金额：{{ formatAmount(task.order.amount) }}</span>
          <span v-if="task.order.items?.length">
            规格：{{ task.order.items.map(item => `${item.skuLabel} × ${item.num}`).join('、') }}
          </span>
          <span v-else-if="task.order.skuLabel">
            规格：{{ task.order.skuLabel }}<template v-if="task.order.num"> × {{ task.order.num }}</template>
          </span>
          <span v-if="task.order.expireAt">付款截止：{{ formatExpire(task.order.expireAt) }}</span>
        </div>
        <p class="mt-2 text-xs text-green-700">
          订单已锁库存但尚未付款，请到一手 App「我的 → 待付款」完成支付，超时会自动关闭。
        </p>
      </div>

      <!-- 最近事件 -->
      <div v-if="task.events.length" class="mt-4 pt-4 border-t border-gray-100">
        <p class="text-sm font-medium text-gray-700 mb-2">最近记录</p>
        <TaskEventList :events="task.events" />
      </div>

      <!-- 操作 -->
      <div class="flex items-center gap-2 pt-4 mt-4 border-t border-gray-100">
        <UiButton
          variant="outline"
          size="sm"
          class="text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300"
          :disabled="busy"
          @click="emit('restart', task)"
        >
          重新发起
        </UiButton>
        <UiButton
          variant="outline"
          size="sm"
          class="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
          :disabled="busy"
          @click="emit('delete', task)"
        >
          删除
        </UiButton>
        <slot name="actions" :task="task" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskKind, TaskSummary, Tone } from '@core/contract'
import {
  formatAmount,
  formatDuration,
  formatExpire,
  formatTime,
  getStatusColor,
  getStatusText,
} from '@/utils/taskFormat'

const props = defineProps<{
  task: TaskSummary
  busy?: boolean
}>()

const emit = defineEmits<{
  restart: [task: TaskSummary]
  delete: [task: TaskSummary]
}>()

const KIND_LABEL: Record<TaskKind, string> = {
  stock: '到货监控',
  price: '价格监控',
  tab: 'Tab 监控',
  renew: '订单续期',
}

const kindLabel = computed(() => KIND_LABEL[props.task.kind])

const statusVariant = computed(() => getStatusColor(props.task.status))

/** 仅商品目标且带货号时可跳详情；历史任务缺货号则整卡不可点 */
const href = computed(() =>
  props.task.target.type === 'product' && props.task.target.productNo
    ? `/stock/${encodeURIComponent(props.task.target.productNo)}`
    : ''
)

/** 卡片内的按钮、输入框、链接等交互元素不触发整卡跳转 */
const isInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  !!target.closest('a, button, input, select, textarea, label, [role="button"], [role="link"]')

const handleCardClick = (event: MouseEvent) => {
  if (!href.value || isInteractiveTarget(event.target)) return
  navigateTo(href.value)
}

const handleCardActivate = (event: KeyboardEvent) => {
  if (!href.value || isInteractiveTarget(event.target)) return
  navigateTo(href.value)
}

const badgeClass = (tone: Tone): string =>
  ({
    neutral: 'bg-gray-50 text-gray-600 border-gray-100',
    info: 'bg-blue-50 text-blue-600 border-blue-100',
    success: 'bg-green-50 text-green-600 border-green-100',
    warning: 'bg-orange-50 text-orange-600 border-orange-100',
    danger: 'bg-red-50 text-red-600 border-red-100',
    up: 'bg-red-50 text-red-600 border-red-100',
    down: 'bg-green-50 text-green-600 border-green-100',
  })[tone]

const statClass = (tone?: Tone): string =>
  ({
    neutral: 'bg-gray-50 border-gray-100 text-gray-600',
    info: 'bg-blue-50 border-blue-100 text-blue-600',
    success: 'bg-green-50 border-green-100 text-green-700',
    warning: 'bg-amber-50 border-amber-100 text-amber-700',
    danger: 'bg-red-50 border-red-100 text-red-700',
    up: 'bg-red-50 border-red-100 text-red-600',
    down: 'bg-green-50 border-green-100 text-green-600',
  })[tone ?? 'neutral']

const noticeClass = computed(() => {
  const tone = props.task.notice?.tone
  return tone === 'danger'
    ? 'bg-red-50 border-red-100 text-red-700'
    : 'bg-amber-50 border-amber-100 text-amber-800'
})

/** 配置信息：只放「运行节奏」，策略类信息在 badges 里 */
const configChips = computed(() => {
  const config = props.task.config
  const chips: string[] = []
  if (config.interval) chips.push(`每 ${config.interval} 秒`)
  if (config.duration) chips.push(`最多 ${formatDuration(config.duration)}`)
  return chips
})
</script>
