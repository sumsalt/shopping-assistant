/**
 * 查询 Tab 监控任务累计记录的商品 API
 * GET /api/tab-monitor/seen?taskId=xxx&offset=0&limit=50&sort=recent|discount&market=市场名
 *
 * 按首次发现时间倒序返回（sort=discount 可按折扣排），支持按市场筛选。
 * 返回 markets 为当前任务可选的市场列表。只返回当前用户自己的任务。
 */

import type { TabSeenProduct } from '@core'
import { tabService } from '../../tasks/kinds'
import { filterVisibleSeen } from '../../tasks/kinds/tab-seen'
import { TaskApiError } from '../../tasks/engine/types'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { listBlacklistedSupplyIds } from '../../utils/shopStore'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const query = getQuery(event)
    const taskId = String(query.taskId || '').trim()
    if (!taskId) {
      return createErrorResponse(ErrorCode.INVALID_PARAMS, '任务 ID 不能为空')
    }

    // 运行中的任务在内存里，重启后由 restoreAll 从数据库装回 registry，这里只需要一份入口
    const record = tabService.requireOwned(currentUser.username, taskId, '查看')
    const state = record.state

    // 老任务只有 ID 列表，补成没有名称的记录，保证至少能看到记录数
    const products: TabSeenProduct[] = state.seenProducts?.length
      ? state.seenProducts
      : (state.seenProductIds ?? []).map(productId => ({
          productId,
          productName: '',
          price: 0,
          firstSeenAt: record.createdAt.toISOString(),
        }))

    // 老记录没有店铺名：用同一供应商较新记录里的店铺名补齐，避免历史商品显示成「供应商 xxxx」
    const shopNameBySupply = new Map<string, string>()
    for (const item of products) {
      if (item.supplyId && item.shopName && !shopNameBySupply.has(item.supplyId)) {
        shopNameBySupply.set(item.supplyId, item.shopName)
      }
    }
    const filledProducts = products.map(item => {
      if (item.shopName || !item.supplyId) {
        return item
      }
      const shopName = shopNameBySupply.get(item.supplyId)
      return shopName ? { ...item, shopName } : item
    })

    // 店铺黑名单：已经记录过的商品也要隐藏（取消黑名单后会自动恢复显示）
    // 与卡片上的统计共用 filterVisibleSeen，保证外层数字与弹窗总数一致
    const visibleProducts = filterVisibleSeen(
      filledProducts,
      listBlacklistedSupplyIds(currentUser.username)
    )

    // 市场筛选选项：从全量（已排除黑名单）记录里提取，供前端下拉展示。
    // 空市场不进列表；按中文 locale 排序，保证顺序稳定。
    const markets = Array.from(
      new Set(
        visibleProducts
          .map(item => (item.marketName || '').trim())
          .filter(name => name.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, 'zh-CN'))

    // 市场筛选：传具体市场名时只保留该市场的商品；'all' 或空表示全部。
    // 与排序一样在服务端做：先筛后排序再分页，翻页顺序才连续、total 才准确。
    const market = String(query.market || '').trim()
    const filteredProducts =
      market && market !== 'all'
        ? visibleProducts.filter(item => (item.marketName || '').trim() === market)
        : visibleProducts

    // 排序必须在服务端做：全量数据都在内存里，按折扣排完再分页，翻页顺序才连续。
    // 默认按首次发现时间倒序（同一轮发现的保持原有顺序）。
    const sort = String(query.sort || '').trim()
    const byTimeDesc = (a: TabSeenProduct, b: TabSeenProduct) =>
      new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime()

    const sorted = [...filteredProducts]
    if (sort === 'discount') {
      // 折扣比率 = 现价 / 原价（0~1，越小折扣越低、力度越大）。
      // 没有原价或原价不高于现价时视为「无折扣」，排在有折扣商品之后。
      const discountRatio = (item: TabSeenProduct): number | null => {
        if (
          !item.originalPrice ||
          item.originalPrice <= 0 ||
          item.price <= 0 ||
          item.originalPrice <= item.price
        ) {
          return null
        }
        return item.price / item.originalPrice
      }
      sorted.sort((a, b) => {
        const da = discountRatio(a)
        const db = discountRatio(b)
        // 有折扣的排在无折扣前面
        if (da === null && db !== null) return 1
        if (da !== null && db === null) return -1
        // 都有折扣：折数低的（力度大的）在前
        if (da !== null && db !== null && da !== db) return da - db
        // 折扣相同、或都无折扣：按首次发现时间倒序，保证顺序稳定
        return byTimeDesc(a, b)
      })
    } else {
      sorted.sort(byTimeDesc)
    }

    const rawOffset = Number(query.offset)
    const rawLimit = Number(query.limit)
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(200, Math.floor(rawLimit)) : 50

    // 卡片上展示「不带店铺名的商品名」：新记录直接用接口给的短名，
    // 老记录没有该字段时，退化为去掉开头的「【店铺名】」前缀
    const stripShopPrefix = (name: string): string =>
      name.replace(/^\s*【[^】]*】\s*/, '').trim() || name.trim()
    const items = sorted.slice(offset, offset + limit).map(item => ({
      ...item,
      displayName:
        item.shortName?.trim() ||
        stripShopPrefix(item.productName || '') ||
        `商品 ${item.productId}`,
    }))

    return createSuccessResponse({
      taskId,
      tabName: state.tab.name,
      markets,
      /** 未做市场筛选的总数，供「全部」选项展示 */
      totalAll: visibleProducts.length,
      total: sorted.length,
      offset,
      limit,
      hasMore: offset + limit < sorted.length,
      items,
    })
  } catch (error: unknown) {
    if (error instanceof TaskApiError) {
      return createErrorResponse(error.code, error.message)
    }
    console.error('查询 Tab 累计商品失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse('UNKNOWN_ERROR', errorMessage)
  }
})
