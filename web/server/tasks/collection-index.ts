/**
 * 收藏夹全量索引（进程内缓存）
 *
 * 背景：进程重启时，几十个收藏夹任务几乎同时恢复，每个任务在订阅前都要确认
 * 「商品是否已在收藏夹」。若各自翻页查收藏夹，就是 N 串重复的全量翻页请求，
 * 既慢又容易触发一手风控。
 *
 * 这个索引把「一次全量翻页的结果」缓存下来（productNo -> collectId）：
 * - singleflight：并发查询合并为一次全量加载，其余调用等同一个 Promise；
 * - TTL：期内后续商品直接命中缓存，不再翻页；
 * - 增量维护：加/删收藏后同步 set/delete，不必整表失效。
 *
 * 纯逻辑、无外部依赖，便于单测。真正的翻页由调用方注入 loader。
 */

export interface CollectionIndexHandle {
  /** 查 collectId；缓存有效时零网络请求 */
  find(productNo: string): Promise<string>
  /** 增量写入（加收藏成功后调用） */
  set(productNo: string, collectId: string): void
  /** 增量删除（移出收藏成功后调用） */
  remove(productNo: string): void
  /** 清空索引（账号变更时调用） */
  clear(): void
}

/**
 * 创建全量索引。
 *
 * @param loader 全量加载器，返回 productNo -> collectId 映射
 * @param ttlMs 缓存有效期
 */
export const createCollectionIndex = (
  loader: () => Promise<Map<string, string>>,
  ttlMs: number
): CollectionIndexHandle => {
  let map = new Map<string, string>()
  let loadedAt = 0
  let inflight: Promise<Map<string, string>> | null = null

  const isFresh = (): boolean => loadedAt > 0 && Date.now() - loadedAt < ttlMs

  const load = (): Promise<Map<string, string>> => {
    if (!inflight) {
      inflight = loader().then(
        result => {
          map = result
          loadedAt = Date.now()
          inflight = null
          return result
        },
        error => {
          // 加载失败不缓存：下次调用重新尝试，且不让失败态污染已有数据
          inflight = null
          throw error
        }
      )
    }
    return inflight
  }

  return {
    async find(productNo: string): Promise<string> {
      const no = String(productNo || '').trim()
      if (!no) return ''
      if (!isFresh()) await load()
      return map.get(no) || ''
    },
    set(productNo: string, collectId: string): void {
      const no = String(productNo || '').trim()
      if (no && collectId) map.set(no, collectId)
    },
    remove(productNo: string): void {
      map.delete(String(productNo || '').trim())
    },
    clear(): void {
      map = new Map()
      loadedAt = 0
      inflight = null
    },
  }
}
