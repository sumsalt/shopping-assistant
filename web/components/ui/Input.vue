<template>
  <div class="w-full">
    <!-- 标签 -->
    <label
      v-if="label"
      :for="inputId"
      class="block text-sm font-medium text-gray-700 mb-1"
    >
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>

    <!-- 输入框容器 -->
    <div class="relative">
      <!-- 前缀图标插槽 -->
      <div
        v-if="$slots.prefix"
        class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
      >
        <slot name="prefix" />
      </div>

      <!-- 输入框 -->
      <input
        :id="inputId"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :autocomplete="autocomplete"
        :class="inputClasses"
        :tabindex="disabled ? -1 : 0"
        :aria-label="ariaLabel || label"
        :aria-invalid="!!error"
        :aria-describedby="error ? `${inputId}-error` : undefined"
        @input="handleInput"
        @blur="handleBlur"
        @focus="handleFocus"
      />

      <!-- 后缀图标/按钮插槽 -->
      <div
        v-if="$slots.suffix"
        class="absolute inset-y-0 right-0 pr-3 flex items-center"
      >
        <slot name="suffix" />
      </div>

      <!-- 清除按钮 -->
      <button
        v-if="clearable && modelValue"
        type="button"
        class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
        :tabindex="-1"
        aria-label="清除输入"
        @click="handleClear"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- 错误提示 -->
    <p
      v-if="error"
      :id="`${inputId}-error`"
      class="mt-1 text-sm text-red-600"
      role="alert"
    >
      {{ error }}
    </p>

    <!-- 帮助文本 -->
    <p
      v-else-if="hint"
      class="mt-1 text-sm text-gray-500"
    >
      {{ hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { useSlots } from 'vue'

// 获取插槽
const slots = useSlots()

// 组件属性定义
interface Props {
  modelValue?: string | number
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search'
  label?: string
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  error?: string
  hint?: string
  clearable?: boolean
  autocomplete?: string
  ariaLabel?: string
  size?: 'sm' | 'md' | 'lg'
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  type: 'text',
  label: '',
  placeholder: '',
  disabled: false,
  readonly: false,
  required: false,
  error: '',
  hint: '',
  clearable: false,
  autocomplete: 'off',
  ariaLabel: '',
  size: 'md',
})

// 定义事件
const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: [event: FocusEvent]
  focus: [event: FocusEvent]
  clear: []
}>()

// 生成唯一 ID
const inputId = computed(() => `input-${Math.random().toString(36).substring(2, 9)}`)

// 尺寸样式映射
const sizeClasses: Record<string, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-5 py-3 text-lg',
}

// 计算输入框类名
const inputClasses = computed(() => {
  const base = 'block w-full rounded-lg border transition-colors duration-200'
  const focus = 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const state = props.error
    ? 'border-red-300 text-red-900 placeholder-red-300'
    : 'border-gray-300 text-gray-900 placeholder-gray-400'
  const disabled = props.disabled
    ? 'bg-gray-100 cursor-not-allowed'
    : 'bg-white'
  
  // 当有前缀插槽时，添加左侧内边距
  const prefixPadding = slots.prefix ? 'pl-10' : ''
  // 当有后缀插槽或清除按钮时，添加右侧内边距
  const suffixPadding = (slots.suffix || props.clearable) ? 'pr-10' : ''

  return [base, focus, state, disabled, sizeClasses[props.size], prefixPadding, suffixPadding].join(' ')
})

// 输入事件处理
const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

// 失焦事件处理
const handleBlur = (event: FocusEvent) => {
  emit('blur', event)
}

// 聚焦事件处理
const handleFocus = (event: FocusEvent) => {
  emit('focus', event)
}

// 清除事件处理
const handleClear = () => {
  emit('update:modelValue', '')
  emit('clear')
}
</script>
