import { computed, ref } from 'vue'

/**
 * 弹窗层级分配
 *
 * 所有 Dialog 都 teleport 到 body，原本统一 z-50：谁盖住谁完全取决于 DOM 插入顺序。
 * 页面被 keep-alive 恢复、或弹窗先后挂载顺序变化时，顺序会反转——典型现象是从
 * Tab 商品列表弹窗里打开到货监控/价格监控，监控弹窗反而被列表弹窗盖在下面。
 *
 * 这里改成显式层级栈：弹窗打开时入栈，层级 = 基础值 + 栈内位置，最后打开的永远在最上层；
 * 关闭/离开页面时出栈，层级随之回落，不会无限增长。
 */
const BASE_Z_INDEX = 50
const STEP = 10

/** 当前可见的弹窗（按打开顺序），所有 Dialog 实例共享 */
const openLayers = ref<symbol[]>([])

export const useDialogLayer = () => {
  const id = Symbol('dialog-layer')

  const zIndex = computed(() => {
    const index = openLayers.value.indexOf(id)
    return index < 0 ? BASE_Z_INDEX : BASE_Z_INDEX + (index + 1) * STEP
  })

  /** 入栈：已经在栈里就不动，避免重复触发打乱顺序 */
  const acquire = () => {
    if (!openLayers.value.includes(id)) {
      openLayers.value = [...openLayers.value, id]
    }
  }

  /** 出栈：关闭或页面离开缓存时调用 */
  const release = () => {
    if (openLayers.value.includes(id)) {
      openLayers.value = openLayers.value.filter(item => item !== id)
    }
  }

  return { zIndex, acquire, release }
}
