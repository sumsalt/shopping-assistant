<template>
  <div v-if="events.length" class="space-y-1.5">
    <div
      v-for="event in events"
      :key="event.id"
      class="flex flex-wrap items-center gap-2 text-sm"
    >
      <span :class="['font-medium', toneClass(event.tone)]">{{ event.title }}</span>

      <template v-if="event.type === 'coupon.changed'">
        <span v-if="event.added?.length" class="text-green-600">
          新增 {{ event.added.map(item => item.label).join('、') }}
        </span>
        <span v-if="event.removed?.length" class="text-gray-400 line-through">
          失效 {{ event.removed.map(item => item.label).join('、') }}
        </span>
      </template>
      <span v-else-if="event.detail" :class="['text-gray-500', { 'truncate max-w-full': event.type === 'tab.new_items' }]">
        {{ event.detail }}
      </span>

      <span v-if="event.orderSn" class="text-xs text-gray-400 tabular-nums">{{ event.orderSn }}</span>
      <span class="text-xs text-gray-400">{{ formatTime(event.at) }}</span>
      <span v-if="event.emailSent === false" class="text-xs text-red-500">邮件发送失败</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskEvent, Tone } from '@core/contract'
import { formatTime } from '@/utils/taskFormat'

defineProps<{ events: TaskEvent[] }>()

const toneClass = (tone: Tone): string =>
  ({
    up: 'text-red-600',
    down: 'text-green-600',
    success: 'text-green-600',
    warning: 'text-amber-600',
    danger: 'text-red-600',
    info: 'text-blue-600',
    neutral: 'text-gray-700',
  })[tone] ?? 'text-gray-700'
</script>
