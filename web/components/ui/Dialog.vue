<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click="handleBackdropClick"
      >
        <!-- 背景遮罩 -->
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" />

        <!-- 对话框内容 -->
        <Transition
          enter-active-class="transition-all duration-200"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-200"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="open"
            class="relative bg-white rounded-lg shadow-xl w-full max-h-[90vh] flex flex-col"
            :class="sizeClass"
            @click.stop
          >
            <!-- 标题 -->
            <div v-if="title" class="px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h3 class="text-lg font-semibold text-gray-900">{{ title }}</h3>
            </div>

            <!-- 内容（小屏可滚动） -->
            <div class="px-6 py-4 overflow-y-auto">
              <slot />
            </div>

            <!-- 底部按钮 -->
            <div v-if="$slots.footer" class="px-6 py-4 border-t border-gray-200 flex-shrink-0">
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// 组件属性
interface Props {
  open: boolean
  title?: string
  closeOnClickBackdrop?: boolean
  /** 对话框宽度：表单较长的场景用 lg / xl */
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  title: '',
  closeOnClickBackdrop: true,
  size: 'md',
})

// 宽度映射
const sizeClass = computed(() => {
  const map: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }
  return map[props.size] || map.md
})

// 定义事件
const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

// 点击背景
const handleBackdropClick = () => {
  if (props.closeOnClickBackdrop) {
    emit('update:open', false)
  }
}
</script>
