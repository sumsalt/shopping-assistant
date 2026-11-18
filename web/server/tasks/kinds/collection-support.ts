/**
 * 收藏夹通道的公共支撑逻辑（到货 / 价格任务共用）
 *
 * - 解析设置里的收藏夹专用账号凭证
 * - 创建任务时加入收藏夹、删除/到期时移除
 * - 注册 / 注销共享引擎的订阅
 */

import {
  addProductToCollection,
  removeProductFromCollection,
  type AdapterConfig,
} from '@core'
import { getRuntimeSettings } from '../../utils/settingsStore'
import { getAccount } from '../../utils/accountStore'
import { resolveAdapterConfigForAccount } from '../../utils/adapterConfig'
import { TaskApiError } from '../engine/types'
import { ErrorCode } from '../../utils/response'
import { getCollectionEngine } from '../collection-engine-service'
import { syncCollectionEngine } from '../collection-engine-service'

/** 收藏夹账号解析结果 */
export interface CollectionAccountResolved {
  accountId: string
  adapterConfig: AdapterConfig
}

/**
 * 解析当前配置的收藏夹专用账号（带登录态）。
 * 未配置 / 账号不存在 / 无凭证时抛业务错误，供任务创建时拦截。
 */
export const requireCollectionAccount = (): CollectionAccountResolved => {
  const settings = getRuntimeSettings()
  const accountId = String(settings.collectionAccountId || '').trim()
  if (!accountId) {
    throw new TaskApiError(
      ErrorCode.INVALID_PARAMS,
      '请先在「系统配置 → 收藏夹监控专用账号」里指定账号'
    )
  }
  const account = getAccount(accountId)
  if (!account) {
    throw new TaskApiError(ErrorCode.INVALID_PARAMS, '收藏夹监控账号不存在，请重新指定')
  }
  const resolved = resolveAdapterConfigForAccount(account, true)
  if (!resolved.hasCredential || !resolved.config.uid) {
    throw new TaskApiError(
      ErrorCode.AUTH_REQUIRED,
      '收藏夹监控账号缺少登录态（uid/token），请先在账号管理抓包登录'
    )
  }
  return { accountId, adapterConfig: resolved.config }
}

/**
 * 尝试解析收藏夹账号凭证，失败返回 null（不抛错）。
 * 供删除 / 清理等"账号可能已失效"的场景使用。
 */
export const requireCollectionAccountSafe = (): AdapterConfig | null => {
  try {
    return requireCollectionAccount().adapterConfig
  } catch {
    return null
  }
}

/** 加入收藏夹，返回 collectId */
export const addToCollection = async (productNo: string, adapterConfig: AdapterConfig): Promise<string> => {
  const no = String(productNo || '').trim()
  if (!no) {
    throw new TaskApiError(ErrorCode.INVALID_PARAMS, '收藏夹通道需要商品货号（productNo）')
  }
  const result = await addProductToCollection(
    { platform: 'yishou', productNo: no },
    { adapterConfig }
  )
  return result.collectId
}

/** 从收藏夹移除（忽略「不在收藏夹」类错误，保证清理幂等） */
export const removeFromCollection = async (
  productNo: string,
  collectId: string,
  productId: string | undefined,
  adapterConfig: AdapterConfig
): Promise<void> => {
  const no = String(productNo || '').trim()
  const cid = String(collectId || '').trim()
  if (!no || !cid || cid === '0') return
  try {
    await removeProductFromCollection(
      { platform: 'yishou', productNo: no, collectId: cid, productId },
      { adapterConfig }
    )
  } catch {
    // 商品已被移除 / 账号失效等：清理失败不影响任务删除
  }
}

/** 注册订阅并按需拉起共享引擎 */
export const subscribeCollection = (productNo: string, handler: (item: import('@core').CollectionStockResult) => void | Promise<void>): void => {
  getCollectionEngine().subscribe(productNo, handler)
  syncCollectionEngine()
}

/** 注销订阅并同步引擎（无订阅时自动停） */
export const unsubscribeCollection = (productNo: string): void => {
  getCollectionEngine().unsubscribe(productNo)
  syncCollectionEngine()
}
