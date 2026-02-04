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
            class="relative bg-white rounded-lg shadow-xl max-w-md w-full"
            @click.stop
          >
            <!-- 标题 -->
            <div v-if="title" class="px-6 py-4 border-b border-gray-200">
              <h3 class="text-lg font-semibold text-gray-900">{{ title }}</h3>
            </div>

            <!-- 内容 -->
            <div class="px-6 py-4">
              <slot />
            </div>

            <!-- 底部按钮 -->
            <div v-if="$slots.footer" class="px-6 py-4 border-t border-gray-200">
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
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  title: '',
  closeOnClickBackdrop: true,
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
