<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="buttonClasses"
    :tabindex="disabled ? -1 : 0"
    :aria-label="ariaLabel"
    :aria-disabled="disabled || loading"
    @click="handleClick"
    @keydown.enter="handleKeyDown"
    @keydown.space="handleKeyDown"
  >
    <!-- 加载动画 -->
    <svg
      v-if="loading"
      class="animate-spin -ml-1 mr-2 h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
    <!-- 插槽内容 -->
    <slot />
  </button>
</template>

<script setup lang="ts">
// 组件属性定义
interface Props {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  block?: boolean
  ariaLabel?: string
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
  block: false,
  ariaLabel: '',
})

// 定义事件
const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

// 基础样式
const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2'

// 变体样式映射
const variantClasses: Record<string, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 disabled:bg-blue-300',
  secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500 disabled:bg-gray-300',
  outline: 'border-2 border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500 disabled:border-gray-200 disabled:text-gray-400',
  ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-gray-500 disabled:text-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:bg-red-300',
}

// 尺寸样式映射
const sizeClasses: Record<string, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
}

// 计算按钮类名
const buttonClasses = computed(() => {
  return [
    baseClasses,
    variantClasses[props.variant],
    sizeClasses[props.size],
    props.block ? 'w-full' : '',
    (props.disabled || props.loading) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
  ].filter(Boolean).join(' ')
})

// 点击事件处理
const handleClick = (event: MouseEvent) => {
  if (!props.disabled && !props.loading) {
    emit('click', event)
  }
}

// 键盘事件处理
const handleKeyDown = (event: KeyboardEvent) => {
  if (!props.disabled && !props.loading) {
    event.preventDefault()
    emit('click', event as unknown as MouseEvent)
  }
}
</script>
