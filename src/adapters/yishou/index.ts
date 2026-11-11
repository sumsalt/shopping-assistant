/**
 * 一手平台适配器
 */

import { StockCheckError, StockCheckErrorType } from '../../types';
import type { Platform, StockCheckResult, YishouGoodsData, YishouGoodsResponse, YishouCollectionGoodsData, YishouCollectionResponse, CollectionStockResult, CollectionStockCheckResult, YishouCartDetailResponse, YishouCartDetailData, ProductSkuResult, SkuInfo, YishouTabGoodsData, PriceSnapshot, YishouAddress, YishouCartAddResult, YishouConfirmOrderData, YishouConfirmStockItem, YishouCreateOrderData } from '../../types';
import { BaseAdapter } from '../base-adapter';
import type { AdapterConfig } from '../types';
import { httpPost } from '../../utils/http';
import { generateYishouSign } from '../../utils/crypto';

/** 一手平台 API 地址 */
const YISHOU_API_URL = 'https://api.yishouapp.com/goods/get_goods_info_v2';

/** 一手收藏夹 API 地址 */
const YISHOU_COLLECTION_API_URL = 'https://api.yishouapp.com/users/get_goods_collection_list';

/** 一手商品详情 API 地址（获取 SKU） */
const YISHOU_CART_DETAIL_API_URL = 'https://api.yishouapp.com/wechat/add_cart_goods_info';

/** 一手 H5 Tab 商品列表 API 地址 */
const YISHOU_TAB_LIST_API_URL = 'https://api.yishouapp.com/template/getNewTemplateH5Tab';

/** 一手收货地址 API 地址 */
const YISHOU_ADDRESS_API_URL = 'https://api.yishouapp.com/userAddress/get_user_address';

/** 一手加入购物车 API 地址 */
const YISHOU_ADD_CART_API_URL = 'https://api.yishouapp.com/cart/add_goods_to_cart';

/** 一手删除购物车商品 API 地址 */
const YISHOU_DEL_CART_API_URL = 'https://api.yishouapp.com/cart/del_cart';

/** 一手结算确认 API 地址（只算钱，不生成订单，可反复调用） */
const YISHOU_CONFIRM_ORDER_API_URL = 'https://api.yishouapp.com/order/confirm_order_v4';

/** 一创建订单 API 地址（失败会锁单，调用前必须确认参数） */
const YISHOU_CREATE_ORDER_API_URL = 'https://api.yishouapp.com/order/create_order_v4';

/** 一手订单详情 API 地址 */
const YISHOU_ORDER_DETAIL_API_URL = 'https://api.yishouapp.com/order/get_order_detail_v2';

/** 一手商品链接前缀 */
const YISHOU_GOODS_URL_PREFIX = 'https://www.yishouapp.com/goods/';

/**
 * 判断商品是否有货
 * 根据一手平台 API 响应的多个字段综合判断库存状态
 * @param data 商品数据
 * @returns 是否有货
 */
export const isInStock = (data: YishouGoodsData): boolean => {
  // 以下任一条件满足则视为无货：
  // 1. is_stockout === "1"（缺货）
  // 2. is_on_sale === "0"（停售）
  // 3. goods_status === "2"（下架）

  if (data.is_stockout === '1') return false;
  if (data.is_on_sale === '0') return false;
  if (data.goods_status === '2') return false;

  return true;
};

/**
 * 获取库存状态描述信息
 * @param data 商品数据
 * @param inStock 是否有货
 * @returns 状态描述
 */
export const getStockMessage = (data: YishouGoodsData, inStock: boolean): string => {
  if (inStock) {
    return '商品有货，可以购买';
  }

  // 根据具体状态返回更详细的信息
  if (data.is_stockout === '1') {
    return '商品暂时缺货';
  }
  if (data.goods_status === '2') {
    return data.remind_off_sale || '商品已下架';
  }
  if (data.is_on_sale === '0') {
    return '商品已停售';
  }

  return '商品无货';
};

/**
 * 将一手商品数据转换为通用库存查询结果
 * @param data 一手商品数据
 * @returns 库存查询结果
 */
export const mapToStockResult = (data: YishouGoodsData): StockCheckResult => {
  const inStock = isInStock(data);
  const sku = data.color || data.size 
    ? [data.color, data.size].filter(Boolean).join(' / ') 
    : undefined;
  
  return {
    platform: 'yishou',
    productId: data.goods_id,
    productName: data.goods_name,
    productNo: data.goods_no,
    sku,
    inStock,
    price: parseFloat(data.shop_price) || 0,
    productUrl: `${YISHOU_GOODS_URL_PREFIX}${data.goods_id}`,
    productImage: data.goods_thumb,
    message: getStockMessage(data, inStock),
  };
};

