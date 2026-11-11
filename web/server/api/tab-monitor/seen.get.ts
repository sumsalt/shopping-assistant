/**
 * 查询 Tab 监控任务累计记录的商品 API
 * GET /api/tab-monitor/seen?taskId=xxx&offset=0&limit=50
 *
 * 按首次发现时间倒序返回，用于任务卡片上的「查看累计商品」。
 * 只返回当前用户自己的任务。
 */

import type { TabSeenProduct } from '@core'
import { tabTasks, type TabTaskRecord } from '../../tasks/tab'
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import { listTasks } from '../../utils/taskStore'
import { listBlacklistedSupplyIds } from '../../utils/shopBlacklistStore'

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

    // 优先取内存中的实时任务，进程重启后从数据库取
    let task: TabTaskRecord | undefined = tabTasks.getLive(taskId)
    if (!task || task.userId !== currentUser.username) {
      task = listTasks<TabTaskRecord>('tab', currentUser.username).find(
        item => item.id === taskId
      )
    }

    if (!task || task.userId !== currentUser.username) {
      return createErrorResponse('NOT_FOUND', '任务不存在')
    }

    // 老任务只有 ID 列表，补成没有名称的记录，保证至少能看到记录数
    const products: TabSeenProduct[] = task.seenProducts?.length
      ? task.seenProducts
      : (task.seenProductIds ?? []).map(productId => ({
          productId,
          productName: '',
          price: 0,
          firstSeenAt: new Date(task!.createdAt).toISOString(),
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
    const blacklisted = new Set(listBlacklistedSupplyIds(currentUser.username))
    const visibleProducts =
      blacklisted.size > 0
        ? filledProducts.filter(item => !item.supplyId || !blacklisted.has(item.supplyId))
        : filledProducts

    // 按首次发现时间倒序（同一轮发现的保持原有顺序）
    const sorted = [...visibleProducts].sort(
      (a, b) => new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime()
    )

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
      tabName: task.tabName,
      total: sorted.length,
      offset,
      limit,
      hasMore: offset + limit < sorted.length,
      items,
    })
  } catch (error: unknown) {
    console.error('查询 Tab 累计商品失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return createErrorResponse('UNKNOWN_ERROR', errorMessage)
  }
})
