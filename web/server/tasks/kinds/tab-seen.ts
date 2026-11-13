/**
 * Tab 累计商品的可见性
 *
 * 抓取阶段会把黑名单店铺的商品直接丢掉，但「先记录、后拉黑」的历史记录
 * 仍留在 state.seenProducts 里。卡片统计（project）与「累计商品」弹窗
 * （seen 接口）必须用同一套过滤，否则外层数字会永远大于里层。
 */

export interface SeenProductLike {
  supplyId?: string
}

/** 去掉黑名单店铺的商品；没有 supplyId 的老记录保留（无法判断归属） */
export const filterVisibleSeen = <T extends SeenProductLike>(
  items: T[],
  blacklisted: Iterable<string>
): T[] => {
  const blocked = blacklisted instanceof Set ? blacklisted : new Set(blacklisted)
  if (blocked.size === 0) return items
  return items.filter(item => !item.supplyId || !blocked.has(item.supplyId))
}

/** 可见商品数：与 filterVisibleSeen 后的 length 一致 */
export const countVisibleSeen = (
  items: SeenProductLike[],
  blacklisted: Iterable<string>
): number => filterVisibleSeen(items, blacklisted).length
