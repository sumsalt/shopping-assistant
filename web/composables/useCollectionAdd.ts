import type { ApiResponse } from '@/types'

/** 添加到收藏夹的返回数据 */
interface AddCollectionData {
  collectId: string
}

/**
 * 添加到一手收藏夹
 *
 * 只对「当前账号」生效（服务端不从请求里取账号）。已收藏时服务端返回
 * DUPLICATE，这里按「已收藏」处理，把按钮置成已收藏态而不是弹错误。
 *
 * 状态只保留在本次页面会话里：不额外请求收藏列表，避免为了一个图标
 * 拉一次全量收藏夹；刷新页面后按钮回到未收藏，重复点击会得到官方提示。
 */
export const useCollectionAdd = () => {
  const toast = useToast()
  /** 正在提交的商品货号，用于按钮 loading / 防重复点击 */
  const addingNo = ref('')
  /** 本次会话里已确认收藏的货号 */
  const collectedNos = reactive(new Set<string>())

  const isCollected = (productNo?: string): boolean =>
    Boolean(productNo) && collectedNos.has(String(productNo))

  const addToCollection = async (productNo?: string): Promise<boolean> => {
    const no = String(productNo ?? '').trim()
    if (!no) {
      toast.error('缺少商品货号，无法收藏')
      return false
    }
    if (addingNo.value) return false

    addingNo.value = no
    try {
      const response = await $fetch<ApiResponse<AddCollectionData>>('/api/collection/add', {
        method: 'POST',
        body: { productNo: no },
      })

      if (!response.success) {
        if (response.error?.code === 'DUPLICATE') {
          collectedNos.add(no)
          toast.warning('该商品已在一手收藏夹里')
          return false
        }
        toast.error(response.error?.message || '收藏失败')
        return false
      }

      collectedNos.add(no)
      toast.success('已加入一手收藏夹')
      return true
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '网络请求失败')
      return false
    } finally {
      addingNo.value = ''
    }
  }

  return {
    addingNo,
    isCollected,
    addToCollection,
  }
}
