/**
 * 前端类型定义
 */

// 用户配置类型
export interface UserConfig {
  uid?: string
  token?: string
  openid?: string
  model: string
  version: string
  version_name: string
  wx_version_name?: string
  proxyUrl?: string
}

// API 响应基础类型
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

// 库存状态枚举
export enum StockStatus {
  Available = 'available',
  Unavailable = 'unavailable',
  Unknown = 'unknown',
}

// 商品信息类型
export interface ProductInfo {
  productNo: string
  name: string
  price: number
  imageUrl: string
  stockStatus: StockStatus
  stockMessage?: string
}

// SKU 信息类型
export interface SkuInfo {
  skuId: string
  productNo: string
  color: string
  size: string
  stock: number
  isAvailable: boolean
  limitQuantity?: number
}

// 商品详情（含 SKU 列表）
export interface ProductDetail {
  productNo: string
  name: string
  price: number
  imageUrl: string
  totalSales: number
  skus: SkuInfo[]
}

// 收藏夹商品
export interface CollectionItem {
  productNo: string
  name: string
  price: number
  imageUrl: string
  stockStatus: StockStatus
  addedTime?: string
}

// 收藏夹查询结果
export interface CollectionResult {
  items: CollectionItem[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// 库存查询参数
export interface StockCheckParams {
  productNo: string
  config: UserConfig
}

// SKU 查询参数
export interface SkuQueryParams {
  productNo: string
  config: UserConfig
}

// 收藏夹查询参数
export interface CollectionQueryParams {
  page: number
  pageSize: number
  config: UserConfig
}

// 分页参数
export interface PaginationParams {
  page: number
  pageSize: number
}

// 配置验证结果
export interface ConfigValidation {
  isValid: boolean
  errors: Record<string, string>
}

// 加载状态
export interface LoadingState {
  isLoading: boolean
  error: string | null
}
