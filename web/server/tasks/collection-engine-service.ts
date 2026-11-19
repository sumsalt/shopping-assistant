/**
 * 共享收藏夹监控引擎的 server 层单例封装
 *
 * 职责：
 * - 持有唯一的 CollectionMonitorEngine 实例；
 * - 从运行设置里解析「收藏夹监控专用账号」的带凭证 config；
 * - **收藏夹全权托管**：任务只说「要监控哪个商品」，加收藏 / 删收藏都走这里；
 * - 有账号且有订阅时启动引擎；账号变更 / 删除时重启或停止。
 *
 * 任务层因此完全不接触收藏夹账号与收藏条目 ID，只保留「下单账号」。
 */

import {
  addProductToCollection,
  checkCollectionStock,
  removeProductFromCollection,
  CollectionMonitorEngine,
  runWithGateContext,
  type CollectionAccountConfig,
} from '@core'
import { getRuntimeSettings } from '../utils/settingsStore'
import { getAccount } from '../utils/accountStore'
import { resolveAdapterConfigForAccount } from '../utils/adapterConfig'
import { createCollectionIndex, type CollectionIndexHandle } from './collection-index'

/** 固定页大小：与引擎一致 */
const PAGE_SIZE = 20
/** 全量翻页的最大页数，防止异常情况下无限翻 */
const PAGE_LIMIT = 50
/** 全量索引有效期：期内后续商品命中缓存，不再各自翻页 */
const INDEX_TTL_MS = 10_000

const engine = new CollectionMonitorEngine()

/** 当前引擎使用的账号 ID（用于检测账号变更） */
let activeAccountId = ''

/**
 * 恢复期标志：服务重启时任务逐个恢复，若第一个任务注册完就拉起引擎，
 * 其余任务尚未订阅，脏数据清理会误删它们的商品。恢复完成后统一启动。
 */
let restoring = false

/** 商品 → 收藏条目 ID（引擎扫到或本次加入的都记在这里） */
const collectIdCache = new Map<string, string>()

/**
 * 按货号串行的收藏操作队列。
 *
 * 背景：重新发起（原地重建）时，老任务 abort → releaseCollected 把商品移出收藏夹，
 * 新任务几乎同时 ensureCollected 想把它加回来。两者若并发交错，可能出现「加回后才落地移除」
 * 或「查找命中旧缓存而未真正加回」，最终商品不在收藏夹、checkCount 永远 0。
 * 用 per-货号队列保证同一商品的加/移除严格按调用顺序执行，彻底消除该竞态。
 */
const collectOpQueue = new Map<string, Promise<unknown>>()
const enqueueCollectOp = <T>(productNo: string, op: () => Promise<T>): Promise<T> => {
  const no = String(productNo || '').trim()
  const prev = collectOpQueue.get(no) ?? Promise.resolve()
  const next = prev.catch(() => {}).then(op)
  collectOpQueue.set(no, next)
  void next
    .finally(() => {
      // 仅当队列尾仍是本任务时才清理，避免误删后入队任务的引用
      if (collectOpQueue.get(no) === next) collectOpQueue.delete(no)
    })
    // 原 next 仍交给调用方处理；这里只吞掉 finally 派生链的 rejection，避免 unhandled
    .catch(() => {})
  return next
}

/**
 * 全局「加收藏」串行队列。
 *
 * 一手的 add_goods_collection 是限流敏感的写操作且 skipGate 跳过本地闸门：
 * 进程重启时会批量 restore 几十个收藏夹任务，若各自 ensureCollected 并发加收藏，
 * 会被一手风控返回「操作过于频繁」。这里把真正向一手发出的加收藏请求全局排队，
 * 逐个执行，避免批量恢复时打爆一手。仅包住 add 请求本身（慢 IO），不影响查找。
 */
let addCollectionTail: Promise<unknown> = Promise.resolve()
const ADD_GAP_MS = 300
const enqueueAddCollection = <T>(op: () => Promise<T>): Promise<T> => {
  // 与前一次加收藏之间留间隔，进一步降低一手写接口的频率风控概率
  const next = addCollectionTail.catch(() => {}).then(async () => {
    await new Promise(resolve => setTimeout(resolve, ADD_GAP_MS))
    return op()
  })
  addCollectionTail = next
  void next.catch(() => {})
  return next
}

