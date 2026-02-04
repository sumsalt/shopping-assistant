/**
 * 一手平台适配器
 */

import { StockCheckError, StockCheckErrorType } from '../../types';
import type { Platform, StockCheckResult, YishouGoodsData, YishouGoodsResponse, YishouCollectionGoodsData, YishouCollectionResponse, CollectionStockResult, CollectionStockCheckResult, YishouCartDetailResponse, YishouCartDetailData, ProductSkuResult, SkuInfo, YishouTabListResponse, YishouTabGoodsData } from '../../types';
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
    brandName: data.brand_name,
    productNo: data.goods_no,
    inStock,
    price: parseFloat(data.shop_price) || 0,
    productUrl: `${YISHOU_GOODS_URL_PREFIX}${data.goods_id}`,
    productImage: data.goods_img || data.goods_thumb,
    marketName: data.one_market_name,
    salesOf7: data.sales_of_7 || 0,
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

  /**
   * 构建通用请求头
   * @param sign 签名
   * @returns 请求头
   */
  private buildHeaders(sign: string): Record<string, string> {
    return {
      sign,
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.60(0x18003c32) NetType/4G Language/zh_CN',
      'Referer': 'https://servicewechat.com/wxe9634876e78aafd5/454/page-frame.html',
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
   * @param t_t 时间戳
   * @returns 基础请求参数
   */
  private buildBaseRequestBody(t_t: number): Record<string, string> {
    return {
      model: this.config.model || 'iPhone 14 Pro<iPhone15,2>',
      t_t: `${t_t}`,
      openid: this.config.openid || '',
      version: this.config.version || '8.0.60',
      version_name: this.config.version_name || '4.9.0',
      wx_version_name: this.config.wx_version_name || '3.5.32',
      uid: this.config.uid!,
      token: this.config.token!,
      plat_type: this.config.plat_type || 'wx',
    };
  }

  /**
   * 校验必要的配置参数
   */
  private validateConfig(): void {
  }

  /**
   * 生成签名和时间戳
   * @returns { sign, t_t }
   */
  private generateSignature(): { sign: string; t_t: number } {
    const t_t = this.config.timestamp || Date.now();
    const sign = this.config.sign || generateYishouSign({
      openid: this.config.openid,
      model: this.config.model!,
      version: this.config.version!,
      version_name: this.config.version_name!,
      t_t,
    });
    return { sign, t_t };
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
      version_name: '7.65.0',
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
}
