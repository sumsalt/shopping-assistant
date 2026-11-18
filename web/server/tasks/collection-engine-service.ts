/**
 * 共享收藏夹监控引擎的 server 层单例封装
 *
 * 职责：
 * - 持有唯一的 CollectionMonitorEngine 实例；
 * - 从运行设置里解析「收藏夹监控专用账号」的带凭证 config；
 * - 有账号且有订阅时启动引擎；账号变更 / 删除时重启或停止；
 * - 任务 create/delete/restore 通过这里订阅 / 注销商品。
 *
 * 引擎自身不 sleep，翻页请求带登录态进 UID 桶，由闸门控制节奏。
 */

import { CollectionMonitorEngine, type CollectionAccountConfig } from '@core'
import { getRuntimeSettings } from '../utils/settingsStore'
import { getAccount } from '../utils/accountStore'
import { resolveAdapterConfigForAccount } from '../utils/adapterConfig'

const engine = new CollectionMonitorEngine()

/** 当前引擎使用的账号 ID（用于检测账号变更） */
let activeAccountId = ''

/** 解析收藏夹专用账号凭证 */
const resolveAccountConfig = (): { accountId: string; config: CollectionAccountConfig } | null => {
  const settings = getRuntimeSettings()
  const accountId = String(settings.collectionAccountId || '').trim()
  if (!accountId) return null

  const account = getAccount(accountId)
  if (!account) return null

  const resolved = resolveAdapterConfigForAccount(account, true)
  if (!resolved.hasCredential || !resolved.config.uid) return null

  return {
    accountId,
    config: {
      platform: 'yishou',
      adapterConfig: resolved.config,
      accountKey: resolved.config.uid,
    },
  }
}

/**
 * 同步引擎运行状态：
 * - 有专用账号且当前有订阅 → 启动（账号变了则先停再启）
 * - 无专用账号 / 无凭证 → 停止
 * - 订阅数归零 → 停止（省得空转）
 *
 * 供设置保存后、任务增删后调用。
 */
export const syncCollectionEngine = (): void => {
  const resolved = resolveAccountConfig()

  if (!resolved) {
    if (engine.isRunning) {
      engine.stop()
      activeAccountId = ''
    }
    return
  }

  if (engine.size === 0) {
    if (engine.isRunning) {
      engine.stop()
      activeAccountId = ''
    }
    return
  }

  // 账号变了：停掉旧循环，用新账号启动
  if (engine.isRunning && activeAccountId !== resolved.accountId) {
    engine.stop()
  }

  if (!engine.isRunning) {
    try {
      engine.start(resolved.config, {
        log: (message, level = 'info') => {
          const line = `[CollectionEngine] ${message}`
          if (level === 'error') console.error(line)
          else if (level === 'warn') console.warn(line)
          else console.log(line)
        },
      })
      activeAccountId = resolved.accountId
    } catch (error) {
      console.error('[CollectionEngine] 启动失败:', error)
    }
  }
}

/** 获取引擎实例（供任务订阅 / 注销） */
export const getCollectionEngine = (): CollectionMonitorEngine => engine

/** 服务启动时调用：若有订阅任务（恢复时注册）且有账号，则拉起引擎 */
export const bootstrapCollectionEngine = (): void => {
  syncCollectionEngine()
}