/**
 * 在收藏夹账号的 gate 上下文里执行操作。
 *
 * 加入/移出收藏是后台自动的写操作，必须走闸门限频（与周期扫描、全量翻页统一节奏）。
 * 手动点击收藏走的是不带 gate 上下文的 API，即使共用同一 client 也不会被限流。
 */
const withCollectionGate = <T>(
  config: CollectionAccountConfig,
  taskId: string,
  op: () => Promise<T>
): Promise<T> =>
  runWithGateContext(
    {
      taskId,
      kind: 'stock',
      accountKey: config.accountKey,
      localAddress: config.adapterConfig.localAddress,
    },
    op
  )

/** 解析收藏夹专用账号凭证 */
const resolveAccountConfig = (): { accountId: string; config: CollectionAccountConfig } | null => {
  const settings = getRuntimeSettings()
  const accountId = String(settings.collectionAccountId || '').trim()
  if (!accountId) return null

  const account = getAccount(accountId)
  if (!account) return null

  const resolved = resolveAdapterConfigForAccount(account)
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
 * 全量加载收藏夹索引：翻完整个收藏夹，构建 productNo -> collectId 映射。
 *
 * 关键点：翻页请求放在收藏夹账号的 gate 上下文里，走 UID 桶 + IP 桶限频，
 * 与引擎扫描、其他后台请求统一节奏。重启时 N 个任务的查找会被索引的
 * singleflight 合并成这一次全量翻页，而不是 N 串各自翻页。
 */
const loadFullCollectionIndex = async (): Promise<Map<string, string>> => {
  const map = new Map<string, string>()
  const resolved = resolveAccountConfig()
  if (!resolved) return map

  const { adapterConfig, accountKey } = resolved.config
  await runWithGateContext(
    {
      taskId: 'collection-index',
      kind: 'stock',
      accountKey,
      localAddress: adapterConfig.localAddress,
    },
    async () => {
      for (let page = 1; page <= PAGE_LIMIT; page++) {
        const result = await checkCollectionStock(
          { platform: 'yishou', page, pageSize: PAGE_SIZE },
          { adapterConfig }
        )
        const items = [...result.inStockItems, ...result.outOfStockItems]
        if (items.length === 0) break
        for (const item of items) {
          const no = String(item.productNo || '').trim()
          if (no && item.collectId) map.set(no, item.collectId)
        }
        if (items.length < PAGE_SIZE) break
      }
    }
  )
  return map
}

/** 收藏夹全量索引：一次翻页填充，TTL 内后续商品命中缓存 */
const collectionIndex: CollectionIndexHandle = createCollectionIndex(
  loadFullCollectionIndex,
  INDEX_TTL_MS
)

/** 翻页查找某商品当前是否已在收藏夹，返回 collectId（走全量索引，命中则零请求） */
const findCollectId = async (productNo: string): Promise<string> => collectionIndex.find(productNo)

/**
 * 确保商品在收藏夹里（幂等）。
 *
 * 已在收藏夹则复用原条目，不重复添加；添加失败抛错，由任务创建流程转为创建失败。
 * 返回 collectId。
 */
export const ensureCollected = (productNo: string): Promise<string> => {
  const no = String(productNo || '').trim()
  if (!no) return Promise.reject(new Error('收藏夹通道需要商品货号（productNo）'))

  // 与 releaseCollected 共用 per-货号队列：重发时先移除、后加回，顺序确定
  return enqueueCollectOp(no, async () => {
    const resolved = resolveAccountConfig()
    if (!resolved) {
      throw new Error('收藏夹监控账号未配置或缺少登录态，请先在「系统配置」里指定账号')
    }

    // 占位：从「加入收藏夹」到「任务订阅」之间，引擎扫到它也不会当脏数据删掉
    engine.reserve(no)

    try {
      const cached = collectIdCache.get(no) || engine.getCollectId(no)
      if (cached) {
        collectIdCache.set(no, cached)
        return cached
      }

      const found = await findCollectId(no)
      if (found) {
        collectIdCache.set(no, found)
        return found
      }

      const added = await enqueueAddCollection(() =>
        withCollectionGate(resolved.config, 'collection-add', () =>
          addProductToCollection(
            { platform: 'yishou', productNo: no },
            { adapterConfig: resolved.config.adapterConfig }
          )
        )
      )
      if (added.collectId) {
        collectIdCache.set(no, added.collectId)
        // 增量写入全量索引：后续同批商品命中缓存，且本商品不会因 TTL 过期被误判为未收藏
        collectionIndex.set(no, added.collectId)
      }
      return added.collectId
    } catch (error) {
      engine.unreserve(no)
      throw error
    }
  })
}

/**
 * 把商品移出收藏夹（幂等）。
 *
 * 清理属于尽力而为：找不到条目、账号失效、商品已被移除都只记日志，不影响任务删除。
 * 与 ensureCollected 共用 per-货号队列；移除成功后同步清掉两层缓存，
 * 避免引擎残留旧 collectId 让下一次 ensureCollected 假命中。
 */
export const releaseCollected = (productNo: string): Promise<void> => {
  const no = String(productNo || '').trim()
  if (!no) return Promise.resolve()

  return enqueueCollectOp(no, async () => {
    const resolved = resolveAccountConfig()
    if (!resolved) {
      console.warn(`[CollectionEngine] 收藏夹账号不可用，跳过清理 ${no}`)
      return
    }

    let collectId = collectIdCache.get(no) || engine.getCollectId(no) || ''
    if (!collectId) {
      try {
        collectId = await findCollectId(no)
      } catch (error) {
        console.warn(
          `[CollectionEngine] 查找收藏条目失败 ${no}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    // 无论是否真的发出移除请求，都先清掉缓存：旧的 collectId 已不可信，
    // 留着只会让后续 ensureCollected 误判「商品已在收藏夹」而跳过真正加回。
    // 全量索引也要清本商品，否则 TTL 期内会假命中「已收藏」。
    collectIdCache.delete(no)
    engine.forgetProduct(no)
    collectionIndex.remove(no)
    if (!collectId || collectId === '0') return

    try {
      await withCollectionGate(resolved.config, 'collection-remove', () =>
        removeProductFromCollection(
          { platform: 'yishou', productNo: no, collectId },
          { adapterConfig: resolved.config.adapterConfig }
        )
      )
    } catch (error) {
      console.warn(
        `[CollectionEngine] 清理收藏失败 ${no}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  })
}

/** 当前是否还有任务订阅（用于「改账号前拦截」） */
export const hasCollectionSubscriptions = (): boolean => engine.size > 0

/**
 * 同步引擎运行状态：
 * - 恢复期不启动，等任务全部恢复完统一拉起；
 * - 有专用账号且当前有订阅 → 启动（账号变了则先停再启）；
 * - 无专用账号 / 无凭证 / 订阅数归零 → 停止。
 */
export const syncCollectionEngine = (): void => {
  if (restoring) return

  const resolved = resolveAccountConfig()

  if (!resolved) {
    if (engine.isRunning) {
      engine.stop()
      activeAccountId = ''
      collectionIndex.clear()
    }
    return
  }

  if (engine.size === 0) {
    if (engine.isRunning) {
      engine.stop()
      activeAccountId = ''
      collectionIndex.clear()
    }
    return
  }

  // 账号变了：停掉旧循环，清掉旧账号的全量索引，用新账号重新加载
  if (engine.isRunning && activeAccountId !== resolved.accountId) {
    engine.stop()
    collectionIndex.clear()
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
        // 不再让引擎自动取消「未订阅」商品的收藏。
        // 原因：新任务从「加入收藏」到「订阅落地」之间，翻页请求要和引擎扫描共用闸门排队，
        // 这段时间商品会被短暂误判成无主脏数据而删掉——等订阅真正生效时商品已不在收藏夹，
        // 引擎再也扫不到，任务就永远停在 0 次检测（本次线上三个收藏夹任务两个因此空转）。
        // 收藏的清理统一交给任务生命周期：到货完成 / 删除时由 finish() 与 onRemove() 调 releaseCollected。
        // 引擎约定：传了 onDirty 就只调它、不走默认的取消收藏；这里给空实现即彻底禁用自动清理。
        onDirty: () => {},
      })
      activeAccountId = resolved.accountId
    } catch (error) {
      console.error('[CollectionEngine] 启动失败:', error)
    }
  }
}

/** 获取引擎实例（供任务订阅 / 注销） */
export const getCollectionEngine = (): CollectionMonitorEngine => engine

/** 进入恢复期：抑制引擎自动启动 */
export const beginCollectionRestore = (): void => {
  restoring = true
}

/** 恢复结束：统一拉起引擎 */
export const endCollectionRestore = (): void => {
  restoring = false
  syncCollectionEngine()
}

/** 服务启动时调用：若有订阅任务（恢复时注册）且有账号，则拉起引擎 */
export const bootstrapCollectionEngine = (): void => {
  syncCollectionEngine()
}
