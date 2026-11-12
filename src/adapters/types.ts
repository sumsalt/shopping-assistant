/**
 * 平台适配器 - 类型定义
 */

import type {
  Platform,
  StockCheckResult,
  CollectionStockCheckResult,
  ProductSkuResult,
  PriceSnapshot,
  OrderListResult,
  OrderStatusTab,
  RenewOrderResult,
  WaitPayConfirmData,
} from '../types';

/**
 * 平台适配器接口
 * 所有平台适配器必须实现此接口
 */
export interface PlatformAdapter {
  /** 平台标识 */
  readonly platform: Platform;

  /**
   * 查询商品库存状态
   * @param productId 商品ID
   * @param sku 可选的商品规格（颜色+尺码）
   * @returns 库存查询结果
   */
  checkStock(productId: string, sku?: string): Promise<StockCheckResult>;

  /**
   * 查询收藏夹内商品的库存状态
   * @param page 页码，默认为1
   * @param pageSize 每页数量，默认为20
   * @returns 收藏夹库存查询结果
   */
  checkCollectionStock(page?: number, pageSize?: number): Promise<CollectionStockCheckResult>;

  /**
   * 获取商品的所有 SKU 信息
   * @param productNo 商品货号
   * @returns 商品 SKU 查询结果
   */
  getProductSkus(productNo: string): Promise<ProductSkuResult>;

  /**
   * 获取商品价格快照（必须携带登录态）
   * @param productId 商品ID
   * @returns 价格快照
   */
  getPriceInfo(productId: string): Promise<PriceSnapshot>;

  /**
   * 查询订单列表（必须携带登录态）
   *
   * @param page 页码，从 1 开始
   * @param pageSize 每页数量
   * @param status 订单状态 tab，不传按「全部」
   *
   * 不是所有平台都有订单能力：未实现时调用方应提示「当前平台不支持」。
   */
  getOrderList?(page?: number, pageSize?: number, status?: OrderStatusTab): Promise<OrderListResult>;
}

/**
 * 待支付订单续期能力（独立于自动下单）
 *
 * 单独定义、单独做能力检测，不塞进 AutoOrderAdapter：
 * 自动下单的契约测试里 mock 的 adapter 只有下单那几个方法，混在一起会让
 * 所有自动下单测试失去能力；而且续期是「查订单 + 重新提交支付」，语义与建单不同。
 */
export interface RenewOrderAdapter {
  /** 翻页扫待支付订单（登录态，每页上限 10） */
  getOrderList(page?: number, pageSize?: number, status?: OrderStatusTab): Promise<OrderListResult>;
  /** 抓包 1.1：取重新结算上下文与服务端剩余时长 */
  confirmWaitPayOrder(orderSn: string): Promise<WaitPayConfirmData>;
  /** 抓包 1.4：重新提交支付单刷新有效期 */
  reloadWaitPayOrder(protocol: unknown): Promise<RenewOrderResult>;
  /** 续期后回查支付截止时间（可选，用于确认有效期确实后移） */
  getOrderDetail?(orderSn: string): Promise<{ expireAt?: number; orderAmount?: number }>;
}

/**
 * 平台适配器配置（用于认证等）
 */
export interface AdapterConfig {
  /** 用户ID */
  uid?: string;
  /** 用户Token */
  token?: string;
  /** 时间戳 */
  timestamp?: number;
  /** 签名（如不传，将自动计算） */
  sign?: string;
  /** 用户openid（用于签名计算） */
  openid?: string;
  /** 设备型号（用于签名计算） */
  model?: string;
  /** 版本号（用于签名计算） */
  version?: string;
  /** 版本名称（用于签名计算） */
  version_name?: string;
  /** 微信版本名称 */
  wx_version_name?: string;
  /** 平台类型（默认: wx） */
  plat_type?: string;
  /**
   * 抓包得到的完整公共参数快照（含 uid/token/udid/openid 等静态字段）。
   * 存在时，请求体以它为基础，只覆盖动态 t_t；匿名请求由服务端先剔除 uid/token。
   */
  requestParams?: Record<string, string>;
  /** 抓包得到的关键请求头（User-Agent / Content-Type / equipmd5 等） */
  requestHeaders?: Record<string, string>;
  /** 抓包通道：决定 UA、t_t 单位（app 秒级 / wx 毫秒级）与签名首段 */
  channel?: 'wx' | 'app';
  /** 代理 URL（可选） */
  proxyUrl?: string;
  /** 是否启用代理（"1" 或 "0"） */
  proxyEnabled?: '1' | '0';
}
