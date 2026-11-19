/**
 * 全局请求闸门状态
 * GET /api/gate/stats
 *
 * 返回各桶（登录账号 / 匿名）的排队情况：等待中的请求、距下一个令牌就绪的时间、
 * 累计放行与超时次数。闸门是 HTTP 出口的默认属性：所有一手请求都按业务流排队，
 * 仅下单（order.checkout）、登录（auth.login）、手动操作（manual）三个流豁免。
 * 同时附带请求审计快照（各 flow 请求数 / bypass / 失败 / 异常观测），便于排障。
 */

import { getGateStats, getAuditSnapshot } from '@core'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const currentUser = getCurrentUser(event)
  if (!currentUser) {
    return createErrorResponse('UNAUTHORIZED', '请先登录')
  }

  // 保持 gate 字段在顶层（向后兼容），audit 作为附加字段
  return createSuccessResponse({
    ...getGateStats(),
    audit: getAuditSnapshot(),
  })
})
