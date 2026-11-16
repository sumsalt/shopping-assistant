import type { ApiResponse } from '@/types'

/** 取消收藏的返回数据 */
interface RemoveCollectionData {
  ok: boolean
}

/** 取消收藏结果：页面据此更新本地收藏状态 */
export interface RemoveCollectionOutcome {
  ok: boolean
}

/**
 * 从一手收藏夹移除商品
 *
 * 只对「当前账号」生效（服务端不从请求里取账号）。一手 del 接口按
 * goods_no + collect_id 定位收藏条目，两者缺一不可；goods_id 抓包里也带了，
 * 有就一并传，尽量与真机一致。
 */
export const useCollectionRemove = () => {
  const toast = useToast()
  /** 正在提交的商品货号，用于按钮 loading / 防重复点击 */
  const removingNo = ref('')

  const removeFromCollection = async (
    productNo?: string,
    productId?: string,
    collectId?: string
  ): Promise<RemoveCollectionOutcome> => {
    const no = String(productNo ?? '').trim()
    const cid = String(collectId ?? '').trim()
    if (!no || !cid) {
      toast.error('缺少商品信息，无法取消收藏')
      return { ok: false }
    }
    if (removingNo.value) return { ok: false }

    removingNo.value = no
    try {
      const response = await $fetch<ApiResponse<RemoveCollectionData>>('/api/collection/remove', {
        method: 'POST',
        body: {
          productNo: no,
          productId: productId ? String(productId) : undefined,
          collectId: cid,
        },
      })

      if (!response.success) {
        toast.error(response.error?.message || '取消收藏失败')
        return { ok: false }
      }

      toast.success('已从一手收藏夹移除')
      return { ok: true }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '网络请求失败')
      return { ok: false }
    } finally {
      removingNo.value = ''
    }
  }

  return {
    removingNo,
    removeFromCollection,
  }
}
