/**
 * 读取运行设置
 * GET /api/settings
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response'
import { getCurrentUser } from '../utils/session'
import { getRuntimeSettings } from '../utils/settingsStore'

export default defineEventHandler(async (event) => {
  const currentUser = getCurrentUser(event)
  if (!currentUser) {
    return createErrorResponse('UNAUTHORIZED', '请先登录')
  }

  return createSuccessResponse(getRuntimeSettings())
})
