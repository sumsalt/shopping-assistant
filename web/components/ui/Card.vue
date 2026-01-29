<template>
  <div
    :class="cardClasses"
    :tabindex="clickable ? 0 : -1"
    :role="clickable ? 'button' : undefined"
    :aria-label="ariaLabel"
    @click="handleClick"
    @keydown.enter="handleKeyDown"
    @keydown.space="handleKeyDown"
  >
    <!-- 头部 -->
    <div v-if="$slots.header || title" class="px-4 py-3 border-b border-gray-100">
      <slot name="header">
        <h3 class="text-lg font-semibold text-gray-900">{{ title }}</h3>
        <p v-if="subtitle" class="mt-1 text-sm text-gray-500">{{ subtitle }}</p>
      </slot>
    </div>

    <!-- 内容区域 -->
    <div :class="['px-4 py-4', contentClass]">
      <slot />
    </div>

    <!-- 底部 -->
    <div v-if="$slots.footer" class="px-4 py-3 border-t border-gray-100 bg-gray-50">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
// 组件属性定义
interface Props {
  title?: string
  subtitle?: string
  clickable?: boolean
  hoverable?: boolean
  bordered?: boolean
  shadow?: 'none' | 'sm' | 'md' | 'lg'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  contentClass?: string
  ariaLabel?: string
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  title: '',
  subtitle: '',
  clickable: false,
  hoverable: false,
  bordered: true,
  shadow: 'sm',
  padding: 'md',
  contentClass: '',
  ariaLabel: '',
})

// 定义事件
const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

// 阴影样式映射
const shadowClasses: Record<string, string> = {
  none: '',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
}

// 计算卡片类名
const cardClasses = computed(() => {
  const base = 'bg-white rounded-lg overflow-hidden'
  const border = props.bordered ? 'border border-gray-200' : ''
  const shadow = shadowClasses[props.shadow]
  const hover = props.hoverable ? 'card-hover' : ''
  const cursor = props.clickable ? 'cursor-pointer' : ''
  const focus = props.clickable ? 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2' : ''

  return [base, border, shadow, hover, cursor, focus].filter(Boolean).join(' ')
})

// 点击事件处理
const handleClick = (event: MouseEvent) => {
  if (props.clickable) {
    emit('click', event)
  }
}

// 键盘事件处理
const handleKeyDown = (event: KeyboardEvent) => {
  if (props.clickable) {
    event.preventDefault()
    emit('click', event as unknown as MouseEvent)
  }
}
</script>
