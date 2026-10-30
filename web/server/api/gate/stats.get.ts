/**
 * 全局请求闸门状态
 * GET /api/gate/stats
 *
 * 返回各桶（登录账号 / 匿名）的排队情况：等待中的任务、距下一个令牌就绪的时间、
 * 累计放行与超时次数。只对后台监控任务生效，用户手动操作不经过闸门。
 */

import { getGateStats } from '@core'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const currentUser = getCurrentUser(event)
  if (!currentUser) {
    return createErrorResponse('UNAUTHORIZED', '请先登录')
  }

  return createSuccessResponse(getGateStats())
})
