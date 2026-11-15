/**
 * 账号密码登录
 * POST /api/accounts/login
 *
 * 用手机号 + 密码直接向一手换取 uid / token，省掉「抓包粘贴」这一步。
 * 设备信息随机生成（Android App 通道）；同一手机号已有账号时沿用它的设备，
 * 只更新 token / 密码 / 快照，不新增记录。
 */

import { readBody } from 'h3'
import { extractYishouDevice, loginYishouByPassword } from '@core'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'
import {
  createAccount,
  getAccountByPhone,
  updateAccount,
  type AccountInput,
} from '../../utils/accountStore'
import { toAccountView } from '../../utils/accountMask'
import { getRuntimeSettings } from '../../utils/settingsStore'

export default defineEventHandler(async (event) => {
  try {
    const currentUser = getCurrentUser(event)
    if (!currentUser) {
      return createErrorResponse('UNAUTHORIZED', '请先登录')
    }

    const body = await readBody(event)
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
    let password = typeof body?.password === 'string' ? body.password : ''

    if (!phone) {
      return createErrorResponse('INVALID_PARAMS', '请输入手机号')
    }
    if (phone.length > 40 || password.length > 128) {
      return createErrorResponse('INVALID_PARAMS', '手机号或密码长度不正确')
    }

    const existing = getAccountByPhone(currentUser.username, phone)

    // 列表里的「登录」按钮不带密码：复用账号已保存的密码重登
    if (!password) {
      password = existing?.password ?? ''
      if (!password) {
        return createErrorResponse(
          'INVALID_PARAMS',
          '该账号还没有保存密码，请手动输入密码登录'
        )
      }
    }

    // 同一账号固定一台设备：老账号沿用上次快照里的 udid / 机型，避免设备画像漂移
    const device = extractYishouDevice(existing?.requestProfile?.params ?? null) ?? undefined

    const settings = getRuntimeSettings()
    const result = await loginYishouByPassword({
      phone,
      password,
      device,
      proxyUrl: settings.proxyUrl,
      proxyEnabled: settings.proxyEnabled ? '1' : '0',
    })

    if (!result.ok) {
      console.warn(`[Accounts] 密码登录失败（${phone.slice(0, 3)}****）：${result.message}`)
      return createErrorResponse(result.reason, result.message)
    }

    // 密码按用户选择存明文；title / remark 只在显式传入时覆盖
    const input: AccountInput = {
      phone,
      password,
      uin: result.uid,
      token: result.token,
      requestProfile: result.profile,
      ...(typeof body?.title === 'string' ? { title: body.title.trim() } : {}),
      ...(typeof body?.remark === 'string' ? { remark: body.remark.trim() } : {}),
    }

    const account = existing
      ? updateAccount(existing.id, input)
      : createAccount(currentUser.username, input)

    if (!account) {
      return createErrorResponse('UNKNOWN_ERROR', '登录成功但保存账号失败，请稍后重试')
    }

    return createSuccessResponse({ account: toAccountView(account), created: !existing })
  } catch (error) {
    console.error('[Accounts] 密码登录异常:', error)
    return createErrorResponse('UNKNOWN_ERROR', '登录失败，请稍后重试')
  }
})
