<template>
  <div :class="containerClasses">
    <!-- 状态图标 -->
    <span v-if="showIcon" :class="iconClasses" aria-hidden="true">
      <svg v-if="isAvailable" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
      </svg>
      <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
      </svg>
    </span>

    <!-- 状态文本 -->
    <span :class="textClasses">{{ statusText }}</span>

    <!-- 附加信息 -->
    <span v-if="message && showMessage" class="text-xs text-gray-500 ml-1">
      ({{ message }})
    </span>
  </div>
</template>

<script setup lang="ts">
// 组件属性定义
interface Props {
  inStock: boolean
  message?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'badge' | 'text'
  showIcon?: boolean
  showMessage?: boolean
  availableText?: string
  unavailableText?: string
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  message: '',
  size: 'md',
  variant: 'default',
  showIcon: true,
  showMessage: true,
  availableText: '有货',
  unavailableText: '无货',
})

// 计算是否有货
const isAvailable = computed(() => props.inStock)

// 状态文本
const statusText = computed(() => {
  return isAvailable.value ? props.availableText : props.unavailableText
})

// 尺寸样式映射
const sizeClasses: Record<string, { container: string; text: string }> = {
  sm: { container: 'text-xs', text: 'text-xs' },
  md: { container: 'text-sm', text: 'text-sm' },
  lg: { container: 'text-base', text: 'text-base' },
}

// 变体样式映射
const variantClasses: Record<string, { available: string; unavailable: string }> = {
  default: {
    available: 'text-green-600',
    unavailable: 'text-red-600',
  },
  badge: {
    available: 'bg-green-100 text-green-800 px-2 py-0.5 rounded-full',
    unavailable: 'bg-red-100 text-red-800 px-2 py-0.5 rounded-full',
  },
  text: {
    available: 'text-green-500 font-medium',
    unavailable: 'text-red-500 font-medium',
  },
}

// 计算容器类名
const containerClasses = computed(() => {
  const base = 'inline-flex items-center'
  const size = sizeClasses[props.size].container
  const variant = isAvailable.value
    ? variantClasses[props.variant].available
    : variantClasses[props.variant].unavailable

  return [base, size, props.variant === 'badge' ? variant : ''].filter(Boolean).join(' ')
})

// 计算图标类名
const iconClasses = computed(() => {
  return isAvailable.value ? 'text-green-500 mr-1' : 'text-red-500 mr-1'
})

// 计算文本类名
const textClasses = computed(() => {
  const size = sizeClasses[props.size].text
  const variant = props.variant !== 'badge'
    ? (isAvailable.value ? variantClasses[props.variant].available : variantClasses[props.variant].unavailable)
    : ''

  return [size, variant].filter(Boolean).join(' ')
})
</script>
