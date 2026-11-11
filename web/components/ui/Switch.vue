<template>
  <button
    type="button"
    :class="[
      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
      enabled ? 'bg-blue-600' : 'bg-gray-200',
      disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
    ]"
    :disabled="disabled"
    role="switch"
    :aria-checked="enabled"
    :aria-readonly="disabled"
    @click="toggle"
  >
    <span
      :class="[
        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
        enabled ? 'translate-x-5' : 'translate-x-0'
      ]"
    />
  </button>
</template>

<script setup lang="ts">
interface Props {
  /** 是否启用 */
  modelValue?: boolean | '1' | '0'
  /** 是否禁用 */
  disabled?: boolean
}

interface Emits {
  /** 更新值（统一回传布尔，避免 v-model 收到 '0' 被当成真值） */
  (e: 'update:modelValue', value: boolean): void
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '0',
  disabled: false,
})

const emit = defineEmits<Emits>()

const enabled = computed({
  get: () => props.modelValue === true || props.modelValue === '1',
  set: (value: boolean) => emit('update:modelValue', value)
})

const toggle = () => {
  if (!props.disabled) {
    enabled.value = !enabled.value
  }
}
</script>
