/**
 * 一手下单链路
 *
 * 下单与查询用的是同一套鉴权，但语义完全不同：
 *   - 必须登录
 *   - 跳过全局闸门（抢库存排队 15 秒没有意义）
 *   - 超时放宽到 20 秒（建单本身较慢）
 *
 * 因此单独封装，避免把「抢单」的参数混进普通查询里。
 */

import type {
  OrderListResult,
  OrderStatusTab,
  YishouAddress,
  YishouCartAddResult,
  YishouConfirmOrderData,
  YishouConfirmStockItem,
  YishouCreateOrderData,
} from '../../types';
import type { AdapterConfig } from '../types';
import { StockCheckError, StockCheckErrorType } from '../../types';
import * as EP from './endpoints';
import { YishouClient } from './client';
import {
  mapOrderListItem,
  mapYishouAddress,
  pickScalarFields,
  toOptionalNumber,
  type YishouAddressRaw,
  type YishouOrderRaw,
} from './mappers';

/** 下单链路统一提示语：调用方据此引导用户去账号管理 */
const AUTH_MESSAGE = '自动下单需要登录态，请先在账号管理中选择带登录态的账号';

/** 订单列表需要登录态，提示文案单独给，避免让用户以为是在下单 */
const ORDER_LIST_AUTH_MESSAGE = '查看订单需要登录态，请先在账号管理中选择带登录态的账号';

/**
 * 一手订单列表每页上限
 *
 * 实测传 20 / 50 都只返回 10 条，是服务端硬限制，不是本项目的分页策略。
 * 收敛成常量，避免调用方误以为调大就能少翻几页。
 */
export const ORDER_LIST_PAGE_SIZE = 10;

/** 订单列表 tab 的合法值（`wait_comfirm` 是一手上的拼写错误，必须照抄） */
export const ORDER_STATUS_TABS: readonly OrderStatusTab[] = [
  'all',
  'wait_pay',
  'wait_shipping',
  'wait_comfirm',
  'finish',
];

/** 收敛到合法 tab，非法值一律按「全部」处理（与服务端行为一致，但这里是显式的） */
export const normalizeOrderStatus = (status?: string): OrderStatusTab =>
  ORDER_STATUS_TABS.find(tab => tab === status) ?? 'all';

/**
 * 解析列表返回
 *
 * 这是个暗坑：传了 `pageidx` 时 data 是 `{ list, pageidx, current_timestamp }`，
 * 不传则是裸数组。两种都要能读，否则换个调用方就静默变成空列表。
 */
const parseOrderListPayload = (data: unknown): YishouOrderRaw[] => {
  if (Array.isArray(data)) return data as YishouOrderRaw[];
  const list = (data as { list?: unknown } | null | undefined)?.list;
  return Array.isArray(list) ? (list as YishouOrderRaw[]) : [];
};

export class YishouOrderApi {
  private readonly client: YishouClient;

  constructor(config: AdapterConfig = {}) {
    this.client = new YishouClient(config, { skipGate: true, timeout: 20000 });
  }

  /**
   * 订单列表
   *
   * 三个实测细节（都踩过）：
   *   1. 参数名是 `pageidx`，**不是** `pageindex`：写错会直接 500 server error
   *   2. `pageidx` 从 0 开始，对外仍用 1 起的页码，这里换算
   *   3. 不传 `pageidx` 时 data 是裸数组，传了才是 `{ list, pageidx, current_timestamp }`
   *
   * 没有总数，只能靠「本页是否满页」判断还有没有下一页。
   */
  async getOrderList(
    page: number = 1,
    pageSize: number = ORDER_LIST_PAGE_SIZE,
    status?: OrderStatusTab
  ): Promise<OrderListResult> {
    this.client.requireAuth(ORDER_LIST_AUTH_MESSAGE);

    const index = Math.max(1, Math.floor(page) || 1);
    const size = Math.min(
      Math.max(1, Math.floor(pageSize) || ORDER_LIST_PAGE_SIZE),
      ORDER_LIST_PAGE_SIZE
    );
    const tab = normalizeOrderStatus(status);

    const data = await this.client.post<unknown>(EP.ORDER_LIST, {
      order_status: tab,
      pageidx: `${index - 1}`,
      pagesize: `${size}`,
    });

    const items = parseOrderListPayload(data).map(mapOrderListItem);

    return {
      items,
      page: index,
      pageSize: size,
      status: tab,
      hasMore: items.length >= size,
    };
  }

