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
      <!-- 遮罩容器：钉在「视觉视口」(visualViewport) 上，而不是靠 fixed + dvh 那套会随
           移动端地址栏显隐漂移的基准。位置/尺寸由 JS 读 visualViewport 的 offsetTop/
           offsetLeft/width/height 实时写入 viewportStyle（见下方 syncViewport）。
           原因：页面滚动后地址栏隐藏，打开弹窗锁滚动会让地址栏重新出现；此时面板高度
           按隐藏时的大视口算、而 fixed top:0 锚在大视口顶部被地址栏盖住，整块面板就
           上移一个地址栏高度（标题栏被裁、底部露出页面）。用 visualViewport 后，遮罩
           始终严格贴合当前可见区域，地址栏怎么显隐都跟着变。 -->
      <!-- 页面被 keep-alive 缓存时用 display:none 藏起来：teleport 到 body 的遮罩不属于页面子树，
           页面切走后它会留在 body 上，变成盖住新页面的「幽灵弹窗」—— 看着是个弹窗，
           实际整页都点不动。用 display 而不是卸载，返回页面时 DOM 与滚动位置原样保留 -->
      <div
        v-if="open"
        class="dialog-backdrop fixed flex items-center justify-center p-4 overscroll-contain"
        :style="{ ...viewportStyle, zIndex, display: pageActive ? undefined : 'none' }"
        @click="handleBackdropClick"
      >
        <!-- 背景遮罩：独立于遮罩容器定位。顶边对齐可视区(viewportStyle.top)，
             底边用 bottom:0 一直铺到屏幕底——visualViewport.height 只算网页内容
             可视区、不含移动端浏览器底部 bar，若沿用容器高度，蒙层下方就会露出页面内容。
             touch-none 让在蒙层上起手滑动不再驱动页面滚动（body 锁失效时的兜底） -->
        <div
          class="dialog-scrim fixed inset-x-0 bg-black/50 backdrop-blur-sm touch-none"
          :style="{ top: viewportStyle.top || '0px', bottom: '0px' }"
        />

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
              class="border-b border-gray-200 flex-shrink-0 flex items-start justify-between gap-3"
              :class="compact ? 'px-4 py-3' : 'px-6 py-4'"
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
                'flex-1 min-h-0',
                compact ? 'px-4 py-3' : 'px-6 py-4',
                fill ? 'flex flex-col' : 'overflow-y-auto',
              ]"
            >
              <slot />
            </div>

            <!-- 底部按钮 -->
            <div
              v-if="$slots.footer"
              class="border-t border-gray-200 flex-shrink-0"
              :class="compact ? 'px-4 py-3' : 'px-6 py-4'"
            >
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
  /** 紧凑留白：标题/内容/底部内边距从 px-6 py-4 收小为 px-4 py-3（列表类弹窗用） */
  compact?: boolean
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  title: '',
  closeOnClickBackdrop: true,
  size: 'md',
  teleport: true,
  fill: false,
  compact: false,
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

// —— 打开时冻结页面滚动（实现见 composables/useScrollLock）——
// 不再用 body{position:fixed; top:-scrollY} 钉页面：iOS Safari 下 fixed 浮层的
// 绘制层与命中测试层会按不同坐标系算，页面滚动后打开弹窗，整层元素（含里头的列表、
// 按钮）会整体错开一个滚动距离 —— 看着在 A 处、点下去命中 B 处。
// 现在只锁滚动、不动文档：文档位置不变，fixed 与视口严格对齐，点击命中也就对上了。
const { lock: lockScroll, unlock: unlockScroll, scrollPageTo } = useScrollLock()

/** 页面被 keep-alive 缓存再回来时，用它把列表放回离开时的位置 */
let rememberedScrollY = 0

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

/**
 * 遮罩钉在「视觉视口」上。
 *
 * 移动端 Chrome/Safari 的地址栏会随滚动收起、随弹窗锁滚动重新出现，导致
 * layout viewport（fixed + dvh 的基准）与当前可见区域不一致：面板按大视口定高、
 * 却锚在大视口顶部，被重新出现的地址栏盖住一截，看起来整块弹窗上移。
 * visualViewport 直接给出当前可见区域的高度和相对布局视口的偏移，
 * 用它显式定位遮罩，地址栏怎么变都能贴合。
 */
