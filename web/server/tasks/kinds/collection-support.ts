/**
 * 收藏夹通道的公共支撑逻辑（到货 / 价格任务共用）
 *
 * 收藏夹本身（加收藏 / 删收藏 / 轮询）完全由 collection-engine-service 托管，
 * 任务层只做两件事：
 * - 注册 / 注销共享引擎的订阅；
 * - 解析「下单账号」凭证（任务只存账号 ID，不存凭证）。
 */

import { getOrderAdapter, type AdapterConfig } from '@core'
import { getAccount } from '../../utils/accountStore'
import { resolveAdapterConfigForAccount } from '../../utils/adapterConfig'
import { ErrorCode } from '../../utils/response'
import { TaskApiError } from '../engine/types'
import { getCollectionEngine } from '../collection-engine-service'
import { syncCollectionEngine } from '../collection-engine-service'

/** 下单账号解析结果 */
export interface OrderAccountResolved {
  accountId: string
  adapterConfig: AdapterConfig
}

/**
 * 解析下单账号（账号 ID 在创建时快照进 record.accountId）。
 *
 * 凭证不落盘，运行时按 ID 现取：token 刷新后自动生效，也避免任务里存第二份凭证。
 * 账号不存在 / 无登录态时返回 null，由调用方决定是告警还是拒绝创建。
 */
export const resolveOrderAccount = (accountId?: string): OrderAccountResolved | null => {
  const id = String(accountId || '').trim()
  if (!id) return null

  const account = getAccount(id)
  if (!account) return null

  const resolved = resolveAdapterConfigForAccount(account)
  if (!resolved.hasCredential || !resolved.config.uid) return null

  return { accountId: id, adapterConfig: resolved.config }
}

/** 运行期按下单账号取凭证（取不到返回 null） */
export const resolveOrderCredentials = (accountId?: string): AdapterConfig | null =>
  resolveOrderAccount(accountId)?.adapterConfig ?? null

/**
 * 创建时校验下单账号有收货地址。
 * 查询本身失败（网络 / 风控）不阻断创建，下单时会再校验一次。
 */
export const assertOrderAddress = async (adapterConfig: AdapterConfig): Promise<void> => {
  try {
    const adapter = getOrderAdapter('yishou', adapterConfig)
    if (!adapter) return
    const addresses = await adapter.getAddresses()
    if (!addresses.length) {
      throw new TaskApiError(
        ErrorCode.INVALID_PARAMS,
        '当前账号没有收货地址，请先在 App 添加后再创建'
      )
    }
  } catch (error) {
    if (error instanceof TaskApiError) throw error
  }
}

/** 注册订阅并按需拉起共享引擎 */
export const subscribeCollection = (
  productNo: string,
  handler: (item: import('@core').CollectionStockResult) => void | Promise<void>
): void => {
  getCollectionEngine().subscribe(productNo, handler)
  syncCollectionEngine()
}

/** 注销订阅并同步引擎（无订阅时自动停） */
export const unsubscribeCollection = (productNo: string): void => {
  getCollectionEngine().unsubscribe(productNo)
  syncCollectionEngine()
}
