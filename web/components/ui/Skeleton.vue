<template>
  <div :class="skeletonClasses" :style="customStyle" aria-hidden="true" />
</template>

<script setup lang="ts">
// 组件属性定义
interface Props {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  width?: string | number
  height?: string | number
  animation?: 'pulse' | 'wave' | 'none'
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  variant: 'text',
  width: '100%',
  height: undefined,
  animation: 'pulse',
})

// 变体样式映射
const variantClasses: Record<string, string> = {
  text: 'rounded',
  circular: 'rounded-full',
  rectangular: 'rounded-none',
  rounded: 'rounded-lg',
}

// 动画样式映射
const animationClasses: Record<string, string> = {
  pulse: 'animate-pulse',
  wave: 'animate-wave',
  none: '',
}

// 计算骨架屏类名
const skeletonClasses = computed(() => {
  const base = 'bg-gray-200'
  return [base, variantClasses[props.variant], animationClasses[props.animation]].join(' ')
})

// 计算自定义样式
const customStyle = computed(() => {
  const style: Record<string, string> = {}

  // 处理宽度
  if (props.width) {
    style.width = typeof props.width === 'number' ? `${props.width}px` : props.width
  }

  // 处理高度
  if (props.height) {
    style.height = typeof props.height === 'number' ? `${props.height}px` : props.height
  } else if (props.variant === 'text') {
    style.height = '1em'
  } else if (props.variant === 'circular') {
    style.height = style.width || '40px'
  }

  return style
})
</script>

<style scoped>
/* 波浪动画 */
@keyframes wave {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.animate-wave {
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: wave 1.5s ease-in-out infinite;
}
</style>
