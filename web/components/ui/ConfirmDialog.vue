<template>
  <!-- 基于 UiDialog：高度上限、内部滚动、遮罩、滚动锁、安全区都复用同一套实现，
       不再自己复制一份 Teleport + 遮罩。对外 API（show / confirm / cancel / update:show）保持不变 -->
  <UiDialog
    :open="show"
    size="md"
    :close-on-click-backdrop="closeOnClickBackdrop"
    @update:open="handleOpenChange"
  >
    <div class="text-center">
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
      <h3 v-if="title" class="text-lg font-semibold text-gray-900 mb-2">
        {{ title }}
      </h3>

      <!-- 内容 -->
      <p v-if="message" class="text-sm text-gray-600">
        {{ message }}
      </p>
    </div>

    <!-- 按钮组放在 footer：内容再长也固定可见，不会随内容滚走 -->
    <template #footer>
      <div class="flex gap-3">
        <UiButton
          variant="outline"
          class="flex-1"
          @click="handleCancel"
        >
          {{ cancelText }}
        </UiButton>
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
    </template>
  </UiDialog>
</template>

<script setup lang="ts">
import UiDialog from './Dialog.vue'
import UiButton from './Button.vue'

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

// 取消
const handleCancel = () => {
  emit('update:show', false)
  emit('cancel')
}

// UiDialog 关闭（点遮罩等）统一按取消处理，保持原先「关闭即视为取消」的语义
const handleOpenChange = (value: boolean) => {
  if (!value) handleCancel()
}

// 确认
const handleConfirm = () => {
  emit('confirm')
}
</script>