/**
 * 将字符串价格转换为数字
 * @param value 价格字符串
 * @returns 数字价格，无效时返回 undefined
 */
const toOptionalNumber = (value?: string): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** 一手地址原始字段（snake_case） */
interface YishouAddressRaw {
  address_id?: string | number;
  consignee?: string;
  province?: string | number;
  city?: string | number;
  district?: string | number;
  address?: string;
  mobile?: string;
  area?: string;
}

/**
 * 把一手地址（snake_case）转成内部结构
 */
export const mapYishouAddress = (raw: YishouAddressRaw): YishouAddress => ({
  addressId: String(raw.address_id ?? ''),
  consignee: raw.consignee ?? '',
  province: String(raw.province ?? ''),
  city: String(raw.city ?? ''),
  district: String(raw.district ?? ''),
  address: raw.address ?? '',
  mobile: raw.mobile ?? '',
  area: raw.area ?? '',
});

/**
 * 下单时回传的 stock 项：只保留标量字段，丢弃 tag_list / 图片 等嵌套结构
 *
 * 一手要求把 confirm_order_v4 返回的 stock 原样传回，只传 sku + num 会 500 并触发锁单
 */
const pickScalarFields = (item: YishouConfirmStockItem): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'object') {
      continue;
    }
    result[key] = value;
  }
  return result;
};

/**
 * 将一手商品数据转换为价格快照
 *
 * 说明：只有携带登录态（uid + token）时，shop_price 才是真实拿货价，
 * coupons / coupons_new / check_status 也只在登录态下返回。
 *
 * @param data 一手商品数据
 * @returns 价格快照
 */
export const mapToPriceSnapshot = (data: YishouGoodsData): PriceSnapshot => {
  const coupons = (data.coupons ?? []).map((coupon) => ({
    couponId: String(coupon.coupon_id ?? ''),
    typeTitle: coupon.coupon_type_title ?? '',
    title: coupon.coupon_title ?? '',
  }));

  const couponsNew = (data.coupons_new ?? []).map((coupon) => ({
    couponId: String(coupon.coupon_id ?? ''),
    threshold: Number(coupon.condition_goods_amount) || 0,
    reduce: Number(coupon.reduce_amount) || 0,
  }));

  // 登录态下接口会额外返回 coupons_new / check_status，游客态没有
  const authState: PriceSnapshot['authState'] =
    Array.isArray(data.coupons_new) || typeof data.check_status === 'string'
      ? 'logged_in'
      : 'guest';

  return {
    platform: 'yishou',
    productId: data.goods_id,
    productName: data.goods_name,
    productNo: data.goods_no,
    productImage: data.goods_thumb,
    productUrl: `${YISHOU_GOODS_URL_PREFIX}${data.goods_id}`,
    shopPrice: toOptionalNumber(data.shop_price) ?? 0,
    shopPriceNote: data.shop_price_note || undefined,
    alonePrice: toOptionalNumber(data.alone_price),
    shoppePrice: toOptionalNumber(data.shoppe_price),
    authState,
    coupons,
    couponsNew,
    capturedAt: Date.now(),
  };
};

/**
 * 判断收藏夹商品是否有货
 * @param data 收藏夹商品数据
 * @returns 是否有货
 */
export const isCollectionItemInStock = (data: YishouCollectionGoodsData): boolean => {
  // 以下任一条件满足则视为无货：
  // 1. is_stockout === "1"（缺货）
  // 2. is_on_sale === "0"（停售）
  // 3. goods_status === "2"（下架）
  
  if (data.is_stockout === '1') return false;
  if (data.is_on_sale === '0') return false;
  if (data.goods_status === '2') return false;
  
  return true;
};

/**
 * 获取收藏夹商品状态描述信息
 * @param data 收藏夹商品数据
 * @param inStock 是否有货
 * @returns 状态描述
 */
export const getCollectionItemMessage = (data: YishouCollectionGoodsData, inStock: boolean): string => {
  if (inStock) {
    return '商品有货，可以购买';
  }
  
  // 根据具体状态返回更详细的信息
  if (data.is_stockout === '1') {
    return data.is_replenish === '1' ? '商品缺货补货中' : '商品暂时缺货';
  }
  if (data.goods_status === '2') {
    return '商品已下架';
  }
  if (data.is_on_sale === '0') {
    return '商品已停售';
  }
  
  return '商品无货';
};