  /** 收货地址列表 */
  async getAddresses(): Promise<YishouAddress[]> {
    this.client.requireAuth(AUTH_MESSAGE);

    const data = await this.client.post<
      YishouAddressRaw[] | { list?: YishouAddressRaw[] }
    >(EP.ADDRESS_LIST);

    const list = Array.isArray(data) ? data : data?.list || [];
    return list.map(mapYishouAddress).filter(item => item.addressId);
  }

  /**
   * 加入购物车
   *
   * 支持一次加多个规格（同一商品不同颜色/尺码合并成一个购物车记录）：
   * selected 是一手的原生结构，num 必须是字符串、JSON 用紧凑格式，
   * 否则部分场景会被服务端忽略。
   */
  async addToCart(
    goodsId: string,
    items: Array<{ sku: string; num: number }>
  ): Promise<YishouCartAddResult> {
    this.client.requireAuth(AUTH_MESSAGE);

    const selected = JSON.stringify(items.map(item => ({ sku: item.sku, num: String(item.num) })));
    const data = await this.client.post<{
      rec_id?: string | number;
      goods_no?: string;
      shop_price?: string;
    }>(EP.CART_ADD, {
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

  /** 结算确认（只算钱，不生成订单，可反复调用） */
  async confirmOrder(
    recIds: string,
    selected: string,
    addressId: string
  ): Promise<YishouConfirmOrderData> {
    this.client.requireAuth(AUTH_MESSAGE);

    const data = await this.client.post<Record<string, unknown>>(EP.ORDER_CONFIRM, {
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
      ? (data.pay_tool as Array<{ pay_tool?: string | number }>).map(item =>
          String(item.pay_tool ?? '')
        )
      : [];

    return {
      stock,
      outStock,
      defaultAddress: data?.default_address
        ? mapYishouAddress(data.default_address as YishouAddressRaw)
        : undefined,
      // 一手把 total 拼成了 tolal，这里兼容两种拼写
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
   * 任何一次失败都会在服务端留下「订单支付中」临时锁，几分钟内无法再下单，
   * 因此调用前必须先用 confirmOrder 校验参数。
   */
  async createOrder(params: {
    recIds: string;
    stock: YishouConfirmStockItem[];
    address: YishouAddress;
    payTool: string;
  }): Promise<YishouCreateOrderData> {
    this.client.requireAuth(AUTH_MESSAGE);

    const { address } = params;
    const data = await this.client.post<{
      order_sn?: string;
      pay_status?: string;
      order_amount?: string;
      pay_tool?: string;
      pay_params?: Record<string, unknown>;
    }>(EP.ORDER_CREATE, {
      rec_ids: params.recIds,
      selected: JSON.stringify(params.stock.map(pickScalarFields)),
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

  /** 删除购物车商品（下单失败时清理残留） */
  async deleteCart(recIds: string): Promise<void> {
    this.client.requireAuth(AUTH_MESSAGE);
    await this.client.post<unknown>(EP.CART_DELETE, { rec_ids: recIds });
  }

  /**
   * 订单详情摘要（金额 + 支付截止时间）
   *
   * create_order_v4 不返回 order_amount，金额只能回查；
   * cancel_expire 是秒级时间戳（实测 add_time + 20 分钟）。
   */
  async getOrderDetail(orderSn: string): Promise<{ expireAt?: number; orderAmount?: number }> {
    this.client.requireAuth(AUTH_MESSAGE);

    const data = await this.client.post<{
      cancel_expire?: string | number;
      order_amount?: string | number;
    }>(EP.ORDER_DETAIL, { order_sn: orderSn });

    const seconds = Number(data?.cancel_expire);
    const amount = Number(data?.order_amount);

    return {
      expireAt: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
      orderAmount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
    };
  }
}
