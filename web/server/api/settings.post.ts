/**
 * 保存运行设置（目前是代理）
 * POST /api/settings
 */

import { readBody } from 'h3'
import { createSuccessResponse, createErrorResponse } from '../utils/response'
import { getCurrentUser } from '../utils/session'
import { saveRuntimeSettings } from '../utils/settingsStore'
import { getAccount } from '../utils/accountStore'
import { hasProfileCredential } from '@core'
import { syncCollectionEngine } from '../tasks/collection-engine-service'

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

    const input: { proxyUrl?: string; proxyEnabled?: boolean; collectionAccountId?: string } = {}
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
    if (body.collectionAccountId !== undefined) {
      if (typeof body.collectionAccountId !== 'string') {
        return createErrorResponse('INVALID_PARAMS', '收藏夹账号格式错误')
      }
      const accountId = body.collectionAccountId.trim()
      if (accountId) {
        const account = getAccount(accountId)
        if (!account) {
          return createErrorResponse('INVALID_PARAMS', '收藏夹账号不存在')
        }
        if (!hasProfileCredential(account.requestProfile)) {
          return createErrorResponse('INVALID_PARAMS', '收藏夹账号缺少登录态（uid/token），请先在账号管理抓包登录')
        }
      }
      input.collectionAccountId = accountId
    }

    const saved = saveRuntimeSettings(input)
    // 收藏夹账号变更：立即同步共享引擎（停旧 / 启新）
    if (input.collectionAccountId !== undefined) syncCollectionEngine()
    return createSuccessResponse(saved)
  } catch (error) {
    console.error('[Settings] 保存运行设置失败:', error)
    return createErrorResponse('UNKNOWN_ERROR', '保存失败')
  }
})