/**
 * 将收藏夹商品数据转换为库存查询结果
 * @param data 收藏夹商品数据
 * @returns 库存查询结果
 */
export const mapCollectionItemToResult = (data: YishouCollectionGoodsData): CollectionStockResult => {
  const inStock = isCollectionItemInStock(data);
  
  return {
    platform: 'yishou',
    productId: data.goods_id,
    productName: data.goods_name,
    brandName: data.brand_name,
    productNo: data.goods_no,
    inStock,
    price: parseFloat(data.shop_price) || 0,
    productUrl: `${YISHOU_GOODS_URL_PREFIX}${data.goods_id}`,
    productImage: data.goods_img || data.goods_thumb,
    marketName: data.one_market_name,
    salesOf7: data.sales_of_7 || 0,
    message: getCollectionItemMessage(data, inStock),
    collectId: data.collect_id || '',
  };
};

/**
 * 将一手商品详情数据转换为 SKU 查询结果
 * @param data 商品详情数据
 * @returns SKU 查询结果
 */
export const mapCartDetailToSkuResult = (data: YishouCartDetailData): ProductSkuResult => {
  const skuList: SkuInfo[] = [];
  const colors: string[] = [];
  const sizesSet = new Set<string>();

  // 遍历所有颜色属性
  for (const colorAttr of data.attribute || []) {
    colors.push(colorAttr.color);
    
    // 遍历该颜色下的所有尺码
    for (const item of colorAttr.item || []) {
      sizesSet.add(item.size);
      
      const stock = parseInt(item.stock, 10) || 0;
      const saleStock = parseInt(item.sale_stock, 10) || 0;
      
      skuList.push({
        skuId: item.sku,
        color: colorAttr.color,
        colorId: colorAttr.color_id,
        size: item.size,
        stock,
        saleStock,
        inStock: saleStock > 0,
        colorImage: colorAttr.card_thumb || colorAttr.color_card,
      });
    }
  }

  const inStockSkuCount = skuList.filter(sku => sku.inStock).length;

  return {
    platform: 'yishou',
    productId: data.goods_id,
    productName: data.goods_name,
    productNo: data.goods_no,
    price: parseFloat(data.shop_price) || 0,
    productImage: data.goods_thumb,
    productUrl: `${YISHOU_GOODS_URL_PREFIX}${data.goods_id}`,
    sales: parseInt(data.sales, 10) || 0,
    colors,
    sizes: Array.from(sizesSet),
    skuList,
    inStockSkuCount,
    totalSkuCount: skuList.length,
    restrictionNumber: data.restriction_number,
  };
};

/**
 * 将一手 H5 Tab 商品数据转换为库存查询结果
 * @param data H5 Tab 商品数据
 * @returns 库存查询结果
 */
export const mapTabItemToResult = (data: YishouTabGoodsData): CollectionStockResult => {
  const inStock = isCollectionItemInStock(data);
  
  return {
    platform: 'yishou',
    productId: data.goods_id,
    productName: data.goods_name,
    ...(data.goods_name_without_brand_name
      ? { productNameWithoutBrand: data.goods_name_without_brand_name }
      : {}),
    brandName: data.brand_name,
    productNo: data.goods_no,
    inStock,
    price: parseFloat(data.shop_price) || 0,
    productUrl: `${YISHOU_GOODS_URL_PREFIX}${data.goods_id}`,
    productImage: data.goods_img || data.goods_thumb,
    marketName: data.one_market_name,
    ...(data.supply_id ? { supplyId: String(data.supply_id) } : {}),
    salesOf7: data.sales_of_7 || 0,
    ...(data.first_sale_period ? { firstSalePeriod: String(data.first_sale_period) } : {}),
    ...(data.format_first_sale_time ? { firstSaleText: data.format_first_sale_time } : {}),
    isNew: data.is_new === '1',
    message: getCollectionItemMessage(data, inStock),
    collectId: '0', // Tab 商品无收藏ID，设为默认值
  };
};

/**
 * 一手平台适配器
 */
export class YishouAdapter extends BaseAdapter {
  readonly platform: Platform = 'yishou';

  constructor(config: AdapterConfig = {}) {
    super(config);
  }

  /** 默认 wx 小程序 UA（无抓包快照时使用） */
  private static readonly WX_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.60(0x18003c32) NetType/4G Language/zh_CN';
  /** 默认 App UA（抓包没带 UA 时兜底，网关靠 UA 分流） */
  private static readonly APP_USER_AGENT = 'okhttp/3.14.9';

  /** 大小写不敏感地读抓包参数 */
  private static readParam(params: Record<string, string> | undefined, key: string): string {
    if (!params) return '';
    for (const [name, value] of Object.entries(params)) {
      if (name.toLowerCase() === key) return value;
    }
    return '';
  }

