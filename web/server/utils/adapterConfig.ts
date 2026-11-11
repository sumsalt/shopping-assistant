/**
 * 服务端解析「一手适配器配置」
 *
 * 账号快照是服务端状态（accounts 表 + 当前账号标记），前端不再回传 uid/token
 * 或整份抓包参数：所有业务接口按登录用户取当前账号，再叠加全局代理。
 *
 * 纯组装逻辑在 @core（src/adapter-config.ts），这里只负责读库与注入代理。
 */

import type { AdapterConfig } from '@core'
import { buildAdapterConfigFromProfile, hasProfileCredential } from '@core'
import { getActiveAccount, type AccountRecord } from './accountStore'
import { getRuntimeSettings } from './settingsStore'

/** 当前账号 + 全局代理 → 最终配置 */
export interface ResolvedAdapterConfig {
  config: AdapterConfig
  /** 命中的账号；未选账号时为 null */
  account: AccountRecord | null
  /** 是否具备登录态（uid + token 都在） */
  hasCredential: boolean
}

/**
 * 按登录用户解析适配器配置
 *
 * 这是所有业务接口的唯一入口：路由不再接收前端传来的账号参数。
 *
 * @param username 登录用户名
 * @param needAuth 是否需要登录态；false 时剔除 uid/token 走匿名桶
 */
export const resolveAdapterConfigForUser = (
  username: string,
  needAuth: boolean
): ResolvedAdapterConfig => {
  const account = getActiveAccount(username)
  const config = buildAdapterConfigFromProfile(account?.requestProfile, needAuth)

  const settings = getRuntimeSettings()
  if (settings.proxyUrl) {
    config.proxyUrl = settings.proxyUrl
  }
  config.proxyEnabled = settings.proxyEnabled ? '1' : '0'

  // 判断「能否登录」以账号的原始快照为准（匿名配置里已经删掉了 uid/token）
  const hasCredential = account?.requestProfile
    ? hasProfileCredential(account.requestProfile)
    : Boolean(account?.uin && account.token)

  return { config, account, hasCredential }
}
