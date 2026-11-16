<template>
  <div v-if="images.length > 0" class="space-y-2">
    <!-- 单张大主图：cover 裁剪铺满，点击进全屏预览（预览里可切到其余图片） -->
    <button
      type="button"
      class="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-gray-200 bg-gray-100 group focus:outline-none focus:ring-2 focus:ring-red-400 cursor-pointer"
      :aria-label="`查看商品图片，共 ${images.length} 张，点击放大`"
      @click="openPreview(0)"
    >
      <img
        :src="images[0]"
        :alt="name || '商品'"
        class="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
      />
      <!-- 张数角标，提示可点开看更多 -->
      <span class="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/55 px-2 py-1 text-xs text-white">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {{ images.length }} 张
      </span>
    </button>

    <!-- 全屏预览：Teleport 到 body，避免被父级 overflow / transform 裁剪 -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-150"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="previewOpen"
          class="preview-overlay fixed inset-0 z-[100] flex flex-col bg-black touch-none select-none"
          @touchstart="onTouchStart"
          @touchend="onTouchEnd"
        >
          <!-- 顶部栏：计数 + 缩放 + 关闭 -->
          <div class="flex items-center justify-between px-4 py-3 text-white flex-shrink-0">
            <span class="text-sm tabular-nums">{{ currentIndex + 1 }} / {{ images.length }}</span>
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="p-2 rounded-full hover:bg-white/15 transition-colors cursor-pointer disabled:opacity-30"
                :disabled="scale <= 1"
                aria-label="缩小"
                @click="zoomOut"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                </svg>
              </button>
              <span class="w-12 text-center text-xs tabular-nums">{{ Math.round(scale * 100) }}%</span>
              <button
                type="button"
                class="p-2 rounded-full hover:bg-white/15 transition-colors cursor-pointer disabled:opacity-30"
                :disabled="scale >= 3"
                aria-label="放大"
                @click="zoomIn"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                type="button"
                class="ml-2 p-2 rounded-full hover:bg-white/15 transition-colors cursor-pointer"
                aria-label="关闭预览"
                @click="closePreview"
              >
                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- 图片主体：占满剩余空间，点击自身放大/还原，空白处点击关闭 -->
          <div
            class="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden"
            @click.self="closePreview"
          >
            <img
              :key="images[currentIndex]"
              :src="images[currentIndex]"
              :alt="`${name || '商品'} 图片 ${currentIndex + 1}`"
              class="max-w-full max-h-full object-contain transition-transform duration-150"
              :style="{ transform: `scale(${scale})` }"
              draggable="false"
              @dblclick="toggleZoom"
            />

            <!-- 左右切换箭头 -->
            <template v-if="images.length > 1">
              <button
                type="button"
                class="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors cursor-pointer"
                aria-label="上一张"
                @click.stop="prev"
              >
                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors cursor-pointer"
                aria-label="下一张"
                @click.stop="next"
              >
                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </template>
          </div>

          <!-- 底部缩略图条：快速跳转 -->
          <div
            v-if="images.length > 1"
            class="flex gap-2 overflow-x-auto px-4 py-3 flex-shrink-0 preview-thumbs"
          >
            <button
              v-for="(url, index) in images"
              :key="`thumb-${url}-${index}`"
              type="button"
              class="relative w-14 h-14 flex-shrink-0 rounded overflow-hidden border-2 transition-colors cursor-pointer"
              :class="index === currentIndex ? 'border-red-500' : 'border-transparent opacity-60 hover:opacity-100'"
              :aria-label="`跳转到第 ${index + 1} 张`"
              @click="goTo(index)"
            >
              <img :src="url" :alt="''" class="w-full h-full object-cover" loading="lazy" />
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
interface Props {
  images: string[]
  name?: string
}

const props = defineProps<Props>()

const previewOpen = ref(false)
const currentIndex = ref(0)
const scale = ref(1)

// —— 打开时冻结页面滚动（与 Dialog 同一套方案：position:fixed 钉住 body）——
// 多个浮层可能叠加，用模块级计数避免一个关闭把别的锁也解了
let savedScrollY = 0
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

const lockScroll = () => {
  if (typeof document === 'undefined') return
  const body = document.body
  const html = document.documentElement
  savedScrollY = window.scrollY || document.documentElement.scrollTop || 0
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
  const scrollbarGap = window.innerWidth - html.clientWidth
  if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`
  body.style.position = 'fixed'
  body.style.top = `-${savedScrollY}px`
  body.style.left = '0'
  body.style.right = '0'
  body.style.width = '100%'
  body.style.overflow = 'hidden'
  html.style.overflow = 'hidden'
}

const unlockScroll = () => {
  if (typeof document === 'undefined' || !savedStyle) return
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
  const prevBehavior = html.style.scrollBehavior
  html.style.scrollBehavior = 'auto'
  window.scrollTo(0, savedScrollY)
  html.style.scrollBehavior = prevBehavior
}

const openPreview = (index: number) => {
  currentIndex.value = index
  scale.value = 1
  previewOpen.value = true
  lockScroll()
}

const closePreview = () => {
  previewOpen.value = false
  unlockScroll()
}

const goTo = (index: number) => {
  currentIndex.value = index
  scale.value = 1
}

const prev = () => {
  if (props.images.length <= 1) return
  currentIndex.value = (currentIndex.value - 1 + props.images.length) % props.images.length
  scale.value = 1
}

const next = () => {
  if (props.images.length <= 1) return
  currentIndex.value = (currentIndex.value + 1) % props.images.length
  scale.value = 1
}

const zoomIn = () => { scale.value = Math.min(3, scale.value + 0.5) }
const zoomOut = () => { scale.value = Math.max(1, scale.value - 0.5) }
const toggleZoom = () => { scale.value = scale.value > 1 ? 1 : 2 }

// 键盘：左右切换、Esc 关闭；仅在预览打开时监听
const onKeydown = (e: KeyboardEvent) => {
  if (!previewOpen.value) return
  if (e.key === 'Escape') closePreview()
  else if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'ArrowRight') next()
}
watch(previewOpen, (open) => {
  if (open) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
})

// 触摸左右滑动切换
let touchStartX = 0
let touchStartY = 0
const onTouchStart = (e: TouchEvent) => {
  const t = e.changedTouches[0]
  touchStartX = t.clientX
  touchStartY = t.clientY
}
const onTouchEnd = (e: TouchEvent) => {
  const t = e.changedTouches[0]
  const dx = t.clientX - touchStartX
  const dy = t.clientY - touchStartY
  // 只响应明显的横向滑动，避免和纵向手势/缩放冲突
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (dx < 0) next()
    else prev()
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  unlockScroll()
})
</script>

<style scoped>
/* 隐藏底部缩略图条的滚动条，但保留滚动能力 */
.preview-thumbs {
  scrollbar-width: none;
}
.preview-thumbs::-webkit-scrollbar {
  display: none;
}
</style>
