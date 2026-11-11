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
 * 批量库存查询请求参数
 */
export interface BatchStockCheckRequest {
  /** 平台类型 */
  platform: Platform;
  /** 商品ID列表 */
  productIds: string[];
  /** 可选的商品规格列表（与 productIds 一一对应，可选） */
  skus?: string[];
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

/**
 * 批量库存查询结果
 */
export interface BatchStockCheckResult {
  /** 平台类型 */
  platform: Platform;
  /** 成功查询的商品列表 */
  successItems: StockCheckResult[];
  /** 查询失败的商品列表 */
  failedItems: Array<{
    /** 商品ID */
    productId: string;
    /** 错误信息 */
    error: string;
    /** 错误类型 */
    errorType: StockCheckErrorType;
  }>;
  /** 总数量 */
  total: number;
  /** 成功数量 */
  successCount: number;
  /** 失败数量 */
  failedCount: number;
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
  /** 颜色（可能为空） */
  color: string;
  /** 尺码（可能为空） */
  size: string;
  /** 下架提示信息 */
  remind_off_sale: string;
  /** 价格说明（如"拿货价"） */
  shop_price_note?: string;
  /** 单独购买价 */
  alone_price?: string;
  /** 门市价/零售价（仅登录态返回） */
  shoppe_price?: string;
  /** 可领红包列表（仅登录态返回） */
  coupons?: YishouCoupon[];
  /** 新版满减券列表（仅登录态返回） */
  coupons_new?: YishouCouponNew[];
  /** 登录态检查标记（仅登录态返回） */
  check_status?: string;
}

/**
 * 一手红包数据
 */
export interface YishouCoupon {
  /** 红包 ID */
  coupon_id?: string;
  /** 红包类型名称 */
  coupon_type_title?: string;
  /** 红包描述 */
  coupon_title?: string;
}

/**
 * 一手新版满减券数据
 */
export interface YishouCouponNew {
  /** 券 ID */
  coupon_id?: string;
  /** 满减门槛金额 */
  condition_goods_amount?: string;
  /** 减免金额 */
  reduce_amount?: string;
  /** 是否已领取 */
  is_receive?: boolean;
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
  collect_id?: string;
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
 * 一手 H5 Tab 商品列表数据
 */
export interface YishouTabGoodsData {
  /** 商品ID */
  goods_id: string;
  /** 商品货号 */
  goods_no: string;
  /** 商品名称 */
  goods_name: string;
  /** 去掉店铺/品牌名的商品名称（接口可选返回） */
  goods_name_without_brand_name?: string;
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
  /** 商品货号 */
  goods_kh: string;
  /** 市场ID */
  market_id: string;
  /** 一级市场ID */
  market_one_id: string;
  /** 市场名称 */
  one_market_name: string;
  /** 供应商标识 */
  supply_id: string;
  /** 7日销量 */
  sales_of_7: number;
  /** 总销量 */
  sales: number;
  /** 商品视频URL */
  video_url: string;
  /** 商品类型 */
  goods_type: string;
  /** 是否新品 */
  is_new: string;
  /** 是否24H发货 */
  is_shipping_in_24h: string;
  /** 首次销售时间 */
  first_sale_period: string;
  /** 首次销售时间格式化 */
  format_first_sale_time: string;
}

/**
 * 一手 H5 Tab 商品列表 API 响应
 */
export interface YishouTabListResponse {
  /** 商品数据列表 */
  list: YishouTabGoodsData[];
  /** 总数量 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页数量 */
  page_size: number;
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
  /** 去掉店铺/品牌名的商品名称，用于卡片展示 */
  productNameWithoutBrand?: string;
  /** 品牌名称（多数情况下就是店铺名） */
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
  /** 供应商标识（一手 supply_id，用于店铺黑名单过滤） */
  supplyId?: string;
  /** 7日销量 */
  salesOf7: number;
  /** 一手：首次销售期号（接口 first_sale_period），用于分析列表排序 */
  firstSalePeriod?: string;
  /** 一手：上新时间文案，如「7天前上新」 */
  firstSaleText?: string;
  /** 一手：是否新品标记 */
  isNew?: boolean;
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

// ==================== 价格相关类型 ====================

/**
 * 归一化后的红包信息
 */
export interface CouponInfo {
  /** 红包 ID */
  couponId: string;
  /** 红包类型名称 */
  typeTitle: string;
  /** 红包描述 */
  title: string;
}

/**
 * 归一化后的满减券信息
 */
export interface CouponNewInfo {
  /** 券 ID */
  couponId: string;
  /** 满减门槛金额 */
  threshold: number;
  /** 减免金额 */
  reduce: number;
}

/**
 * 商品价格快照
 */
export interface PriceSnapshot {
  /** 平台类型 */
  platform: Platform;
  /** 商品 ID */
  productId: string;
  /** 商品名称 */
  productName: string;
  /** 商品货号 */
  productNo: string;
  /** 商品主图 */
  productImage: string;
  /** 商品链接 */
  productUrl: string;
  /** 拿货价（登录态 shop_price） */
  shopPrice: number;
  /** 价格说明 */
  shopPriceNote?: string;
  /** 单独购买价 */
  alonePrice?: number;
  /** 门市价/零售价（仅登录态返回） */
  shoppePrice?: number;
  /** 登录态是否有效（由 coupons_new / check_status 判断） */
  authState: 'logged_in' | 'guest';
  /** 红包列表 */
  coupons: CouponInfo[];
  /** 满减券列表 */
  couponsNew: CouponNewInfo[];
  /** 采集时间（毫秒时间戳） */
  capturedAt: number;
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
  /** 登录态缺失或已失效 */
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  /** 请求排队超时（全局请求闸门） */
  REQUEST_GATE_TIMEOUT = 'REQUEST_GATE_TIMEOUT',
  /** 未知错误 */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ==================== 下单相关类型 ====================

/**
 * 一手收货地址
 */
export interface YishouAddress {
  /** 地址 ID（下单必须原样回传） */
  addressId: string;
  /** 收件人 */
  consignee: string;
  /** 省 ID（数字，不是名称） */
  province: string;
  /** 市 ID */
  city: string;
  /** 区 ID */
  district: string;
  /** 详细地址 */
  address: string;
  /** 手机号 */
  mobile: string;
  /** 地区文案：浙江省 金华市 东阳市 */
  area: string;
}

/**
 * 加购结果
 */
export interface YishouCartAddResult {
  /** 购物车商品级 ID（等于 goods_no），后续 confirm / 下单都传它 */
  recId: string;
  /** 商品货号 */
  goodsNo: string;
  /** 单价 */
  shopPrice: number;
}

/**
 * 结算确认返回的 stock 单条（下单时需去掉嵌套字段后原样回传）
 */
export interface YishouConfirmStockItem {
  [key: string]: unknown;
}

/**
 * 结算确认返回
 */
export interface YishouConfirmOrderData {
  /** 下单时必须原样回传的库存明细 */
  stock: YishouConfirmStockItem[];
  /** 失效商品 */
  outStock: YishouConfirmStockItem[];
  /** 默认地址 */
  defaultAddress?: YishouAddress;
  /** 商品金额（注意接口拼写是 price_tolal） */
  goodsAmount?: number;
  /** 运费 */
  shippingFee?: number;
  /** 总件数 */
  numTotal?: number;
  /** 可用支付方式 */
  payTools: string[];
}

/**
 * 创建订单返回
 */
export interface YishouCreateOrderData {
  /** 订单号 */
  orderSn: string;
  /** 支付状态：wait_pay / already */
  payStatus: string;
  /** 订单金额 */
  orderAmount?: number;
  /** 支付方式 */
  payTool?: string;
  /** 支付参数：服务端实际下发的是小程序跳转参数（userName + path），不是 App 的 prepay 五元组 */
  payParams?: Record<string, unknown>;
}

/**
 * 自动下单配置
 */
export interface AutoOrderConfig {
  /** 是否启用自动下单 */
  enabled: boolean;
  /** 购买件数，默认 1 */
  num?: number;
  /** 收货地址 ID，不传则使用账号默认地址 */
  addressId?: string;
  /** 支付方式：1 支付宝 / 4 微信（只影响返回的支付参数，支付仍需人工完成） */
  payTool?: '1' | '4';
  /** 指定 SKU，不传则自动挑第一个有货规格 */
  sku?: string;
}

/**
 * 自动下单阶段
 */
export type AutoOrderStage = 'address' | 'sku' | 'cart' | 'confirm' | 'create' | 'done';

/**
 * 自动下单结果
 */
export interface AutoOrderResult {
  /** 是否下单成功 */
  success: boolean;
  /** 失败（或成功）所处阶段 */
  stage: AutoOrderStage;
  /** 可重试：无货、被抢完等，下一轮继续监控 */
  retryable?: boolean;
  /** 结果未知：请求中断，订单可能已生成，必须人工核对，不能自动重试 */
  uncertain?: boolean;
  /** 说明信息 / 错误原因 */
  message?: string;
  /** 订单号 */
  orderSn?: string;
  /** 订单金额 */
  orderAmount?: number;
  /** 支付方式 */
  payTool?: string;
  /** 实际下单的 SKU */
  sku?: string;
  /** SKU 文案：蓝色 / M */
  skuLabel?: string;
  /** 购买件数 */
  num?: number;
  /** 购物车 rec_id */
  recId?: string;
  /** 支付截止时间（毫秒时间戳） */
  expireAt?: number;
  /**
   * 建单失败后的冷却时长（毫秒）
   *
   * 一手对任何一次 create 失败都会写「订单支付中」临时锁，几分钟内同商品无法再下单，
   * 这段冷却期内只检测、不重复建单，避免撞锁后被判成服务端错误。
   */
  cooldownMs?: number;
}

/**
 * 库存查询错误
 */
export class StockCheckError extends Error {
  public override readonly cause?: unknown;
  
  constructor(
    public readonly type: StockCheckErrorType,
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = 'StockCheckError';
    this.cause = cause;
  }
}
