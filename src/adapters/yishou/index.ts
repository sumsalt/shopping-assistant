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
  AddToCollectionResult,
  YishouCollectionGoodsData,
  YishouGoodsData,
  YishouTabGoodsData,
  KeywordSearchResult,
} from '../../types';
import type { GateFlow } from '../../utils/request-gate';
import { BaseAdapter } from '../base-adapter';
import type { AdapterConfig, RenewOrderAdapter } from '../types';
import * as EP from './endpoints';
import { YishouClient, withErrorContext } from './client';
import { YishouOrderApi } from './order-api';
import {
  mapCollectionItemToResult,
  mapGoodsToSkuResult,
  mapKeywordSearchResult,
  mapTabItemToResult,
  mapToPriceSnapshot,
  mapToStockResult,
} from './mappers';
import type { YishouKeywordSearchData } from './mappers';

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

  /**
   * 普通查询（监控 / 手动查询）：走闸门。
   * flow 由具体方法通过 flowOverride 指定（stock / price / tab / manual）。
   */
  private readonly client: YishouClient;
  /** 收藏夹翻页（历史上不走代理）：走闸门 */
  private readonly directClient: YishouClient;
  /** 下单链路（order.checkout，bypass 抢库存豁免） */
  private readonly order: YishouOrderApi;
  /** 订单续期链路（order.renew，走闸门，避免批量续期触发一手风控） */
  private readonly renewOrder: YishouOrderApi;
  /** 下单预检 SKU（order.checkout，bypass）：走代理但跳过闸门 */
  private readonly orderSkuClient: YishouClient;

  constructor(config: AdapterConfig = {}) {
    super(config);
    this.client = new YishouClient(config, { flow: 'manual' });
    this.directClient = new YishouClient(config, { useProxy: false, flow: 'collection.sync' });
    this.order = new YishouOrderApi(config, 'order.checkout');
    this.renewOrder = new YishouOrderApi(config, 'order.renew');
    this.orderSkuClient = new YishouClient(config, { flow: 'order.checkout' });
  }

  /**
   * 按 goods_id 查商品详情（库存 / 价格 / 下单预检共用）
   *
   * @param flow 业务流：决定闸门策略与统计；下单预检传 'order.checkout' 走 bypass
   */
  private async fetchGoods(productId: string, flow: import('../../utils/request-gate').GateFlow = 'monitor.stock'): Promise<YishouGoodsData> {
    const client = flow === 'order.checkout' ? this.orderSkuClient : this.client;
    try {
      const data = await client.post<YishouGoodsData>(EP.GOODS_INFO, {
        goods_id: productId,
        goods_no: '',
      }, client === this.client ? flow : undefined);
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

  /**
   * 查询商品库存状态
   *
   * @param flow 业务流，决定闸门策略；默认 monitor.stock（后台监控走闸门），
   *   页面手动查询传 manual（bypass，避免交互被 1s 令牌拖慢）。
   */
  async checkStock(productId: string, _sku?: string, flow: GateFlow = 'monitor.stock'): Promise<StockCheckResult> {
    return this.fetchGoods(productId, flow)
      .then(mapToStockResult)
      .catch(withErrorContext('查询商品库存失败'));
  }

  /** 获取价格快照（必须登录态；游客数据视为 token 失效） */
  async getPriceInfo(productId: string): Promise<PriceSnapshot> {
    this.client.requireAuth('价格监控需要登录态，请先在账号管理中选择带登录态的账号');

    return this.fetchGoods(productId, 'monitor.price')
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

  /**
   * 查询收藏夹库存
   *
   * @param flow 业务流；默认 collection.sync（后台扫描走闸门），
   *   页面手动翻页传 manual（bypass）。
   */
  async checkCollectionStock(
    page: number = 1,
    pageSize: number = 20,
    flow: GateFlow = 'collection.sync'
  ): Promise<CollectionStockCheckResult> {
    const index = Math.max(1, Math.floor(page) || 1)
    const size = Math.max(1, Math.floor(pageSize) || 20)

    return this.directClient
      .post<YishouCollectionGoodsData[]>(EP.COLLECTION_LIST, {
        // 一手实测：pageindex 是页码（从 1 开始）、pagesize 生效（最大 50 左右）；
        // 服务端也兼容 page/page_size，但官方抓包用的是这两个名字，按官方来更稳。
        pageindex: `${index}`,
        pagesize: `${size}`,
        goods_sale_status: '',
        market_id: '',
      }, flow)
      .then(items => splitByStock((items || []).map(mapCollectionItemToResult)))
      .catch(withErrorContext('查询收藏夹库存失败'));
  }

  /**
   * 添加到收藏夹（抓包：POST /users/add_goods_collection）
   *
   * 按 iOS 原生形态发 form：`app_code=0&goods_no=xxx`，最少参数即可。
   * 一手对重复收藏返回业务错误「该商品已收藏」，这里不吞掉，交给调用方提示。
   */
  async addCollection(productNo: string): Promise<AddToCollectionResult> {
    const no = String(productNo || '').trim();
    if (!no) {
      throw new StockCheckError(StockCheckErrorType.API_ERROR, '缺少商品货号，无法收藏');
    }
    if (!this.directClient.hasAuth) {
      throw new StockCheckError(StockCheckErrorType.AUTH_REQUIRED, '收藏需要登录态，请先选择账号');
    }

    const data = await this.directClient
      .post<{ collect_id?: string | number }>(
        EP.ADD_COLLECTION,
        { app_code: '0', goods_no: no },
        'collection.write'
      )
      .catch(withErrorContext('添加到收藏夹失败'));

    const collectId = String(data?.collect_id ?? '');
    if (!collectId) {
      throw new StockCheckError(StockCheckErrorType.API_ERROR, '收藏失败：未返回收藏 ID');
    }
    // 一手在限流 / 异常时可能返回 code=200 但 collect_id 塞了错误文案（如「操作过于频繁」）。
    // 真正的收藏条目 ID 是纯数字；非数字一律视为失败并原样抛出，绝不把脏值写回任务状态。
    if (!/^\d+$/.test(collectId)) {
      throw new StockCheckError(StockCheckErrorType.API_ERROR, `收藏失败：${collectId}`);
    }
    return { collectId };
  }

  /**
   * 从收藏夹移除（抓包：POST /users/del_goods_collection，JSON 形态）
   *
   * 抓包体 `{version_name, goods_no, goods_id, collect_id, token, uid}`：
   * version_name/token/uid 由 directClient 从账号快照自动注入、签名同理，
   * 这里只补业务三件套 goods_no + collect_id（+ 抓包也带的 goods_id）。
   * collect_id 决定移除哪一条收藏，缺它服务端无法定位。
   */
  async removeCollection(productNo: string, collectId: string, productId?: string): Promise<void> {
    const no = String(productNo || '').trim();
    const cid = String(collectId || '').trim();
    if (!no || !cid) {
      throw new StockCheckError(StockCheckErrorType.API_ERROR, '缺少商品货号或收藏 ID，无法取消收藏');
    }
    if (!this.directClient.hasAuth) {
      throw new StockCheckError(StockCheckErrorType.AUTH_REQUIRED, '取消收藏需要登录态，请先选择账号');
    }

    await this.directClient
      .post(
        EP.DEL_COLLECTION,
        {
          goods_no: no,
          ...(productId ? { goods_id: String(productId) } : {}),
          collect_id: cid,
        },
        'collection.write'
      )
      .catch(withErrorContext('取消收藏失败'));
  }

  /**
   * 获取 H5 Tab 商品列表
   *
   * 该接口只被后台 Tab 监控循环调用（页面看商品详情走 getProductSkus），
   * 必须走闸门限流，因此显式传 monitor.tab——不能依赖 client 默认的 manual
   * （manual 已改为 bypass，漏传会让后台高频翻页绕过闸门）。
   */
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
      }, 'monitor.tab')
      .then(data => splitByStock((data?.list || []).map(mapTabItemToResult)))
      .catch(withErrorContext('获取 Tab 商品列表失败'));
  }

  /**
   * 关键词搜索商品列表
   *
   * 登录态由 AdapterConfig 决定：带 uid/token 时 shop_price 是拿货价；匿名
   * 请求会降级成 "??.??"（映射层归一成无价格）。实测 40 条/页，埋点 ID /
   * sort / special_id 留空也能通。
   */
  async searchByKeyword(keyword: string, page: number = 1): Promise<KeywordSearchResult> {
    const index = Math.max(1, Math.floor(page) || 1);

    return this.client
      .post<YishouKeywordSearchData>(EP.KEYWORD_SEARCH, {
        app_code: '0',
        app_interface: 'search_result',
        keyword,
        pageindex: `${index}`,
        sort: '',
        special_id: '',
        // 抓包里是 uid_毫秒 的埋点 ID；实测留空也能正常返回
        source_event_id: '',
        source_search_event_id: '',
      })
      .then(data => mapKeywordSearchResult(data, keyword, index))
      .catch(withErrorContext('关键词搜索失败'));
  }

  /**
   * 获取商品 SKU 列表（商品详情 `get_goods_info_v2`）
   *
   * 详情页只调这一个接口：SKU 树、价格、库存、收藏标记一次拿全。
   * 该接口匿名可用，未登录时价格回落成游客参考价（读 alone_price），
   * 所以这里不再要求登录态。
   *
   * @param flow 业务流；默认 monitor.stock（后台监控走闸门），
   *   页面手动查看详情传 manual（bypass，避免交互被 1s 令牌拖慢）。
   *   下单预检的时效敏感场景请用 {@link getOrderProductSkus}（bypass 闸门）。
   */
  async getProductSkus(productId: string, flow: GateFlow = 'monitor.stock'): Promise<ProductSkuResult> {
    const id = String(productId || '').trim();
    if (!id) {
      throw new StockCheckError(StockCheckErrorType.API_ERROR, '缺少商品 ID');
    }

    const guest = !this.client.hasAuth;
    try {
      const data = await this.fetchGoods(id, flow);
      return mapGoodsToSkuResult(data, { guest });
    } catch (error) {
      if (error instanceof StockCheckError && error.type === StockCheckErrorType.PRODUCT_NOT_FOUND) {
        throw notFound(id);
      }
      throw withErrorContext('获取商品 SKU 失败')(error);
    }
  }

  /**
   * 下单预检用的 SKU 查询：走下单专用 client（order.checkout，bypass 闸门），
   * 避免抢库存时被闸门排队拖慢。语义与 getProductSkus 相同，仅闸门策略不同。
   */
  async getOrderProductSkus(productId: string): Promise<ProductSkuResult> {
    const id = String(productId || '').trim();
    if (!id) {
      throw new StockCheckError(StockCheckErrorType.API_ERROR, '缺少商品 ID');
    }
    const guest = !this.orderSkuClient.hasAuth;
    const data = await this.fetchGoods(id, 'order.checkout');
    return mapGoodsToSkuResult(data, { guest });
  }

  // ==================== 下单链路（委托给 YishouOrderApi） ====================

  /** 订单列表（登录态，每页最多 10 条） */
  getOrderList(page?: number, pageSize?: number, status?: OrderStatusTab) {
    return this.order.getOrderList(page, pageSize, status);
  }

  getAddresses() {
    return this.order.getAddresses();
  }

  /** 准备结算（加购 → 购物车明细 → 算折 → 结算确认），产出协议上下文 */
  prepareCheckout(input: Parameters<YishouOrderApi['prepareCheckout']>[0]) {
    return this.order.prepareCheckout(input);
  }

  /** 用 prepareCheckout 的上下文建单 */
  createOrder(protocol: unknown, payTool: string) {
    return this.order.createOrder(protocol, payTool);
  }

  /** 放弃结算，清掉加购的商品 */
  discardCheckout(protocol: unknown) {
    return this.order.discardCheckout(protocol);
  }

  getOrderDetail(orderSn: string) {
    return this.order.getOrderDetail(orderSn);
  }

  // ==================== 待支付订单续期 ====================

  /**
   * 返回续期专用适配器：所有方法走 order.renew flow（闸门限频），与下单的 bypass 视图分离。
   * 由 getRenewAdapter 工厂调用，编排层不接触具体平台。
   */
  asRenewAdapter(): RenewOrderAdapter {
    const api = this.renewOrder;
    return {
      getOrderList: (page?: number, pageSize?: number, status?: OrderStatusTab) =>
        api.getOrderList(page, pageSize, status),
      confirmWaitPayOrder: (orderSn: string) => api.confirmWaitPayOrder(orderSn),
      reloadWaitPayOrder: (protocol: unknown) => api.reloadWaitPayOrder(protocol),
      getOrderDetail: (orderSn: string) => api.getOrderDetail(orderSn),
    };
  }

  /** 续期确认（走 order.renew flow，闸门限频）；等价于 asRenewAdapter().confirmWaitPayOrder */
  confirmWaitPayOrder(orderSn: string) {
    return this.renewOrder.confirmWaitPayOrder(orderSn);
  }

  /** 续期提交（走 order.renew flow，闸门限频）；等价于 asRenewAdapter().reloadWaitPayOrder */
  reloadWaitPayOrder(protocol: unknown) {
    return this.renewOrder.reloadWaitPayOrder(protocol);
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
