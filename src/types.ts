/**
 * 购物助手 - 核心类型定义
 */

// ==================== 平台通用类型 ====================

/**
 * 支持的平台类型（首期仅支持一手）
 */
export type Platform = 'yishou' | 'jd' | 'pdd';

/**
 * 库存查询请求参数
 */
export interface StockCheckRequest {
  /** 平台类型 */
  platform: Platform;
  /** 商品ID（一手平台对应 goods_id） */
  productId: string;
  /** 可选的商品规格（颜色+尺码） */
  sku?: string;
}

/**
 * 库存查询结果
 */
export interface StockCheckResult {
  /** 平台类型 */
  platform: Platform;
  /** 商品ID */
  productId: string;
  /** 商品名称 */
  productName: string;
  /** 商品货号 */
  productNo: string;
  /** 商品规格 */
  sku?: string;
  /** 是否有货 */
  inStock: boolean;
  /** 价格 */
  price: number;
  /** 商品链接 */
  productUrl: string;
  /** 商品主图 */
  productImage: string;
  /** 状态描述信息 */
  message: string;
}

// ==================== 一手平台专用类型 ====================

/**
 * 一手平台 API 响应
 */
export interface YishouGoodsResponse {
  /** 响应码，"200" 表示成功 */
  code: string;
  /** 响应消息 */
  msg: string;
  /** 商品数据 */
  data: YishouGoodsData;
}

/**
 * 一手商品数据（精简版，仅包含需要的字段）
 */
export interface YishouGoodsData {
  /** 商品ID */
  goods_id: string;
  /** 商品货号 */
  goods_no: string;
  /** 商品名称 */
  goods_name: string;
  /** 拿货价 */
  shop_price: string;
  /** 商品缩略图 */
  goods_thumb: string;
  /** 商品状态：1-正常，2-下架 */
  goods_status: string;
  /** 是否在售：1-在售，0-停售 */
  is_on_sale: string;
  /** 是否缺货：1-缺货，0-有货 */
  is_stockout: string;
  /** 购买状态：1-可购买，2-已售罄，3-已下架 */
  buy_status: string;
  /** 颜色（可能为空） */
  color: string;
  /** 尺码（可能为空） */
  size: string;
  /** 下架提示信息 */
  remind_off_sale: string;
}

/**
 * 一手收藏夹商品数据
 */
export interface YishouCollectionGoodsData {
  /** 商品ID */
  goods_id: string;
  /** 商品货号 */
  goods_no: string;
  /** 商品名称 */
  goods_name: string;
  /** 品牌名称 */
  brand_name: string;
  /** 拿货价 */
  shop_price: string;
  /** 商品缩略图 */
  goods_thumb: string;
  /** 商品主图 */
  goods_img: string;
  /** 商品状态：1-正常，2-下架 */
  goods_status: string;
  /** 是否在售：1-在售，0-停售 */
  is_on_sale: string;
  /** 是否缺货：1-缺货，0-有货 */
  is_stockout: string;
  /** 是否补货：1-补货中，2-未补货 */
  is_replenish: string;
  /** 收藏ID */
  collect_id: string;
  /** 市场名称 */
  one_market_name: string;
  /** 7日销量 */
  sales_of_7: number;
  /** 商品视频URL */
  video_url: string;
}

/**
 * 一手收藏夹 API 响应
 */
export interface YishouCollectionResponse {
  /** 商品数据列表 */
  data: YishouCollectionGoodsData[];
  /** 总数量 */
  total: number;
  /** 总页数 */
  total_page: number;
  /** 当前页码 */
  page: number;
}

/**
 * 收藏夹商品库存查询结果
 */
export interface CollectionStockResult {
  /** 平台类型 */
  platform: Platform;
  /** 商品ID */
  productId: string;
  /** 商品名称 */
  productName: string;
  /** 品牌名称 */
  brandName: string;
  /** 商品货号 */
  productNo: string;
  /** 是否有货 */
  inStock: boolean;
  /** 价格 */
  price: number;
  /** 商品链接 */
  productUrl: string;
  /** 商品主图 */
  productImage: string;
  /** 市场名称 */
  marketName: string;
  /** 7日销量 */
  salesOf7: number;
  /** 状态描述信息 */
  message: string;
  /** 收藏ID */
  collectId: string;
}

/**
 * 收藏夹库存查询总结果
 */
export interface CollectionStockCheckResult {
  /** 有货商品列表 */
  inStockItems: CollectionStockResult[];
  /** 无货商品列表 */
  outOfStockItems: CollectionStockResult[];
  /** 总数量 */
  total: number;
  /** 有货数量 */
  inStockCount: number;
  /** 无货数量 */
  outOfStockCount: number;
}

// ==================== 错误类型 ====================

/**
 * 库存查询错误类型
 */
export enum StockCheckErrorType {
  /** 平台不支持 */
  PLATFORM_NOT_SUPPORTED = 'PLATFORM_NOT_SUPPORTED',
  /** 商品不存在 */
  PRODUCT_NOT_FOUND = 'PRODUCT_NOT_FOUND',
  /** 网络请求失败 */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** API 响应错误 */
  API_ERROR = 'API_ERROR',
  /** 未知错误 */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * 库存查询错误
 */
export class StockCheckError extends Error {
  constructor(
    public readonly type: StockCheckErrorType,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'StockCheckError';
  }
}