  /**
   * 构建通用请求头
   *
   * 有抓包快照时以抓包请求头为基础（原样回放 UA / Referer / equipmd5 等），
   * 只覆盖每次重新生成的 sign；没有则回退旧的写死微信 UA，保证线上老行为。
   */
  private buildHeaders(sign: string): Record<string, string> {
    const captured = this.config.requestHeaders;
    if (captured && Object.keys(captured).length > 0) {
      const headers: Record<string, string> = { ...captured };
      const hasUserAgent = Object.keys(headers).some(name => name.toLowerCase() === 'user-agent');
      if (!hasUserAgent) {
        headers['User-Agent'] = this.config.channel === 'app'
          ? YishouAdapter.APP_USER_AGENT
          : YishouAdapter.WX_USER_AGENT;
      }
      headers.sign = sign;
      return headers;
    }
    const isApp = this.config.channel === 'app';
    return {
      sign,
      'User-Agent': isApp ? YishouAdapter.APP_USER_AGENT : YishouAdapter.WX_USER_AGENT,
      // 微信小程序网关靠这个 Referer 分流；App 通道带上反而会被判成 H5 请求
      ...(isApp
        ? {}
        : { 'Referer': 'https://servicewechat.com/wxe9634876e78aafd5/454/page-frame.html' }),
    };
  }

  /**
   * 获取代理配置
   * 根据 proxyEnabled 和 proxyUrl 决定是否使用代理
   * @returns 代理配置或 undefined
   */
  private getProxyConfig(): { proxyUrl?: string } | undefined {
    // 只有在启用代理（"1"）且有代理 URL 时才返回代理配置
    if (this.config.proxyEnabled === '1' && this.config.proxyUrl) {
      return { proxyUrl: this.config.proxyUrl };
    }
    return undefined;
  }

  /**
   * 构建通用请求体基础参数
   *
   * 有抓包快照时：原样回放快照里的公共参数（用户粘贴的是自己设备上真实可用的请求，
   * 不做任何猜测/删改），只覆盖每次动态生成的 t_t；匿名请求的前端已先剔除 uid/token。
   * 没有快照时：回退旧的写死 wx 参数，保证线上历史任务行为不变。
   */
  private buildBaseRequestBody(t_t: number): Record<string, string> {
    const captured = this.config.requestParams;
    if (captured && Object.keys(captured).length > 0) {
      const body: Record<string, string> = {};
      for (const [key, value] of Object.entries(captured)) {
        const lower = key.toLowerCase();
        // t_t / sign 是动态字段，抓包里若残留也覆盖掉
        if (lower === 't_t' || lower === 'sign') continue;
        body[key] = value;
      }
      body.t_t = `${t_t}`;
      return body;
    }
    const body: Record<string, string> = {
      model: this.config.model || 'iPhone 14 Pro<iPhone15,2>',
      t_t: `${t_t}`,
      openid: this.config.openid || '',
      version: this.config.version || '8.0.60',
      version_name: this.config.version_name || '4.9.0',
      wx_version_name: this.config.wx_version_name || '3.5.32',
      plat_type: this.config.plat_type || 'wx',
    };
    // 匿名请求不带这两个字段。若写成 undefined，URLSearchParams 会序列化成
    // "uid=undefined&token=undefined"，一手接口会当作无效凭证返回「请登录」
    if (this.config.uid) {
      body.uid = this.config.uid;
    }
    if (this.config.token) {
      body.token = this.config.token;
    }
    return body;
  }

  /**
   * 校验必要的配置参数
   */
  private validateConfig(): void {
  }

  /**
   * 生成签名和时间戳
   *
   * 服务端不校验 sign，但 t_t 会进请求体且被业务校验（必须 10 位数字），
   * 因此按通道选单位：App 抓包是秒级（10 位），小程序/H5 是毫秒级（Date.now()）。
   * 首段按文档：App 用 udid 且 model 需 URL 编码，小程序用 openid。
   */
  private generateSignature(): { sign: string; t_t: number } {
    const isApp = this.config.channel === 'app';
    const t_t = this.config.timestamp || (isApp ? Math.floor(Date.now() / 1000) : Date.now());
    const params = this.config.requestParams;

    const firstSegment = isApp
      ? YishouAdapter.readParam(params, 'udid')
      : (this.config.openid ?? YishouAdapter.readParam(params, 'openid'));
    const rawModel = this.config.model || YishouAdapter.readParam(params, 'model');
    const sign = this.config.sign || generateYishouSign({
      openid: firstSegment,
      // App 的签名在 OkHttp 拦截器里用 encodedValue 计算（空格 -> %20）
      model: isApp ? encodeURIComponent(rawModel) : rawModel,
      version: this.config.version || YishouAdapter.readParam(params, 'version'),
      version_name: this.config.version_name || YishouAdapter.readParam(params, 'version_name'),
      t_t,
    });
    return { sign, t_t };
  }

