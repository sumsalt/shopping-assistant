import { ref, reactive } from 'vue'

// Toast 类型定义
export interface ToastOptions {
  type?: 'success' | 'error' | 'warning' | 'info'
  message: string
  description?: string
  duration?: number
  closable?: boolean
  position?: 'top' | 'bottom'
}

// Toast 状态
interface ToastState {
  visible: boolean
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  description: string
  duration: number
  closable: boolean
  position: 'top' | 'bottom'
}

// 默认状态
const defaultState: ToastState = {
  visible: false,
  type: 'info',
  message: '',
  description: '',
  duration: 3000,
  closable: true,
  position: 'top',
}

// 全局 Toast 状态
const toastState = reactive<ToastState>({ ...defaultState })

/**
 * Toast 组合式函数
 * 提供全局 Toast 管理功能
 */
export const useToast = () => {
  /**
   * 显示 Toast
   */
  const show = (options: ToastOptions) => {
    Object.assign(toastState, {
      ...defaultState,
      ...options,
      visible: true,
    })
  }

  /**
   * 显示成功提示
   */
  const success = (message: string, options?: Partial<Omit<ToastOptions, 'type' | 'message'>>) => {
    show({ type: 'success', message, ...options })
  }

  /**
   * 显示错误提示
   */
  const error = (message: string, options?: Partial<Omit<ToastOptions, 'type' | 'message'>>) => {
    show({ type: 'error', message, ...options })
  }

  /**
   * 显示警告提示
   */
  const warning = (message: string, options?: Partial<Omit<ToastOptions, 'type' | 'message'>>) => {
    show({ type: 'warning', message, ...options })
  }

  /**
   * 显示信息提示
   */
  const info = (message: string, options?: Partial<Omit<ToastOptions, 'type' | 'message'>>) => {
    show({ type: 'info', message, ...options })
  }

  /**
   * 关闭 Toast
   */
  const close = () => {
    toastState.visible = false
  }

  return {
    state: toastState,
    show,
    success,
    error,
    warning,
    info,
    close,
  }
}
