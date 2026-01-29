<template>
  <span :class="badgeClasses">
    <!-- 圆点指示器 -->
    <span
      v-if="dot"
      :class="['w-2 h-2 rounded-full mr-1.5', dotColorClass]"
      aria-hidden="true"
    />
    <!-- 内容 -->
    <slot>{{ text }}</slot>
  </span>
</template>

<script setup lang="ts">
// 组件属性定义
interface Props {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'stock-available' | 'stock-unavailable'
  size?: 'sm' | 'md' | 'lg'
  text?: string
  dot?: boolean
  rounded?: 'sm' | 'md' | 'full'
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md',
  text: '',
  dot: false,
  rounded: 'full',
})

// 变体样式映射
const variantClasses: Record<string, string> = {
  default: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  'stock-available': 'bg-green-100 text-green-800',
  'stock-unavailable': 'bg-red-100 text-red-800',
}

// 圆点颜色映射
const dotColorClasses: Record<string, string> = {
  default: 'bg-gray-500',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  'stock-available': 'bg-green-500',
  'stock-unavailable': 'bg-red-500',
}

// 尺寸样式映射
const sizeClasses: Record<string, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-sm',
  lg: 'px-3 py-1 text-base',
}

// 圆角样式映射
const roundedClasses: Record<string, string> = {
  sm: 'rounded',
  md: 'rounded-md',
  full: 'rounded-full',
}

// 计算徽章类名
const badgeClasses = computed(() => {
  const base = 'inline-flex items-center font-medium'
  return [
    base,
    variantClasses[props.variant],
    sizeClasses[props.size],
    roundedClasses[props.rounded],
  ].join(' ')
})

// 计算圆点颜色类名
const dotColorClass = computed(() => dotColorClasses[props.variant])
</script>
