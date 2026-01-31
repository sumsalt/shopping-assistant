import { h, render, type Component } from 'vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'

// 确认弹窗选项
interface ConfirmOptions {
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  type?: 'warning' | 'info' | 'danger' | 'success'
  showIcon?: boolean
}

// 确认弹窗结果
interface ConfirmResult {
  confirmed: boolean
}

/**
 * 确认弹窗组合式函数
 * @returns 包含 confirm 方法的对象
 */
export const useConfirmDialog = () => {
  /**
   * 显示确认弹窗
   * @param options 弹窗选项
   * @returns Promise<boolean> - 用户是否确认
   */
  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // 创建容器
      const container = document.createElement('div')
      document.body.appendChild(container)

      // 定义确认处理函数
      const handleConfirm = () => {
        resolve(true)
        cleanup()
      }

      // 定义取消处理函数
      const handleCancel = () => {
        resolve(false)
        cleanup()
      }

      // 清理函数
      const cleanup = () => {
        render(null, container as any)
        if (container.parentNode) {
          container.parentNode.removeChild(container)
        }
      }

      // 创建 Vue 实例
      const vnode = h(
        ConfirmDialog as Component,
        {
          show: true,
          ...options,
          onConfirm: handleConfirm,
          onCancel: handleCancel,
          'onUpdate:show': (value: boolean) => {
            if (!value) {
              handleCancel()
            }
          },
        }
      )

      render(vnode, container as any)
    })
  }

  /**
   * 显示警告确认弹窗（带警告图标）
   */
  const warning = (message: string, title?: string): Promise<boolean> => {
    return confirm({
      title: title || '提示',
      message,
      type: 'warning',
    })
  }

  /**
   * 显示危险操作确认弹窗（带危险图标，确认按钮为红色）
   */
  const danger = (message: string, title?: string): Promise<boolean> => {
    return confirm({
      title: title || '警告',
      message,
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消',
    })
  }

  /**
   * 显示信息确认弹窗（带信息图标）
   */
  const info = (message: string, title?: string): Promise<boolean> => {
    return confirm({
      title: title || '提示',
      message,
      type: 'info',
    })
  }

  return {
    confirm,
    warning,
    danger,
    info,
  }
}
