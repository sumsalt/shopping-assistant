<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="visible"
        :class="toastClasses"
        role="alert"
        aria-live="polite"
      >
        <!-- 图标 -->
        <div class="flex-shrink-0">
          <!-- 成功图标 -->
          <svg
            v-if="type === 'success'"
            class="h-5 w-5 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <!-- 错误图标 -->
          <svg
            v-else-if="type === 'error'"
            class="h-5 w-5 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <!-- 警告图标 -->
          <svg
            v-else-if="type === 'warning'"
            class="h-5 w-5 text-yellow-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <!-- 信息图标 -->
          <svg
            v-else
            class="h-5 w-5 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <!-- 消息内容 -->
        <div class="ml-3 flex-1">
          <p class="text-sm font-medium text-gray-900">{{ message }}</p>
          <p v-if="description" class="mt-1 text-sm text-gray-500">{{ description }}</p>
        </div>

        <!-- 关闭按钮 -->
        <button
          v-if="closable"
          type="button"
          class="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-600 focus:outline-none"
          aria-label="关闭"
          @click="handleClose"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// 组件属性定义
interface Props {
  visible?: boolean
  type?: 'success' | 'error' | 'warning' | 'info'
  message: string
  description?: string
  duration?: number
  closable?: boolean
  position?: 'top' | 'bottom'
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  visible: false,
  type: 'info',
  description: '',
  duration: 3000,
  closable: true,
  position: 'top',
})

// 定义事件
const emit = defineEmits<{
  close: []
  'update:visible': [value: boolean]
}>()

// 背景色映射
const bgClasses: Record<string, string> = {
  success: 'bg-green-50 border-green-200',
  error: 'bg-red-50 border-red-200',
  warning: 'bg-yellow-50 border-yellow-200',
  info: 'bg-blue-50 border-blue-200',
}

// 位置样式映射
const positionClasses: Record<string, string> = {
  top: 'top-[env(safe-area-inset-top,16px)]',
  bottom: 'bottom-[env(safe-area-inset-bottom,16px)]',
}

// 计算 Toast 类名
const toastClasses = computed(() => {
  const base = 'fixed left-4 right-4 z-50 flex items-start p-4 rounded-lg border shadow-lg max-w-md mx-auto'
  return [base, bgClasses[props.type], positionClasses[props.position]].join(' ')
})

// 自动关闭定时器
let timer: ReturnType<typeof setTimeout> | null = null

// 关闭 Toast
const handleClose = () => {
  emit('update:visible', false)
  emit('close')
}

// 监听 visible 变化
watch(
  () => props.visible,
  (val) => {
    if (val && props.duration > 0) {
      if (timer) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        handleClose()
      }, props.duration)
    }
  },
  { immediate: true }
)

// 组件卸载时清除定时器
onUnmounted(() => {
  if (timer) {
    clearTimeout(timer)
  }
})
</script>