  /**
   * 获取商品价格快照（必须携带登录态）
   *
   * 价格监控专用：游客态 shop_price 与登录态不一致，且没有 coupons / coupons_new，
   * 因此这里强制要求 uid + token，并在服务端判定为游客态时直接报错。
   *
   * @param productId 商品ID（goods_id）
   * @returns 价格快照
   */
  async getPriceInfo(productId: string): Promise<PriceSnapshot> {
    if (!this.config.uid || !this.config.token) {
      throw new StockCheckError(
        StockCheckErrorType.AUTH_REQUIRED,
        '价格监控需要登录态，请先在账号管理中选择带登录态的账号'
      );
    }

    // 生成签名和时间戳
    const { sign, t_t } = this.generateSignature();

    // 构建请求参数
    const requestBody: Record<string, string> = {
      ...this.buildBaseRequestBody(t_t),
      goods_id: productId,
      goods_no: '',
    };

    // 构建请求头
    const headers = this.buildHeaders(sign);

    try {
      // 复用商品详情接口
      const response = await httpPost<YishouGoodsResponse>(
        YISHOU_API_URL,
        requestBody,
        headers,
        this.getProxyConfig()
      );

      // 检查响应状态
      if (response.code !== '200') {
        if (response.msg.includes('不存在') || response.msg.includes('找不到')) {
          throw new StockCheckError(
            StockCheckErrorType.PRODUCT_NOT_FOUND,
            `商品不存在: ${productId}`
          );
        }

        throw new StockCheckError(
          StockCheckErrorType.API_ERROR,
          `一手平台 API 错误: ${response.msg}`
        );
      }

      if (!response.data) {
        throw new StockCheckError(
          StockCheckErrorType.PRODUCT_NOT_FOUND,
          `商品不存在: ${productId}`
        );
      }

      const snapshot = mapToPriceSnapshot(response.data);

      // 带了凭证但返回的是游客数据，说明 token 已失效
      if (snapshot.authState !== 'logged_in') {
        throw new StockCheckError(
          StockCheckErrorType.AUTH_REQUIRED,
          '登录态已失效，请在账号管理中重新选择账号或更新抓包'
        );
      }

      return snapshot;
    } catch (error) {
      if (error instanceof StockCheckError) {
        throw error;
      }

      throw new StockCheckError(
        StockCheckErrorType.UNKNOWN_ERROR,
        `获取价格失败: ${error instanceof Error ? error.message : '未知错误'}`,
        error
      );
    }
  }

  /**
   * 查询商品库存状态
   * @param productId 商品ID（goods_id）
   * @param sku 可选的商品规格（暂未使用）
   * @returns 库存查询结果
   */
  async checkStock(productId: string, _sku?: string): Promise<StockCheckResult> {
    // 校验必要的配置参数
    this.validateConfig();

    // 生成签名和时间戳
    const { sign, t_t } = this.generateSignature();

    // 构建请求参数
    const requestBody: Record<string, string> = {
      ...this.buildBaseRequestBody(t_t),
      goods_id: productId,
      goods_no: '',
    };

    // 构建请求头
    const headers = this.buildHeaders(sign);

    try {
      // 调用一手平台 API
      const response = await httpPost<YishouGoodsResponse>(
        YISHOU_API_URL,
        requestBody,
        headers,
        this.getProxyConfig()
      );

      // 检查响应状态
      if (response.code !== '200') {
        // 判断是否是商品不存在
        if (response.msg.includes('不存在') || response.msg.includes('找不到')) {
          throw new StockCheckError(
            StockCheckErrorType.PRODUCT_NOT_FOUND,
            `商品不存在: ${productId}`
          );
        }
        
        throw new StockCheckError(
          StockCheckErrorType.API_ERROR,
          `一手平台 API 错误: ${response.msg}`
        );
      }

      // 检查是否有商品数据
      if (!response.data) {
        throw new StockCheckError(
          StockCheckErrorType.PRODUCT_NOT_FOUND,
          `商品不存在: ${productId}`
        );
      }

      // 转换并返回结果
      return mapToStockResult(response.data);
    } catch (error) {
      // 如果已经是 StockCheckError，直接抛出
      if (error instanceof StockCheckError) {
        throw error;
      }

      // 其他错误
      throw new StockCheckError(
        StockCheckErrorType.UNKNOWN_ERROR,
        `查询商品库存失败: ${error instanceof Error ? error.message : '未知错误'}`,
        error
      );
    }
  }

