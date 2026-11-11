/**
 * 保存运行设置（目前是代理）
 * POST /api/settings
 */

import { readBody } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../utils/response'
import { getCurrentUser } from '../utils/session'
import { saveRuntimeSettings } from '../utils/settingsStore'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const body = await readBody(event)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return createErrorResponse('INVALID_PARAMS', '参数格式错误')
    }

    const input: { proxyUrl?: string; proxyEnabled?: boolean } = {}
    if (body.proxyUrl !== undefined) {
      if (typeof body.proxyUrl !== 'string' || body.proxyUrl.length > 2048) {
        return createErrorResponse('INVALID_PARAMS', '代理地址格式错误')
      }
      input.proxyUrl = body.proxyUrl
    }
    if (body.proxyEnabled !== undefined) {
      if (typeof body.proxyEnabled !== 'boolean') {
        return createErrorResponse('INVALID_PARAMS', '代理开关格式错误')
      }
      input.proxyEnabled = body.proxyEnabled
    }

    return createSuccessResponse(saveRuntimeSettings(input))
  } catch (error) {
    console.error('[Settings] 保存运行设置失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '保存失败')
  }
})
