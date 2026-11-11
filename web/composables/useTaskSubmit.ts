/**
 * 任务提交 / 状态查询
 *
 * 三个创建流程（到货 / Tab / 价格）的 HTTP 编排完全一样：
 * 加载态 → POST → 成功提示 / 失败提示 → 返回结果。
 * 这里只写一次，各 composable 只保留自己的校验与配置组装。
 */

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

export interface SubmitOptions {
  /** 成功后的提示文案，不传则不提示 */
  successMessage?: string
  /** 失败时的兜底文案 */
  failureMessage?: string
  /** 静默提交：批量创建时不逐条弹提示 */
  silent?: boolean
}

export const useTaskSubmit = () => {
  const toast = useToast()
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /** POST 提交，成功返回 data，失败返回 null（错误信息已写入 error 并提示） */
  const submit = async <T>(
    url: string,
    body: Record<string, unknown>,
    options: SubmitOptions = {}
  ): Promise<T | null> => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<T>>(url, { method: 'POST', body })

      if (response.success && response.data) {
        if (options.successMessage && !options.silent) {
          toast.success(options.successMessage)
        }
        return response.data
      }

      const message = response.error?.message || options.failureMessage || '操作失败'
      error.value = message
      if (!options.silent) toast.error(message)
      return null
    } catch (err) {
      // Nuxt $fetch 的错误会把服务端响应体挂在 data 上，优先用它给出更准确的文案
      const responseMessage = (err as { data?: { message?: string } })?.data?.message
      const message = responseMessage || (err instanceof Error ? err.message : '网络请求失败')
      error.value = message
      if (!options.silent) toast.error(message)
      return null
    } finally {
      isLoading.value = false
    }
  }

  /** 查询任务状态，失败静默返回 null（轮询场景不该弹提示） */
  const fetchStatus = async <T>(url: string, taskId: string): Promise<T | null> => {
    try {
      const response = await $fetch<ApiResponse<T>>(url, { query: { taskId } })
      return response.success && response.data ? response.data : null
    } catch {
      return null
    }
  }

  return { isLoading, error, submit, fetchStatus }
}
