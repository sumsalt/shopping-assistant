/**
 * Server API 响应工具函数
 */

/**
 * API 响应类型
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

/**
 * 创建成功响应
 */
export const createSuccessResponse = <T>(data: T): ApiResponse<T> => {
  return {
    success: true,
    data,
  }
}

/**
 * 创建错误响应
 */
export const createErrorResponse = (code: string, message: string): ApiResponse<never> => {
  return {
    success: false,
    error: {
      code,
      message,
    },
  }
}

/**
 * 错误码枚举
 */
export const ErrorCode = {
  // 参数错误
  INVALID_PARAMS: 'INVALID_PARAMS',
  MISSING_CONFIG: 'MISSING_CONFIG',

  // 认证 / 权限
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // 业务错误
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  NOT_FOUND: 'NOT_FOUND',
  PLATFORM_NOT_SUPPORTED: 'PLATFORM_NOT_SUPPORTED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  DUPLICATE: 'DUPLICATE',

  // 系统错误
  NETWORK_ERROR: 'NETWORK_ERROR',
  API_ERROR: 'API_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

/**
 * 错误消息映射
 */
export const ErrorMessage: Record<string, string> = {
  [ErrorCode.INVALID_PARAMS]: '参数错误',
  [ErrorCode.MISSING_CONFIG]: '缺少必要的配置信息',
  [ErrorCode.PRODUCT_NOT_FOUND]: '商品不存在',
  [ErrorCode.PLATFORM_NOT_SUPPORTED]: '不支持该平台',
  [ErrorCode.NETWORK_ERROR]: '网络请求失败',
  [ErrorCode.API_ERROR]: 'API 响应错误',
  [ErrorCode.UNKNOWN_ERROR]: '未知错误',
}
