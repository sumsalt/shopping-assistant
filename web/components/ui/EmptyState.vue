<template>
  <div class="flex flex-col items-center justify-center py-12 text-center">
    <!-- 图标 -->
    <div
      :class="[
        'w-20 h-20 rounded-full flex items-center justify-center mb-4',
        iconBgClass
      ]"
    >
      <slot name="icon">
        <svg v-if="type === 'empty'" :class="['w-10 h-10', iconColorClass]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <svg v-else-if="type === 'error'" :class="['w-10 h-10', iconColorClass]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <svg v-else-if="type === 'search'" :class="['w-10 h-10', iconColorClass]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <svg v-else :class="['w-10 h-10', iconColorClass]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </slot>
    </div>

    <!-- 标题 -->
    <h3 class="text-lg font-medium text-gray-900 mb-2">
      {{ title }}
    </h3>

    <!-- 描述 -->
    <p class="text-gray-500 max-w-sm mb-4">
      {{ description }}
    </p>

    <!-- 操作按钮 -->
    <div v-if="$slots.action || actionText" class="mt-2">
      <slot name="action">
        <UiButton
          v-if="actionText"
          :variant="actionVariant"
          @click="handleAction"
        >
          {{ actionText }}
        </UiButton>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
// 组件属性定义
interface Props {
  type?: 'empty' | 'error' | 'search' | 'default'
  title: string
  description?: string
  actionText?: string
  actionVariant?: 'primary' | 'secondary' | 'outline' | 'ghost'
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  type: 'empty',
  description: '',
  actionText: '',
  actionVariant: 'primary',
})

// 定义事件
const emit = defineEmits<{
  action: []
}>()

// 图标背景颜色
const iconBgClass = computed(() => {
  const classes: Record<string, string> = {
    empty: 'bg-gray-100',
    error: 'bg-red-100',
    search: 'bg-blue-100',
    default: 'bg-gray-100',
  }
  return classes[props.type]
})

// 图标颜色
const iconColorClass = computed(() => {
  const classes: Record<string, string> = {
    empty: 'text-gray-400',
    error: 'text-red-500',
    search: 'text-blue-500',
    default: 'text-gray-400',
  }
  return classes[props.type]
})

// 操作事件处理
const handleAction = () => {
  emit('action')
}
</script>
