<template>
  <button
    ref="triggerEl"
    type="button"
    :id="id || undefined"
    :disabled="disabled"
    :aria-label="ariaLabel || undefined"
    :aria-expanded="isOpen"
    aria-haspopup="listbox"
    :class="[triggerClasses, block ? 'w-full' : '']"
    @click="toggle"
    @keydown.down.prevent="handleArrowDown"
    @keydown.up.prevent="handleArrowUp"
    @keydown.enter.prevent="handleEnter"
    @keydown.space.prevent="handleEnter"
    @keydown.esc="handleEscape"
    @keydown.tab="close"
  >
    <span class="truncate" :class="hasValue ? 'text-gray-900' : 'text-gray-400'">
      {{ displayLabel }}
    </span>
    <svg
      class="h-4 w-4 flex-shrink-0 text-gray-400 transition-transform"
      :class="isOpen ? 'rotate-180' : ''"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- 面板挂到 body：避免被 Dialog 的 overflow-y-auto 裁剪，层级高于 Dialog(50) 低于 Toast(100) -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="panelEl"
      class="fixed z-[60]"
      :style="{ left: `${position.left}px`, top: `${position.top}px`, width: `${position.width}px` }"
    >
      <div
        class="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        role="listbox"
      >
        <button
          v-for="(option, index) in options"
          :key="option.value"
          type="button"
          role="option"
          :aria-selected="option.value === modelValue"
          :disabled="option.disabled"
          class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors"
          :class="optionClasses(option, index)"
          @click="select(option)"
          @mousemove="activeIndex = index"
        >
          <span class="min-w-0">
            <span class="block truncate">{{ option.label }}</span>
            <span v-if="option.description" class="mt-0.5 block truncate text-xs text-gray-500">
              {{ option.description }}
            </span>
          </span>
          <svg
            v-if="option.value === modelValue"
            class="h-4 w-4 flex-shrink-0 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </button>

        <p v-if="options.length === 0" class="px-3 py-2 text-sm text-gray-400">暂无选项</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts" generic="T extends string | number">
/**
 * 统一的下拉选择组件
 *
 * 替代原生 <select>：视觉与账号切换下拉一致（圆角、chevron、选中勾、悬停高亮）。
 * 面板 Teleport 到 body 并用 fixed 定位，因此在 Dialog 的滚动容器里也不会被裁剪。
 *
 * - 受控组件，支持 v-model（string / number）
 * - placeholder 用于渲染「未选择」状态（传空值字符串时显示）
 * - size="sm" 用于工具栏，md 用于表单
 */

interface SelectOption<V extends string | number> {
  value: V
  label: string
  description?: string
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue?: T | null
    options: SelectOption<T>[]
    /** 未选择时的占位文案 */
    placeholder?: string
    disabled?: boolean
    size?: 'sm' | 'md'
    /** 是否撑满父容器宽度，默认 true */
    block?: boolean
    id?: string
    ariaLabel?: string
  }>(),
  {
    modelValue: null,
    placeholder: '',
    disabled: false,
    size: 'md',
    block: true,
    id: '',
    ariaLabel: '',
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: T]
  change: [value: T]
}>()

const isOpen = ref(false)
const activeIndex = ref(-1)
const triggerEl = ref<HTMLButtonElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const position = ref({ left: 0, top: 0, width: 0 })

const selectedOption = computed(() => props.options.find(option => option.value === props.modelValue))
const hasValue = computed(() => selectedOption.value !== undefined)
const displayLabel = computed(() => selectedOption.value?.label ?? props.placeholder)

const triggerClasses = computed(() => {
  const sizeClass = props.size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-3 py-2 text-sm'
  return [
    'inline-flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white text-left shadow-sm transition-colors',
    'hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400',
    sizeClass,
  ].join(' ')
})

const optionClasses = (option: SelectOption<T>, index: number) => {
  if (option.disabled) return 'cursor-not-allowed text-gray-300'
  if (option.value === props.modelValue) return 'bg-blue-50 text-blue-700'
  if (index === activeIndex.value) return 'bg-gray-100 text-gray-900'
  return 'text-gray-700 hover:bg-gray-50'
}

/** 计算面板位置：默认向下展开，下方空间不足时向上 */
const updatePosition = () => {
  const trigger = triggerEl.value
  if (!trigger) return

  const rect = trigger.getBoundingClientRect()
  const panelHeight = panelEl.value?.offsetHeight || 240
  const gap = 4
  const viewportPadding = 8
  // 工具栏里的短按钮（如「最近更新」）按时宽会截断选项文案，给一个最小面板宽度
  const width = Math.min(
    Math.max(rect.width, 180),
    window.innerWidth - viewportPadding * 2
  )

  const openUpward = rect.bottom + gap + panelHeight > window.innerHeight && rect.top > panelHeight + gap
  const top = openUpward ? rect.top - panelHeight - gap : rect.bottom + gap
  const left = Math.min(
    Math.max(rect.left, viewportPadding),
    Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
  )

  position.value = { left, top, width }
}

const handleDocumentPointerDown = (event: MouseEvent) => {
  const target = event.target as Node
  if (triggerEl.value?.contains(target) || panelEl.value?.contains(target)) return
  close()
}

const handleViewportChange = () => {
  if (!isOpen.value) return
  updatePosition()
}

const bindListeners = () => {
  document.addEventListener('mousedown', handleDocumentPointerDown)
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
}

const unbindListeners = () => {
  document.removeEventListener('mousedown', handleDocumentPointerDown)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
}

const open = () => {
  if (props.disabled || isOpen.value) return
  isOpen.value = true
  const index = props.options.findIndex(option => option.value === props.modelValue)
  activeIndex.value = index >= 0 ? index : 0
  bindListeners()
  // 先按触发器位置估算一次，避免首帧出现在左上角；面板渲染后再按实际高度修正
  updatePosition()
  nextTick(updatePosition)
}

const close = () => {
  if (!isOpen.value) return
  isOpen.value = false
  unbindListeners()
}

const toggle = () => {
  if (isOpen.value) close()
  else open()
}

const select = (option: SelectOption<T>) => {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  close()
  triggerEl.value?.focus()
}

const moveActive = (step: number) => {
  if (!isOpen.value) {
    open()
    return
  }
  if (props.options.length === 0) return

  let next = activeIndex.value
  for (let i = 0; i < props.options.length; i++) {
    next = (next + step + props.options.length) % props.options.length
    if (!props.options[next].disabled) break
  }
  activeIndex.value = next
}

const handleArrowDown = () => moveActive(1)
const handleArrowUp = () => moveActive(-1)

const handleEnter = () => {
  if (!isOpen.value) {
    open()
    return
  }
  const option = props.options[activeIndex.value]
  if (option) select(option)
}

const handleEscape = () => {
  close()
  triggerEl.value?.focus()
}

onBeforeUnmount(unbindListeners)
</script>