  /**
   * 查询收藏夹内商品的库存状态
   * @param page 页码，默认为1
   * @param pageSize 每页数量，默认为20
   * @returns 收藏夹库存查询结果
   */
  async checkCollectionStock(page: number = 1, pageSize: number = 20): Promise<CollectionStockCheckResult> {
    // 校验必要的配置参数
    this.validateConfig();

    // 生成签名和时间戳
    const { sign, t_t } = this.generateSignature();

    // 构建请求参数
    const requestBody: Record<string, string> = {
      ...this.buildBaseRequestBody(t_t),
      page: `${page}`,
      page_size: `${pageSize}`,
      defaultSort: '1',
    };

    // 构建请求头
    const headers = this.buildHeaders(sign);

    try {
      // 调用一手收藏夹 API
      const response = await httpPost<YishouCollectionResponse>(
        YISHOU_COLLECTION_API_URL,
        requestBody,
        headers,
        // 这个接口不走代理
        // this.getProxyConfig()
      );

      // 检查是否有商品数据
      const items = response.data || [];
      
      // 转换商品数据
      const results = items.map(mapCollectionItemToResult);
      
      // 分类有货和无货商品
      const inStockItems = results.filter(item => item.inStock);
      const outOfStockItems = results.filter(item => !item.inStock);

      return {
        inStockItems,
        outOfStockItems,
        total: results.length,
        inStockCount: inStockItems.length,
        outOfStockCount: outOfStockItems.length,
      };
    } catch (error) {
      // 如果已经是 StockCheckError，直接抛出
      if (error instanceof StockCheckError) {
        throw error;
      }

      // 其他错误
      throw new StockCheckError(
        StockCheckErrorType.UNKNOWN_ERROR,
        `查询收藏夹库存失败: ${error instanceof Error ? error.message : '未知错误'}`,
        error
      );
    }
  }

  /**
   * 获取 H5 Tab 商品列表
   * @param tabId Tab ID
   * @param page 页码，默认为1
   * @param pageSize 每页数量，默认为20
   * @param sort 排序方式，默认为1
   * @param minPrice 最低价格，默认为0
   * @param maxPrice 最高价格，默认为0
   * @returns Tab 商品列表查询结果
   */
  async getTabGoodsList(
    tabId: string,
    page: number = 1,
    pageSize: number = 20,
    sort: number = 1,
    minPrice: number = 0,
    maxPrice: number = 0
  ): Promise<CollectionStockCheckResult> {
    // 校验必要的配置参数
    this.validateConfig();

    // 生成签名和时间戳
    const { sign, t_t } = this.generateSignature();

    // 构建请求参数
    const requestBody: Record<string, string> = {
      ...this.buildBaseRequestBody(t_t),
      // 无抓包快照时沿用旧的 Tab 专用版本；有快照则原样回放，不覆盖用户抓包里的值
      ...(this.config.requestParams && Object.keys(this.config.requestParams).length > 0
        ? {}
        : { version_name: '7.65.0' }),
      tabId,
      sort: `${sort}`,
      my_collection_supply: '',
      min_price: `${minPrice}`,
      max_price: `${maxPrice}`,
      page: `${page}`,
      page_size: `${pageSize}`,
    };

    // 构建请求头
    const headers = this.buildHeaders(sign);

    try {
      // 调用一手 H5 Tab 商品列表 API
      const response = await httpPost<{ data: { list: YishouTabGoodsData[] } }>(
        YISHOU_TAB_LIST_API_URL,
        requestBody,
        headers,
        this.getProxyConfig()
      );

      // 检查是否有商品数据
      const items = response.data?.list || [];
      
      // 转换商品数据
      const results = items.map(mapTabItemToResult);
      
      // 分类有货和无货商品
      const inStockItems = results.filter(item => item.inStock);
      const outOfStockItems = results.filter(item => !item.inStock);

      return {
        inStockItems,
        outOfStockItems,
        total: results.length,
        inStockCount: inStockItems.length,
        outOfStockCount: outOfStockItems.length,
      };
    } catch (error) {
      // 如果已经是 StockCheckError，直接抛出
      if (error instanceof StockCheckError) {
        throw error;
      }

      // 其他错误
      throw new StockCheckError(
        StockCheckErrorType.UNKNOWN_ERROR,
        `获取 Tab 商品列表失败: ${error instanceof Error ? error.message : '未知错误'}`,
        error
      );
    }
  }

