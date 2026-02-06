<template>
  <div class="w-full">
    <!-- 标签 -->
    <label
      v-if="label"
      :for="textareaId"
      class="block text-sm font-medium text-gray-700 mb-1"
    >
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>

    <!-- Textarea 容器 -->
    <div class="relative">
      <!-- Textarea -->
      <textarea
        :id="textareaId"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :rows="rows"
        :cols="cols"
        :class="textareaClasses"
        :tabindex="disabled ? -1 : 0"
        :aria-label="ariaLabel || label"
        :aria-invalid="!!error"
        :aria-describedby="error ? `${textareaId}-error` : undefined"
        @input="handleInput"
        @blur="handleBlur"
        @focus="handleFocus"
      />

      <!-- 清除按钮 -->
      <button
        v-if="clearable && modelValue"
        type="button"
        class="absolute top-2 right-2 flex items-center text-gray-400 hover:text-gray-600 bg-white"
        :tabindex="-1"
        aria-label="清除输入"
        @click="handleClear"
      >
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- 字符计数 -->
    <div
      v-if="showCount"
      class="flex justify-between mt-1"
    >
      <p
        v-if="error"
        :id="`${textareaId}-error`"
        class="text-sm text-red-600"
        role="alert"
      >
        {{ error }}
      </p>
      <p
        v-else-if="hint"
        class="text-sm text-gray-500"
      >
        {{ hint }}
      </p>
      <span class="text-sm text-gray-400 ml-auto">
        {{ currentLength }}{{ maxLength ? ` / ${maxLength}` : '' }}
      </span>
    </div>

    <!-- 错误提示（当不显示字符计数时） -->
    <p
      v-else-if="error"
      :id="`${textareaId}-error`"
      class="mt-1 text-sm text-red-600"
      role="alert"
    >
      {{ error }}
    </p>

    <!-- 帮助文本（当不显示字符计数时） -->
    <p
      v-else-if="hint"
      class="mt-1 text-sm text-gray-500"
    >
      {{ hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
// 组件属性定义
interface Props {
  modelValue?: string
  label?: string
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  error?: string
  hint?: string
  clearable?: boolean
  ariaLabel?: string
  size?: 'sm' | 'md' | 'lg'
  rows?: number
  cols?: number
  maxLength?: number
  showCount?: boolean
  resize?: 'none' | 'both' | 'horizontal' | 'vertical'
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  label: '',
  placeholder: '',
  disabled: false,
  readonly: false,
  required: false,
  error: '',
  hint: '',
  clearable: false,
  ariaLabel: '',
  size: 'md',
  rows: 4,
  cols: undefined,
  maxLength: undefined,
  showCount: false,
  resize: 'vertical',
})

// 定义事件
const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: [event: FocusEvent]
  focus: [event: FocusEvent]
  clear: []
}>()

// 生成唯一 ID (使用 Nuxt 的 useId 以保证 SSR 兼容性)
const textareaId = computed(() => `textarea-${useId()}`)

// 当前字符数
const currentLength = computed(() => String(props.modelValue || '').length)

// 尺寸样式映射
const sizeClasses: Record<string, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-5 py-3 text-lg',
}

// 调整大小样式映射
const resizeClasses: Record<string, string> = {
  none: 'resize-none',
  both: 'resize',
  horizontal: 'resize-x',
  vertical: 'resize-y',
}

// 计算 Textarea 类名
const textareaClasses = computed(() => {
  const base = 'block w-full rounded-lg border transition-colors duration-200 font-normal'
  const focus = 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const state = props.error
    ? 'border-red-300 text-red-900 placeholder-red-300'
    : 'border-gray-300 text-gray-900 placeholder-gray-400'
  const disabled = props.disabled
    ? 'bg-gray-100 cursor-not-allowed'
    : 'bg-white'

  // 当有清除按钮时，添加右侧内边距
  const clearablePadding = props.clearable ? 'pr-10' : ''

  return [
    base,
    focus,
    state,
    disabled,
    sizeClasses[props.size],
    resizeClasses[props.resize],
    clearablePadding
  ].join(' ')
})

// 输入事件处理
const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  let value = target.value

  // 如果设置了最大长度，限制输入
  if (props.maxLength && value.length > props.maxLength) {
    value = value.slice(0, props.maxLength)
  }

  emit('update:modelValue', value)
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
