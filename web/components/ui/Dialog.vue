<template>
  <!-- 默认 teleport 到 body；就地渲染模式（:teleport="false"）让弹窗 DOM 留在组件子树内，
       这样页面被 keep-alive 缓存时弹窗会被一起搬走/恢复，状态与滚动位置都能保住 -->
  <Teleport to="body" :disabled="!teleport">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <!-- 遮罩容器：fill 模式用 dvh 基准（与弹窗高度同尺），避免移动端 vh/dvh 不一致导致弹窗被地址栏裁切 -->
      <div
        v-if="open"
        :class="[
          'z-50 flex items-center justify-center p-4',
          fill ? 'fixed inset-x-0 top-0 h-[100dvh]' : 'fixed inset-0',
        ]"
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
            class="relative bg-white rounded-lg shadow-xl w-full flex flex-col"
            :class="[sizeClass, fill ? 'h-[85dvh]' : 'max-h-[90vh]']"
            @click.stop
          >
            <!-- 标题 -->
            <div
              v-if="title"
              class="px-6 py-4 border-b border-gray-200 flex-shrink-0 flex items-start justify-between gap-3"
            >
              <h3 class="text-lg font-semibold text-gray-900">{{ title }}</h3>
              <button
                type="button"
                class="-mr-2 -mt-1 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                aria-label="关闭"
                @click="close"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- 内容区：默认自身滚动；fill 模式改为 flex 容器、不滚动，由 slot 内部自行管理滚动 -->
            <div
              :class="[
                'px-6 py-4 flex-1 min-h-0',
                fill ? 'flex flex-col' : 'overflow-y-auto',
              ]"
            >
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
  /** 是否把弹窗传送到 body。需要配合页面级 keep-alive 保留弹窗状态/滚动位置时传 false */
  teleport?: boolean
  /** 铺满模式：弹窗固定为动态视口高度，内容区不滚动、由 slot 内部自行管理滚动（列表类弹窗用） */
  fill?: boolean
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  title: '',
  closeOnClickBackdrop: true,
  size: 'md',
  teleport: true,
  fill: false,
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

// —— 打开时锁定 body 滚动 ——
// 不锁的话，在弹窗上滑动会滚动穿透到背景页：页面一滚，移动端地址栏收缩、
// fixed 的参照视口跟着变，蒙层和弹窗会一起「往上跑」。
// 多个弹窗可能叠加，用计数避免一个关闭把另一个的锁也解了。
let openDialogCount = 0
let savedBodyOverflow = ''
let savedBodyPaddingRight = ''
let localLocked = false

const applyBodyLock = () => {
  if (typeof document === 'undefined') return
  openDialogCount += 1
  if (openDialogCount > 1) return
  savedBodyOverflow = document.body.style.overflow
  savedBodyPaddingRight = document.body.style.paddingRight
  // 补偿滚动条宽度，避免桌面端页面横向跳动
  const scrollbarGap = window.innerWidth - document.documentElement.clientWidth
  if (scrollbarGap > 0) document.body.style.paddingRight = `${scrollbarGap}px`
  document.body.style.overflow = 'hidden'
}

const releaseBodyLock = () => {
  if (typeof document === 'undefined') return
  if (openDialogCount <= 0) return
  openDialogCount -= 1
  if (openDialogCount > 0) return
  document.body.style.overflow = savedBodyOverflow
  document.body.style.paddingRight = savedBodyPaddingRight
}

const lockScroll = () => {
  if (localLocked) return
  localLocked = true
  applyBodyLock()
}

const unlockScroll = () => {
  if (!localLocked) return
  localLocked = false
  releaseBodyLock()
}

watch(
  () => props.open,
  (open) => {
    if (open) lockScroll()
    else unlockScroll()
  },
  { immediate: true },
)

// 页面被 keep-alive 缓存（如从弹窗点进商品详情）时先解锁，否则目标页滚不动；
// 返回时弹窗若还开着，重新锁上。
onDeactivated(() => {
  if (props.open) unlockScroll()
})
onActivated(() => {
  if (props.open) lockScroll()
})

onBeforeUnmount(() => {
  unlockScroll()
})

// 点击背景
const handleBackdropClick = () => {
  if (props.closeOnClickBackdrop) {
    emit('update:open', false)
  }
}

// 关闭按钮
const close = () => {
  emit('update:open', false)
}
</script>
