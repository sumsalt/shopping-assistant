/**
 * 一键唤起一手 App 商品详情。
 *
 * 深链构造、唤起 + 兜底逻辑在 tab 监控和库存详情页都要用，
 * 抽到这里避免两边各写一份（之前 tab 监控就有一份本地副本）。
 *
 * 唤起策略（和一手 App 实测一致）：
 * - 桌面浏览器根本没有 App 可开，直接走 fallback（或什么都不做）；
 * - 手机端设置 location.href 为深链，若 1.5 秒后页面仍是前台，
 *   说明没装 App 或被系统拦截，执行 fallback。
 */
import { ref, onMounted } from 'vue'
import { buildYishouProductLink } from '~/utils/yishou-deeplink'

/** 手机端才可能唤起一手 App，桌面浏览器点了没有 App 可开 */
const detectMobile = (): boolean =>
  /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(navigator.userAgent)

export interface UseYishouApp {
  /** 当前是否为手机端视口 */
  isMobileViewport: Readonly<ReturnType<typeof ref<boolean>>>
  /**
   * 唤起一手 App 到商品详情页。
   * @param productId 一手 goods_id（必需）
   * @param productNo 货号（详情页靠它查 SKU，可选）
   * @param fallback 没唤起成功（桌面端 / 未装 App）时的回调
   */
  openYishouProduct: (
    productId: string,
    productNo?: string,
    fallback?: () => void,
  ) => void
}

export const useYishouApp = (): UseYishouApp => {
  const isMobileViewport = ref(false)

  onMounted(() => {
    isMobileViewport.value = detectMobile()
  })

  const openYishouProduct = (
    productId: string,
    productNo?: string,
    fallback?: () => void,
  ): void => {
    if (!productId) {
      return
    }
    if (!isMobileViewport.value) {
      fallback?.()
      return
    }

    const startedAt = Date.now()
    window.location.href = buildYishouProductLink(productId, productNo)

    window.setTimeout(() => {
      // 页面已转入后台（App 拉起）或点了超 3 秒，说明唤起成功或已超时
      if (document.hidden || Date.now() - startedAt > 3000) {
        return
      }
      fallback?.()
    }, 1500)
  }

  return { isMobileViewport, openYishouProduct }
}