  /**
   * 获取商品的所有 SKU 信息
   * @param productNo 商品货号（goods_no）
   * @returns 商品 SKU 查询结果
   */
  async getProductSkus(productNo: string): Promise<ProductSkuResult> {
    // 校验必要的配置参数
    this.validateConfig();

    // 生成签名和时间戳
    const { sign, t_t } = this.generateSignature();

    // 构建请求参数
    const requestBody: Record<string, string> = {
      ...this.buildBaseRequestBody(t_t),
      goods_no: productNo,
      from_page: '1',
    };

    // 构建请求头
    const headers = this.buildHeaders(sign);

    try {
      // 调用一手商品详情 API
      const response = await httpPost<YishouCartDetailResponse>(
        YISHOU_CART_DETAIL_API_URL,
        requestBody,
        headers,
        // 这个接口不走代理
        // this.getProxyConfig()
      );

      // 检查响应状态
      if (response.code !== '200') {
        // 判断是否是商品不存在
        if (response.msg.includes('不存在') || response.msg.includes('找不到')) {
          throw new StockCheckError(
            StockCheckErrorType.PRODUCT_NOT_FOUND,
            `商品不存在: ${productNo}`
          );
        }
        
        throw new StockCheckError(
          StockCheckErrorType.API_ERROR,
          `一手平台 API 错误: ${response.msg}`
        );
      }

      // 检查是否有商品数据
      if (!response.data) {
        throw new StockCheckError(
          StockCheckErrorType.PRODUCT_NOT_FOUND,
          `商品不存在: ${productNo}`
        );
      }

      // 转换并返回结果
      return mapCartDetailToSkuResult(response.data);
    } catch (error) {
      // 如果已经是 StockCheckError，直接抛出
      if (error instanceof StockCheckError) {
        throw error;
      }

      // 其他错误
      throw new StockCheckError(
        StockCheckErrorType.UNKNOWN_ERROR,
        `获取商品 SKU 失败: ${error instanceof Error ? error.message : '未知错误'}`,
        error
      );
    }
  }

  // ==================== 下单链路 ====================

  /**
   * 下单链路的公共请求
   *
   * - 必须带登录态（uid + token）
   * - 跳过全局请求闸门：下单是抢库存操作，排队 15 秒就没有意义了
   */
  private async postOrderApi<T>(
    url: string,
    extra: Record<string, string> = {}
  ): Promise<T> {
    if (!this.config.uid || !this.config.token) {
      throw new StockCheckError(
        StockCheckErrorType.AUTH_REQUIRED,
        '自动下单需要登录态，请先在账号管理中选择带登录态的账号'
      );
    }

    const { sign, t_t } = this.generateSignature();
    const requestBody: Record<string, string> = {
      ...this.buildBaseRequestBody(t_t),
      ...extra,
    };

    const response = await httpPost<{ code: string; msg: string; data: T }>(
      url,
      requestBody,
      this.buildHeaders(sign),
      { ...this.getProxyConfig(), skipGate: true, timeout: 20000 }
    );

    if (response.code !== '200') {
      throw new StockCheckError(
        response.msg?.includes('登录')
          ? StockCheckErrorType.AUTH_REQUIRED
          : StockCheckErrorType.API_ERROR,
        response.msg || `一手平台返回异常（code=${response.code}）`
      );
    }

    return response.data;
  }

  /**
   * 获取收货地址列表
   */
  async getAddresses(): Promise<YishouAddress[]> {
    const data = await this.postOrderApi<YishouAddressRaw[] | { list?: YishouAddressRaw[] }>(
      YISHOU_ADDRESS_API_URL
    );

    const list = Array.isArray(data) ? data : data?.list || [];
    return list.map(mapYishouAddress).filter(item => item.addressId);
  }

  /**
   * 加入购物车
   *
   * @param goodsId 商品 ID
   * @param sku SKU ID
   * @param num 数量
   * @returns 购物车商品级 ID（rec_id，等于 goods_no）
   */
  async addToCart(goodsId: string, sku: string, num: number): Promise<YishouCartAddResult> {
    // num 必须是字符串、JSON 用紧凑格式，否则部分场景会被服务端忽略
    const selected = JSON.stringify([{ sku, num: String(num) }]);

    const data = await this.postOrderApi<{
      rec_id?: string | number;
      goods_no?: string;
      shop_price?: string;
    }>(YISHOU_ADD_CART_API_URL, {
      goods_id: goodsId,
      selected,
      is_select_refund_insurance: '0',
      is_select_super_refund_insurance: '0',
    });

    const recId = String(data?.rec_id ?? '');
    if (!recId) {
      throw new StockCheckError(
        StockCheckErrorType.API_ERROR,
        '加入购物车失败：未返回 rec_id（商品可能已下架或该规格无货）'
      );
    }

    return {
      recId,
      goodsNo: data?.goods_no || '',
      shopPrice: Number.parseFloat(data?.shop_price || '0') || 0,
    };
  }

