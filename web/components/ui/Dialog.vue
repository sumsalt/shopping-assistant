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
      <!-- 遮罩容器：固定铺满视口。配合组件内的 body 冻结锁，页面不再滚动，
           fixed 与视口严格对齐，弹窗始终在可见区居中 -->
      <!-- 页面被 keep-alive 缓存时用 display:none 藏起来：teleport 到 body 的遮罩不属于页面子树，
           页面切走后它会留在 body 上，变成盖住新页面的「幽灵弹窗」—— 看着是个弹窗，
           实际整页都点不动。用 display 而不是卸载，返回页面时 DOM 与滚动位置原样保留 -->
      <div
        v-if="open"
        class="fixed inset-0 flex items-center justify-center p-4 overscroll-contain"
        :style="{ zIndex, display: pageActive ? undefined : 'none' }"
        @click="handleBackdropClick"
      >
        <!-- 背景遮罩：touch-none 让在蒙层上起手滑动不再驱动页面滚动（body 锁失效时的兜底） -->
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm touch-none" />

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
            class="dialog-panel relative bg-white rounded-lg shadow-xl w-full flex flex-col"
            :class="[sizeClass, fill ? 'dialog-panel--fill' : '']"
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

// —— 打开时冻结页面滚动 ——
// 只设 body{overflow:hidden} 在 iOS Safari 上拦不住滚动（已知问题），页面照样能滚：
// 一滚，地址栏收缩、fixed 参照的视口跟着变，蒙层和弹窗看起来就「往上跑」，
// 在蒙层上滑动也会把背景页滚走。改用 position:fixed 把 body 钉住
// （top 取滚动量的负值，视觉位置不变），iOS / Android / 桌面都能真正冻住。
// 多个弹窗可能叠加，用计数避免一个关闭把另一个的锁也解了。
let openDialogCount = 0
/** 加锁时的页面滚动位置，卸载/关闭时据此还原 */
let savedScrollY = 0
/** 页面被 keep-alive 缓存再回来时，用它把列表钉回离开时的位置 */
let rememberedScrollY = 0
let savedStyle: {
  position: string
  top: string
  left: string
  right: string
  width: string
  overflow: string
  paddingRight: string
  htmlOverflow: string
} | null = null
let localLocked = false

