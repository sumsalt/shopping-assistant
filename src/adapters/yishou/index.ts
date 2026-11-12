/**
 * 一手平台适配器
 *
 * 这一层只做「调接口 + 映射」，不含签名、请求头、错误解包等细节：
 *   - profile.ts   账号/通道 → 请求档案（唯一真相）
 *   - client.ts    发请求、签名、代理、闸门、错误映射
 *   - order-api.ts 下单链路（登录态 + 跳过闸门）
 *   - mappers.ts   原始响应 → 领域模型
 */

import { StockCheckError, StockCheckErrorType } from '../../types';
import type {
  CollectionStockCheckResult,
  CollectionStockResult,
  OrderStatusTab,
  Platform,
  PriceSnapshot,
  ProductSkuResult,
  StockCheckResult,
  YishouCartDetailData,
  YishouCollectionGoodsData,
  YishouGoodsData,
  YishouTabGoodsData,
} from '../../types';
import { BaseAdapter } from '../base-adapter';
import type { AdapterConfig } from '../types';
import * as EP from './endpoints';
import { YishouClient, withErrorContext } from './client';
import { YishouOrderApi } from './order-api';
import {
  mapCartDetailToSkuResult,
  mapCollectionItemToResult,
  mapTabItemToResult,
  mapToPriceSnapshot,
  mapToStockResult,
} from './mappers';

/** 商品不存在：统一文案，调用方直接展示 */
const notFound = (id: string): StockCheckError =>
  new StockCheckError(StockCheckErrorType.PRODUCT_NOT_FOUND, `商品不存在: ${id}`);

/** 把收藏夹 / Tab 列表拆成有货 / 无货两组 */
const splitByStock = (
  items: CollectionStockResult[]
): CollectionStockCheckResult => {
  const inStockItems = items.filter(item => item.inStock);
  const outOfStockItems = items.filter(item => !item.inStock);

  return {
    inStockItems,
    outOfStockItems,
    total: items.length,
    inStockCount: inStockItems.length,
    outOfStockCount: outOfStockItems.length,
  };
};

export class YishouAdapter extends BaseAdapter {
  readonly platform: Platform = 'yishou';

  /** 普通查询 */
  private readonly client: YishouClient;
  /** 收藏夹 / SKU 两个接口历史上不走代理 */
  private readonly directClient: YishouClient;
  /** 下单链路 */
  private readonly order: YishouOrderApi;

  constructor(config: AdapterConfig = {}) {
    super(config);
    this.client = new YishouClient(config);
    this.directClient = new YishouClient(config, { useProxy: false });
    this.order = new YishouOrderApi(config);
  }

  /** 按 goods_id 查商品详情（库存 / 价格共用） */
  private async fetchGoods(productId: string): Promise<YishouGoodsData> {
    try {
      const data = await this.client.post<YishouGoodsData>(EP.GOODS_INFO, {
        goods_id: productId,
        goods_no: '',
      });
      if (!data) throw notFound(productId);
      return data;
    } catch (error) {
      // 一手对「不存在」用文案返回，统一成带商品号的提示，前端可直接展示
      if (error instanceof StockCheckError && error.type === StockCheckErrorType.PRODUCT_NOT_FOUND) {
        throw notFound(productId);
      }
      throw error;
    }
  }

  /** 查询商品库存状态 */
  async checkStock(productId: string, _sku?: string): Promise<StockCheckResult> {
    return this.fetchGoods(productId)
      .then(mapToStockResult)
      .catch(withErrorContext('查询商品库存失败'));
  }

  /** 获取价格快照（必须登录态；游客数据视为 token 失效） */
  async getPriceInfo(productId: string): Promise<PriceSnapshot> {
    this.client.requireAuth('价格监控需要登录态，请先在账号管理中选择带登录态的账号');

    return this.fetchGoods(productId)
      .then(data => {
        const snapshot = mapToPriceSnapshot(data);
        if (snapshot.authState !== 'logged_in') {
          throw new StockCheckError(
            StockCheckErrorType.AUTH_REQUIRED,
            '登录态已失效，请在账号管理中选择账号或更新抓包'
          );
        }
        return snapshot;
      })
      .catch(withErrorContext('获取价格失败'));
  }