  /**
   * 结算确认（只算钱，不生成订单，可反复调用）
   */
  async confirmOrder(
    recIds: string,
    selected: string,
    addressId: string
  ): Promise<YishouConfirmOrderData> {
    const data = await this.postOrderApi<Record<string, unknown>>(YISHOU_CONFIRM_ORDER_API_URL, {
      rec_ids: recIds,
      selected,
      address_id: addressId,
      is_df: '0',
    });

    const stock = Array.isArray(data?.stock) ? (data.stock as YishouConfirmStockItem[]) : [];
    const outStock = Array.isArray(data?.out_stock)
      ? (data.out_stock as YishouConfirmStockItem[])
      : [];
    const payTools = Array.isArray(data?.pay_tool)
      ? (data.pay_tool as Array<{ pay_tool?: string | number }>).map(item => String(item.pay_tool ?? ''))
      : [];

    return {
      stock,
      outStock,
      defaultAddress: data?.default_address
        ? mapYishouAddress(data.default_address as YishouAddressRaw)
        : undefined,
      goodsAmount: toOptionalNumber(
        (data?.price_tolal ?? data?.goods_amount_total) as string | undefined
      ),
      shippingFee: toOptionalNumber(
        (data?.shipping_fee ?? data?.shipping_fee_total) as string | undefined
      ),
      numTotal: Number(data?.num_total) || 0,
      payTools,
    };
  }

  /**
   * 创建订单
   *
   * 注意：任何一次失败都会在服务端留下「订单支付中」临时锁，几分钟内无法再下单，
   * 因此调用前必须先用 confirmOrder 校验参数。
   */
  async createOrder(params: {
    recIds: string;
    stock: YishouConfirmStockItem[];
    address: YishouAddress;
    payTool: string;
  }): Promise<YishouCreateOrderData> {
    const selected = JSON.stringify(params.stock.map(pickScalarFields));
    const { address } = params;

    const data = await this.postOrderApi<{
      order_sn?: string;
      pay_status?: string;
      order_amount?: string;
      pay_tool?: string;
      pay_params?: Record<string, unknown>;
    }>(YISHOU_CREATE_ORDER_API_URL, {
      rec_ids: params.recIds,
      selected,
      consignee: address.consignee,
      province: address.province,
      city: address.city,
      district: address.district,
      address: address.address,
      mobile: address.mobile,
      custom_note: '',
      is_other: '0',
      is_send_logistics: '0',
      is_merge_order: '0',
      is_no_invoice: '0',
      is_balance_pay: '0',
      pay_tool: params.payTool,
      is_df: '0',
    });

    const orderSn = String(data?.order_sn ?? '');
    if (!orderSn) {
      throw new StockCheckError(StockCheckErrorType.API_ERROR, '下单失败：未返回订单号');
    }

    return {
      orderSn,
      payStatus: data?.pay_status || 'wait_pay',
      orderAmount: toOptionalNumber(data?.order_amount),
      payTool: data?.pay_tool,
      payParams: data?.pay_params,
    };
  }

  /**
   * 删除购物车商品（下单失败时清理残留）
   */
  async deleteCart(recIds: string): Promise<void> {
    await this.postOrderApi<unknown>(YISHOU_DEL_CART_API_URL, { rec_ids: recIds });
  }

  /**
   * 查询订单详情摘要（金额 + 支付截止时间）
   *
   * create_order_v4 的响应里没有 order_amount，金额只能回查订单详情；
   * cancel_expire 是支付截止时间（实测 add_time + 20 分钟），下单成功后用于邮件提示。
   * 失败不影响下单结果，调用方会 catch。
   */
  async getOrderDetail(orderSn: string): Promise<{ expireAt?: number; orderAmount?: number }> {
    const data = await this.postOrderApi<{
      cancel_expire?: string | number;
      order_amount?: string | number;
    }>(YISHOU_ORDER_DETAIL_API_URL, { order_sn: orderSn });

    const seconds = Number(data?.cancel_expire);
    const amount = Number(data?.order_amount);

    return {
      expireAt: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
      orderAmount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
    };
  }
}