const applyBodyLock = (scrollY: number) => {
  if (typeof document === 'undefined') return
  openDialogCount += 1
  if (openDialogCount > 1) return
  const body = document.body
  const html = document.documentElement
  savedScrollY = scrollY
  rememberedScrollY = scrollY
  savedStyle = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
    paddingRight: body.style.paddingRight,
    htmlOverflow: html.style.overflow,
  }
  // 补偿滚动条宽度，避免桌面端页面横向跳动
  const scrollbarGap = window.innerWidth - html.clientWidth
  if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`
  body.style.position = 'fixed'
  body.style.top = `-${scrollY}px`
  body.style.left = '0'
  body.style.right = '0'
  body.style.width = '100%'
  body.style.overflow = 'hidden'
  html.style.overflow = 'hidden'
}

const releaseBodyLock = (restoreScroll: boolean) => {
  if (typeof document === 'undefined') return
  if (openDialogCount <= 0) return
  openDialogCount -= 1
  if (openDialogCount > 0) return
  if (!savedStyle) return
  const body = document.body
  const html = document.documentElement
  body.style.position = savedStyle.position
  body.style.top = savedStyle.top
  body.style.left = savedStyle.left
  body.style.right = savedStyle.right
  body.style.width = savedStyle.width
  body.style.overflow = savedStyle.overflow
  body.style.paddingRight = savedStyle.paddingRight
  html.style.overflow = savedStyle.htmlOverflow
  savedStyle = null
  if (restoreScroll) {
    // body 被 fixed 后文档滚动量会归零，解锁后要手动滚回原位；
    // html 上全局有 scroll-smooth，临时关掉避免解锁时页面缓动爬回去
    const prevBehavior = html.style.scrollBehavior
    html.style.scrollBehavior = 'auto'
    window.scrollTo(0, savedScrollY)
    html.style.scrollBehavior = prevBehavior
  }
}

const lockScroll = (scrollY?: number) => {
  if (localLocked) return
  localLocked = true
  const target =
    scrollY ??
    (typeof window === 'undefined' ? 0 : window.scrollY || document.documentElement.scrollTop || 0)
  applyBodyLock(target)
}

const unlockScroll = (restoreScroll = true) => {
  if (!localLocked) return
  localLocked = false
  releaseBodyLock(restoreScroll)
}

// —— 层级：后打开的弹窗永远盖住先打开的 ——
// 不能靠 DOM 顺序（teleport 到 body + keep-alive 恢复会让顺序反转），
// 统一走 useDialogLayer 的显式栈。SSR 阶段不领层，保证首帧与客户端一致。
const { zIndex, acquire: acquireLayer, release: releaseLayer } = useDialogLayer()

/**
 * 所属页面当前是否可见
 *
 * teleport 到 body 的弹窗不属于页面子树：页面被 keep-alive 缓存切走时它不会被一起收起来，
 * 会留在 body 上继续盖住新页面（蒙层照旧吃点击）——表现就是「明明没开这个弹窗，整页却点不动」。
 * 所以页面失活时把它从视觉上摘掉，回到页面再放出来。
 */
const pageActive = ref(true)

watch(
  () => props.open,
  (open) => {
    if (!import.meta.client) return
    if (open) {
      acquireLayer()
      lockScroll()
    } else {
      releaseLayer()
      unlockScroll()
    }
  },
)

// 初始就处于打开状态的弹窗（非交互打开）在挂载后补一次领层与滚动锁
onMounted(() => {
  if (!props.open) return
  acquireLayer()
  lockScroll()
})

// 页面被 keep-alive 缓存（如从弹窗点进商品详情）时先解锁，否则目标页滚不动；
// 这里不滚回列表位置，让目标页按路由默认行为从顶部开始。
// 同时出栈：页面不可见时它的弹窗不应该占着层级；并把弹窗藏起来（见 pageActive）。
onDeactivated(() => {
  pageActive.value = false
  if (!props.open) return
  releaseLayer()
  unlockScroll(false)
})
// 回到缓存的页面：按离开时的位置重新钉住，弹窗与列表位置原样恢复；
// 重新入栈，保证多弹窗场景下顺序与组件树一致（后渲染的监控弹窗在上）
onActivated(() => {
  pageActive.value = true
  if (!props.open) return
  acquireLayer()
  lockScroll(rememberedScrollY)
})

onBeforeUnmount(() => {
  releaseLayer()
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

<style scoped>
/*
 * 面板高度上限必须用动态视口单位：
 * 移动端 vh 对应「地址栏收起时的大视口」，地址栏展开时 100vh 比可视高度大几十到上百 px，
 * 按 90vh 限高会让面板整体超出屏幕，内部滚动永远触发不了（内容被屏幕边缘裁掉）。
 * 2rem 是遮罩层 p-4 的上下内边距，扣除后正好贴合可视区。
 * 先写 vh 供老浏览器降级，再写 dvh 覆盖。
 */
.dialog-panel {
  max-height: calc(100vh - 2rem);
  max-height: calc(100dvh - 2rem);
}

/* fill 模式：列表类弹窗。内部列表用 flex-1 撑开，必须有确定高度才能算出可用空间，
   所以这里是固定高度而非 max-height —— 但取值和默认模式的上限完全一致，
   两种弹窗在屏幕上的上下边界对齐，不再一个 85dvh、一个 100dvh-2rem */
.dialog-panel--fill {
  height: calc(100vh - 2rem);
  height: calc(100dvh - 2rem);
}
</style>
