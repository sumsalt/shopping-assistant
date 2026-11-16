import type { ApiResponse } from '@/types'

/** 添加到收藏夹的返回数据 */
interface AddCollectionData {
  collectId: string
}

/** 收藏结果：页面据此决定按钮状态 */
export interface AddCollectionOutcome {
  ok: boolean
  /** 一手返回的收藏条目 ID；服务端判定「已收藏」时拿不到 */
  collectId?: string
  /** 该商品本来就在收藏夹里 */
  duplicate?: boolean
}

/**
 * 一手 collect_id 是否表示「已收藏」
 *
 * 接口用 `"0"` 表示未收藏、真实数字表示收藏条目 ID；undefined 表示接口没返回
 * （老记录或未登录），按「未知」处理，不要当成未收藏去误导展示。
 */
export const isCollectedId = (collectId?: string | null): boolean =>
  Boolean(collectId) && String(collectId) !== '0'

/**
 * 添加到一手收藏夹
 *
 * 只对「当前账号」生效（服务端不从请求里取账号）。已收藏时服务端返回
 * DUPLICATE，这里按「已收藏」处理，把按钮置成已收藏态而不是弹错误。
 *
 * 不额外请求收藏列表：列表/详情接口本身就会返回 collect_id，页面拿到的
 * 状态直接写回本地记录即可。
 */
export const useCollectionAdd = () => {
  const toast = useToast()
  /** 正在提交的商品货号，用于按钮 loading / 防重复点击 */
  const addingNo = ref('')

  const addToCollection = async (productNo?: string): Promise<AddCollectionOutcome> => {
    const no = String(productNo ?? '').trim()
    if (!no) {
      toast.error('缺少商品货号，无法收藏')
      return { ok: false }
    }
    if (addingNo.value) return { ok: false }

    addingNo.value = no
    try {
      const response = await $fetch<ApiResponse<AddCollectionData>>('/api/collection/add', {
        method: 'POST',
        body: { productNo: no },
      })

      if (!response.success) {
        if (response.error?.code === 'DUPLICATE') {
          toast.warning('该商品已在一手收藏夹里')
          return { ok: true, duplicate: true }
        }
        toast.error(response.error?.message || '收藏失败')
        return { ok: false }
      }

      toast.success('已加入一手收藏夹')
      return { ok: true, collectId: response.data?.collectId }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '网络请求失败')
      return { ok: false }
    } finally {
      addingNo.value = ''
    }
  }

  return {
    addingNo,
    addToCollection,
  }
}
