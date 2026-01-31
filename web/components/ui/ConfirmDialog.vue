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
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click="handleBackdropClick"
      >
        <!-- 背景遮罩 -->
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" />

        <!-- 弹窗内容 -->
        <Transition
          enter-active-class="transition-all duration-200"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-200"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="show"
            class="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            @click.stop
          >
            <!-- 图标 -->
            <div
              v-if="showIcon"
              class="mx-auto flex items-center justify-center w-12 h-12 rounded-full mb-4"
              :class="iconBgClass"
            >
              <component
                :is="iconComponent"
                class="w-6 h-6"
                :class="iconClass"
              />
            </div>

            <!-- 标题 -->
            <h3 v-if="title" class="text-lg font-semibold text-gray-900 text-center mb-2">
              {{ title }}
            </h3>

            <!-- 内容 -->
            <p v-if="message" class="text-sm text-gray-600 text-center mb-6">
              {{ message }}
            </p>

            <!-- 按钮组 -->
            <div class="flex gap-3">
              <!-- 取消按钮 -->
              <UiButton
                variant="outline"
                class="flex-1"
                @click="handleCancel"
              >
                {{ cancelText }}
              </UiButton>
              <!-- 确认按钮 -->
              <UiButton
                :variant="confirmVariant"
                :loading="confirming"
                :disabled="confirming"
                class="flex-1"
                @click="handleConfirm"
              >
                {{ confirmText }}
              </UiButton>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// 图标组件
const WarningIcon = defineComponent({
  render() {
    return h('svg', {
      fill: 'none',
      viewBox: '0 0 24 24',
      stroke: 'currentColor',
      class: 'w-6 h-6'
    }, [
      h('path', {
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-width': '2',
        d: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
      })
    ])
  }
})

const InfoIcon = defineComponent({
  render() {
    return h('svg', {
      fill: 'none',
      viewBox: '0 0 24 24',
      stroke: 'currentColor',
      class: 'w-6 h-6'
    }, [
      h('path', {
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-width': '2',
        d: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
      })
    ])
  }
})

const DangerIcon = defineComponent({
  render() {
    return h('svg', {
      fill: 'none',
      viewBox: '0 0 24 24',
      stroke: 'currentColor',
      class: 'w-6 h-6'
    }, [
      h('path', {
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-width': '2',
        d: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
      })
    ])
  }
})

const SuccessIcon = defineComponent({
  render() {
    return h('svg', {
      fill: 'none',
      viewBox: '0 0 24 24',
      stroke: 'currentColor',
      class: 'w-6 h-6'
    }, [
      h('path', {
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-width': '2',
        d: 'M5 13l4 4L19 7'
      })
    ])
  }
})

// 组件属性
interface Props {
  show: boolean
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  type?: 'warning' | 'info' | 'danger' | 'success'
  showIcon?: boolean
  closeOnClickBackdrop?: boolean
  confirming?: boolean
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  title: '',
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  type: 'warning',
  showIcon: true,
  closeOnClickBackdrop: false,
  confirming: false,
})

// 定义事件
const emit = defineEmits<{
  confirm: []
  cancel: []
  'update:show': [value: boolean]
}>()

// 图标组件映射
const iconMap = {
  warning: WarningIcon,
  info: InfoIcon,
  danger: DangerIcon,
  success: SuccessIcon,
}

// 图标背景色映射
const iconBgMap = {
  warning: 'bg-yellow-100',
  info: 'bg-blue-100',
  danger: 'bg-red-100',
  success: 'bg-green-100',
}

// 图标颜色映射
const iconColorMap = {
  warning: 'text-yellow-600',
  info: 'text-blue-600',
  danger: 'text-red-600',
  success: 'text-green-600',
}

// 确认按钮变体映射
const confirmVariantMap = {
  warning: 'primary',
  info: 'primary',
  danger: 'danger',
  success: 'primary',
}

// 当前图标组件
const iconComponent = computed(() => iconMap[props.type])

// 图标背景样式
const iconBgClass = computed(() => iconBgMap[props.type])

// 图标样式
const iconClass = computed(() => iconColorMap[props.type])

// 确认按钮变体
const confirmVariant = computed(() => confirmVariantMap[props.type] as any)

// 点击背景
const handleBackdropClick = () => {
  if (props.closeOnClickBackdrop) {
    handleCancel()
  }
}

// 取消
const handleCancel = () => {
  emit('update:show', false)
  emit('cancel')
}

// 确认
const handleConfirm = () => {
  emit('confirm')
}
</script>
