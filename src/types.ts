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

// ==================== SKU 相关类型 ====================

/**
 * 一手 SKU 项数据（单个尺码）
 */
export interface YishouSkuItem {
  /** 尺码名称 */
  size: string;
  /** SKU ID */
  sku: string;
  /** 库存数量 */
  stock: string;
  /** 可售库存 */
  sale_stock: string;
  /** 排序 */
  sort: string;
  /** SKU 标签 */
  sku_tag: string;
  /** 是否显示库存 */
  is_show_stock: string;
  /** 是否现货 */
  is_stock_now: string;
}

/**
 * 一手颜色属性数据（包含多个尺码）
 */
export interface YishouColorAttribute {
  /** 颜色名称 */
  color: string;
  /** 颜色ID */
  color_id: string;
  /** 颜色卡图片 */
  color_card: string;
  /** 颜色缩略图 */
  card_thumb: string;
  /** 是否推荐 */
  is_recommend: string;
  /** 该颜色下的所有尺码 SKU */
  item: YishouSkuItem[];
}

/**
 * 一手商品详情 API 响应（cart_detail 接口）
 */
export interface YishouCartDetailResponse {
  /** 响应码 */
  code: string;
  /** 响应消息 */
  msg: string;
  /** 商品详情数据 */
  data: YishouCartDetailData;
}

/**
 * 一手商品详情数据
 */
export interface YishouCartDetailData {
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
  /** 销量 */
  sales: string;
  /** 颜色（逗号分隔） */
  color: string;
  /** 尺码（逗号分隔） */
  size: string;
  /** 是否补货中 */
  is_replenish: string;
  /** 颜色尺码属性列表 */
  attribute: YishouColorAttribute[];
  /** 限购数量，-1表示不限购 */
  restriction_number: number;
  /** 限购提示文案 */
  restriction_text: string;
  /** 已购数量 */
  buy_number: number;
}

/**
 * 通用 SKU 信息（转换后）
 */
export interface SkuInfo {
  /** SKU ID */
  skuId: string;
  /** 颜色 */
  color: string;
  /** 颜色ID */
  colorId: string;
  /** 尺码 */
  size: string;
  /** 库存数量 */
  stock: number;
  /** 可售库存 */
  saleStock: number;
  /** 是否有货 */
  inStock: boolean;
  /** 颜色缩略图 */
  colorImage: string;
}

/**
 * 商品 SKU 查询结果
 */
export interface ProductSkuResult {
  /** 平台类型 */
  platform: Platform;
  /** 商品ID */
  productId: string;
  /** 商品名称 */
  productName: string;
  /** 商品货号 */
  productNo: string;
  /** 价格 */
  price: number;
  /** 商品主图 */
  productImage: string;
  /** 商品链接 */
  productUrl: string;
  /** 销量 */
  sales: number;
  /** 可用颜色列表 */
  colors: string[];
  /** 可用尺码列表 */
  sizes: string[];
  /** 所有 SKU 列表 */
  skuList: SkuInfo[];
  /** 有货 SKU 数量 */
  inStockSkuCount: number;
  /** 总 SKU 数量 */
  totalSkuCount: number;
  /** 限购数量，-1表示不限购 */
  restrictionNumber: number;
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