  /** 查询收藏夹库存 */
  async checkCollectionStock(
    page: number = 1,
    pageSize: number = 20
  ): Promise<CollectionStockCheckResult> {
    return this.directClient
      .post<YishouCollectionGoodsData[]>(EP.COLLECTION_LIST, {
        page: `${page}`,
        page_size: `${pageSize}`,
        defaultSort: '1',
      })
      .then(items => splitByStock((items || []).map(mapCollectionItemToResult)))
      .catch(withErrorContext('查询收藏夹库存失败'));
  }

  /** 获取 H5 Tab 商品列表 */
  async getTabGoodsList(
    tabId: string,
    page: number = 1,
    pageSize: number = 20,
    sort: number = 1,
    minPrice: number = 0,
    maxPrice: number = 0
  ): Promise<CollectionStockCheckResult> {
    return this.client
      .post<{ list: YishouTabGoodsData[] }>(EP.TAB_GOODS_LIST, {
        // 无抓包快照时沿用旧的 Tab 专用版本；有快照则原样回放用户抓到的值
        ...(this.client.captured ? {} : { version_name: '7.65.0' }),
        tabId,
        sort: `${sort}`,
        my_collection_supply: '',
        min_price: `${minPrice}`,
        max_price: `${maxPrice}`,
        page: `${page}`,
        page_size: `${pageSize}`,
      })
      .then(data => splitByStock((data?.list || []).map(mapTabItemToResult)))
      .catch(withErrorContext('获取 Tab 商品列表失败'));
  }

  /** 获取商品 SKU 列表 */
  async getProductSkus(productNo: string): Promise<ProductSkuResult> {
    try {
      const data = await this.directClient.post<YishouCartDetailData>(EP.GOODS_DETAIL, {
        goods_no: productNo,
        from_page: '1',
      });
      if (!data) throw notFound(productNo);
      return mapCartDetailToSkuResult(data);
    } catch (error) {
      if (error instanceof StockCheckError && error.type === StockCheckErrorType.PRODUCT_NOT_FOUND) {
        throw notFound(productNo);
      }
      throw withErrorContext('获取商品 SKU 失败')(error);
    }
  }

  // ==================== 下单链路（委托给 YishouOrderApi） ====================

  /** 订单列表（登录态，每页最多 10 条） */
  getOrderList(page?: number, pageSize?: number, status?: OrderStatusTab) {
    return this.order.getOrderList(page, pageSize, status);
  }

  getAddresses() {
    return this.order.getAddresses();
  }

  addToCart(goodsId: string, items: Array<{ sku: string; num: number }>) {
    return this.order.addToCart(goodsId, items);
  }

  confirmOrder(recIds: string, selected: string, addressId: string) {
    return this.order.confirmOrder(recIds, selected, addressId);
  }

  createOrder(params: Parameters<YishouOrderApi['createOrder']>[0]) {
    return this.order.createOrder(params);
  }

  deleteCart(recIds: string) {
    return this.order.deleteCart(recIds);
  }

  getOrderDetail(orderSn: string) {
    return this.order.getOrderDetail(orderSn);
  }
}

// 兼容既有引用：映射函数与请求档案解析仍从适配器入口导出
export * from './mappers';
export {
  resolveRequestProfile,
  readParam,
  DEFAULT_WX_PARAMS,
  WX_USER_AGENT,
  APP_USER_AGENT,
} from './profile';
export type { RequestProfile, RequestChannel } from './profile';
export { YishouClient, withErrorContext } from './client';
export { YishouOrderApi } from './order-api';
