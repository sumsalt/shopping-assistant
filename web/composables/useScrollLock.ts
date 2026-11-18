/**
 * 全局页面滚动锁（弹窗、大图预览共用一份实现）
 *
 * 为什么不用 body{position:fixed; top:-scrollY}：
 * iOS Safari 上 fixed 浮层的「绘制层」和「命中测试层(hit-test)」会按不同坐标系算。
 * 一旦把 body 钉成 fixed 再往上挪 scrollY，浮层里所有元素的视觉位置与点击命中区
 * 就会整体错开一个页面滚动距离 —— 看着按钮在 A 处，手指点下去命中的是 B 处。
 * 这是 WebKit 的老问题，加 transform/will-change 只会更容易触发。
 *
 * 这里改成「不移动文档」的锁：
 *   1. html/body overflow:hidden + overscroll-behavior:none —— 止住主滚动与橡皮筋；
 *   2. document 上以 capture 拦 touchmove（passive:false）：触摸点不在可滚区域里就
 *      preventDefault；在可滚区域里但已到顶/到底也拦住，避免滚动链把整页带走。
 *
 * 文档滚动位置全程不动，fixed 浮层与视口严格对齐，解锁时也不用回滚。
 */
interface ScrollBox {
  node: HTMLElement
  canX: boolean
  canY: boolean
}

let lockCount = 0
let lockedScrollY = 0
let savedStyle: {
  bodyOverflow: string
  bodyPaddingRight: string
  bodyOverscroll: string
  htmlOverflow: string
  htmlOverscroll: string
} | null = null
/** 上一次 touchmove 的坐标，用来判断手势方向（决定是否已滚到边界） */
let lastTouchX = 0
let lastTouchY = 0

const readScrollable = (node: HTMLElement) => {
  const style = window.getComputedStyle(node)
  return {
    canX: /(auto|scroll)/.test(style.overflowX) && node.scrollWidth - node.clientWidth > 1,
    canY: /(auto|scroll)/.test(style.overflowY) && node.scrollHeight - node.clientHeight > 1,
  }
}

/** 从触摸目标往上找第一个可滚容器；页面根节点不算（那正是要锁住的） */
const findScrollBox = (target: EventTarget | null): ScrollBox | null => {
  let node = target as HTMLElement | null
  while (node && node !== document.body && node !== document.documentElement) {
    const { canX, canY } = readScrollable(node)
    if (canX || canY) return { node, canX, canY }
    node = node.parentElement
  }
  return null
}

const onTouchStart = (event: TouchEvent) => {
  if (event.touches.length !== 1) return
  lastTouchX = event.touches[0]!.clientX
  lastTouchY = event.touches[0]!.clientY
}

const onTouchMove = (event: TouchEvent) => {
  // 多指手势（缩放等）交回浏览器
  if (event.touches.length !== 1) return
  const touch = event.touches[0]!
  const deltaY = touch.clientY - lastTouchY
  const deltaX = touch.clientX - lastTouchX
  lastTouchX = touch.clientX
  lastTouchY = touch.clientY

  const block = () => {
    if (event.cancelable) event.preventDefault()
  }

  const box = findScrollBox(event.target)
  if (!box) {
    block()
    return
  }

  const vertical = Math.abs(deltaY) >= Math.abs(deltaX)
  if (vertical ? !box.canY : !box.canX) {
    block()
    return
  }

  const el = box.node
  const atStart = vertical ? el.scrollTop <= 0 && deltaY > 0 : el.scrollLeft <= 0 && deltaX > 0
  const atEnd = vertical
    ? el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && deltaY < 0
    : el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && deltaX < 0
  if (atStart || atEnd) block()
}

/** 立即把页面滚到指定位置：绕过全局 scroll-smooth，避免解锁/还原时缓慢爬 */
const scrollPageTo = (top: number) => {
  if (typeof window === 'undefined') return
  const html = document.documentElement
  const prevBehavior = html.style.scrollBehavior
  html.style.scrollBehavior = 'auto'
  window.scrollTo(0, top)
  html.style.scrollBehavior = prevBehavior
}

export const useScrollLock = () => {
  /**
   * 本组件是否持有锁
   *
   * 全局计数只能保证「叠加的几个浮层都关掉才解锁」，但同一个组件会在
   * watch(open=false) 和 onBeforeUnmount 里各解一次 —— 没有这个本地标记，
   * 后一次会把别的浮层还持着的锁一起解掉。
   */
  let held = false

  /**
   * 加锁，返回加锁时的页面滚动位置（多弹窗叠加时返回第一次加锁的位置）
   * 调用方可以记住这个值，用于 keep-alive 页面回来时还原列表位置
   */
  const lock = (): number => {
    if (typeof document === 'undefined') return 0
    if (held) return lockedScrollY
    held = true
    lockCount += 1
    if (lockCount > 1) return lockedScrollY

    const body = document.body
    const html = document.documentElement
    lockedScrollY = window.scrollY || html.scrollTop || 0
    savedStyle = {
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
      bodyOverscroll: body.style.overscrollBehavior,
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
    }
    // 补偿滚动条宽度，避免桌面端锁定时页面横向跳动
    const scrollbarGap = window.innerWidth - html.clientWidth
    if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    // 个别 iOS 版本在根节点锁滚动时会把位置归零，这里补回来（位置没变时是空操作）
    if (Math.abs((window.scrollY || 0) - lockedScrollY) > 1) scrollPageTo(lockedScrollY)

    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
    return lockedScrollY
  }

  const unlock = (restoreScroll = true) => {
    if (typeof document === 'undefined' || !held) return
    held = false
    if (lockCount <= 0) return
    lockCount -= 1
    if (lockCount > 0) return

    document.removeEventListener('touchstart', onTouchStart, true)
    document.removeEventListener('touchmove', onTouchMove, true)
    if (!savedStyle) return

    const body = document.body
    const html = document.documentElement
    body.style.overflow = savedStyle.bodyOverflow
    body.style.paddingRight = savedStyle.bodyPaddingRight
    body.style.overscrollBehavior = savedStyle.bodyOverscroll
    html.style.overflow = savedStyle.htmlOverflow
    html.style.overscrollBehavior = savedStyle.htmlOverscroll
    savedStyle = null

    if (restoreScroll && Math.abs((window.scrollY || 0) - lockedScrollY) > 1) scrollPageTo(lockedScrollY)
  }

  return { lock, unlock, scrollPageTo }
}
