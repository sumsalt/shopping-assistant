<template>
  <div class="flex items-center gap-3 min-w-0">
    <div class="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-100">
      <img
        v-if="target.image"
        :src="target.image"
        :alt="target.name"
        class="w-full h-full object-cover"
      >
      <div v-else class="w-full h-full flex items-center justify-center">
        <svg
          v-if="target.type === 'product'"
          class="w-5 h-5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <svg
          v-else-if="target.type === 'tab'"
          class="w-5 h-5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h10M4 18h7" />
        </svg>
        <svg
          v-else
          class="w-5 h-5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    </div>

    <div class="min-w-0">
      <!-- 不再单独放「查看详情」入口，由整张卡片承担跳转 -->
      <p class="text-sm font-medium text-gray-900 truncate">{{ target.name }}</p>
      <p v-if="target.subtitle" class="text-xs text-gray-500">{{ target.subtitle }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskTarget } from '@core/contract'

defineProps<{ target: TaskTarget }>()
</script>