const viewportStyle = ref<Record<string, string>>({})
let viewportBound = false

const syncViewport = () => {
  if (!import.meta.client) return
  const vv = window.visualViewport
  if (!vv) {
    // 不支持 visualViewport 的老浏览器：退回 fixed inset-0 + dvh
    viewportStyle.value = { top: '0px', left: '0px', width: '100%', height: '100dvh' }
    return
  }
  // visualViewport 的 width/height/offsetLeft/offsetTop 均以 CSS 像素给出，
  // 直接可用，不要除 scale（除了会让缩放时算错，没有别的作用）。
  // fixed 元素相对布局视口定位，而 offsetLeft/offsetTop 正是可视区相对布局视口的偏移。
  viewportStyle.value = {
    top: `${vv.offsetTop}px`,
    left: `${vv.offsetLeft}px`,
    width: `${vv.width}px`,
    height: `${vv.height}px`,
  }
}

const bindViewport = () => {
  if (!import.meta.client || viewportBound) return
  syncViewport()
  // 地址栏收起/展开会触发 resize，滚动导致可视区相对布局视口位移会触发 scroll
  window.visualViewport?.addEventListener('resize', syncViewport)
  window.visualViewport?.addEventListener('scroll', syncViewport)
  window.addEventListener('resize', syncViewport)
  viewportBound = true
}

const unbindViewport = () => {
  if (!viewportBound) return
  window.visualViewport?.removeEventListener('resize', syncViewport)
  window.visualViewport?.removeEventListener('scroll', syncViewport)
  window.removeEventListener('resize', syncViewport)
  viewportBound = false
}

watch(
  () => props.open,
  (open) => {
    if (!import.meta.client) return
    if (open) {
      acquireLayer()
      bindViewport()
      rememberedScrollY = lockScroll()
      // 锁滚动可能让地址栏重新出现、改变可视区，锁完再同步一次
      syncViewport()
    } else {
      releaseLayer()
      unbindViewport()
      unlockScroll()
    }
  },
)

// 初始就处于打开状态的弹窗（非交互打开）在挂载后补一次领层与滚动锁
onMounted(() => {
  if (!props.open) return
  acquireLayer()
  bindViewport()
  rememberedScrollY = lockScroll()
  syncViewport()
})

// 页面被 keep-alive 缓存（如从弹窗点进商品详情）时先解锁，否则目标页滚不动；
// 这里不滚回列表位置，让目标页按路由默认行为从顶部开始。
// 同时出栈：页面不可见时它的弹窗不应该占着层级；并把弹窗藏起来（见 pageActive）。
onDeactivated(() => {
  pageActive.value = false
  if (!props.open) return
  releaseLayer()
  unbindViewport()
  unlockScroll(false)
})
// 回到缓存的页面：按离开时的位置重新钉住，弹窗与列表位置原样恢复；
// 重新入栈，保证多弹窗场景下顺序与组件树一致（后渲染的监控弹窗在上）
onActivated(() => {
  pageActive.value = true
  if (!props.open) return
  acquireLayer()
  // 先把页面放回离开时的位置，再上锁；顺序反了会把列表钉在错的位置
  scrollPageTo(rememberedScrollY)
  bindViewport()
  lockScroll()
  syncViewport()
})

onBeforeUnmount(() => {
  releaseLayer()
  unbindViewport()
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
 * 遮罩的定位与尺寸不在这里写死，而是由 JS 读 visualViewport 实时写入内联样式
 * （见脚本里的 viewportStyle / syncViewport）。这样遮罩严格贴合当前可见区域，
 * 不受移动端地址栏显隐导致的「布局视口 vs 可视视口」错位影响。
 *
 * 面板高度相对遮罩内容区用百分比计算：
 *   遮罩带 p-4，flex 项的 100% 已自动扣除上下共 2rem 内边距，
 *   与遮罩同一基准，地址栏怎么变都不会错位。
 */
.dialog-panel {
  max-height: 100%;
}

/* fill 模式：列表类弹窗。内部列表用 flex-1 撑开，需要确定高度才能算可用空间。
   遮罩是 flex 容器且已定高，面板 height:100% 即撑满遮罩内容区（自动扣除 p-4）。 */
.dialog-panel--fill {
  height: 100%;
}
</style>
