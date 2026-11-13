/**
 * 一手下单链路（协议适配层）
 *
 * 与查询接口的差别：必须登录、跳过全局闸门（抢库存排队 15 秒没有意义）、超时放宽到 20 秒。
 *
 * 对外只暴露三个「业务动作」，把抓包 15 步收敛成清晰的编排：
 *   - prepareCheckout：取规格 → 加购 → 购物车明细 → 算折 → 结算确认，产出 CheckoutReady
 *   - createOrder：按 prepareCheckout 的协议上下文建单
 *   - discardCheckout：放弃结算，清掉加购的商品
 *
 * selected / cart_id / selected_express / 埋点 ID 等协议细节全部委托 checkout.ts 的纯函数构造，
 * 本文件只负责「按抓包顺序发请求 + 解包 + 出错时清理购物车」。
 *
 * 【抓包对齐的接口取舍】见 checkout.ts 顶部说明。
 */

import type {
  CheckoutLine,
  CheckoutReady,
  CheckoutSettledItem,
  OrderListResult,
  OrderStatusTab,
  RenewOrderResult,
  WaitPayConfirmData,
  YishouAddress,
  YishouCreateOrderData,
} from '../../types';
import type { AdapterConfig } from '../types';
import { StockCheckError, StockCheckErrorType } from '../../types';
import * as EP from './endpoints';
import { YishouClient } from './client';
import {
  mapOrderListItem,
  mapYishouAddress,
  toOptionalNumber,
  type YishouAddressRaw,
  type YishouOrderRaw,
} from './mappers';
import {
  buildAddCartSelected,
  buildConfirmSelected,
  buildCreateSelected,
  buildEventId,
  buildRsa,
  buildSelectGoods,
  buildTrackingId,
  CART_ADD_SOURCE,
  CREATE_ORDER_CONSTANTS,
  pickCartGroup,
  pickCartLines,
  resolveSelectedExpress,
  resolveSettledNum,
  toSettledItems,
  type YishouCartActivitiesRaw,
  type YishouCartGoodsInfoRaw,
  type YishouCartLineRaw,
  type YishouCartsBySupplyRaw,
  type YishouCheckoutProtocol,
  type YishouConfirmRaw,
  type YishouConfirmStockRaw,
} from './checkout';
import {
  buildReloadRequest,
  parseWaitPayConfirm,
  type YishouReloadWaitPayRaw,
  type YishouRenewProtocol,
  type YishouWaitPayConfirmRaw,
} from './renew';

/** 下单链路统一提示语：调用方据此引导用户去账号管理 */
const AUTH_MESSAGE = '自动下单需要登录态，请先在账号管理中选择带登录态的账号';

/** 订单列表需要登录态，提示文案单独给，避免让用户以为是在下单 */
const ORDER_LIST_AUTH_MESSAGE = '查看订单需要登录态，请先在账号管理中选择带登录态的账号';

/**
 * 一手订单列表每页上限
 *
 * 实测传 20 / 50 都只返回 10 条，是服务端硬限制，不是本项目的分页策略。
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

/** 收敛到合法 tab，非法值一律按「全部」处理 */
export const normalizeOrderStatus = (status?: string): OrderStatusTab =>
  ORDER_STATUS_TABS.find(tab => tab === status) ?? 'all';

/**
 * 解析列表返回
 *
 * 传了 `pageidx` 时 data 是 `{ list, pageidx, current_timestamp }`，不传则是裸数组。
 */
const parseOrderListPayload = (data: unknown): YishouOrderRaw[] => {
  if (Array.isArray(data)) return data as YishouOrderRaw[];
  const list = (data as { list?: unknown } | null | undefined)?.list;
  return Array.isArray(list) ? (list as YishouOrderRaw[]) : [];
};

/** prepareCheckout 的入参：编排层只表达「买这些规格、用这个地址」 */
export interface PrepareCheckoutInput {
  goodsId: string;
  goodsNo: string;
  lines: CheckoutLine[];
  address: YishouAddress;
}

export class YishouOrderApi {
  private readonly client: YishouClient;

  constructor(config: AdapterConfig = {}) {
    this.client = new YishouClient(config, { skipGate: true, timeout: 20000 });
  }

  /**
   * 订单列表
   *
   * 实测细节：
   *   - 参数名是 `pageidx`（不是 pageindex，写错直接 500）。
   *   - **`pageidx` 是「记录偏移量 offset」，不是页码**：传 0 取第 0~9 条，
   *     传 1 取第 1~10 条（只前移 1 条，会和第一页重复 9 条）。
   *     正确翻页步长是 `pagesize`，即对外第 N 页传 `(N-1) * size`。
   *   - 响应里的 `pageidx` = 本次 offset + 本页条数，是下一页游标（本项目仍按页码建模）。
   *   - **服务端完全忽略 `pagesize`**：实测传 3 / 5 / 10 / 20 都固定返回 10 条，
   *     因此步长必须锁死为 10，不能用调用方传入的 size 算 offset（否则会重复）。
   *   - 不传 pageidx 时 data 是裸数组；没有总数，只能靠「本页是否满页」判断 hasMore。
   */
  async getOrderList(
    page: number = 1,
    pageSize: number = ORDER_LIST_PAGE_SIZE,
    status?: OrderStatusTab
  ): Promise<OrderListResult> {
    this.client.requireAuth(ORDER_LIST_AUTH_MESSAGE);

    const index = Math.max(1, Math.floor(page) || 1);
    // pageSize 保留在签名里只为兼容既有调用方；服务端忽略该参数、固定回 10 条，
    // 所以 offset 步长、pagesize 请求值、hasMore 判定都必须用同一个常量。
    void pageSize;
    const size = ORDER_LIST_PAGE_SIZE;
    const tab = normalizeOrderStatus(status);

    const data = await this.client.post<unknown>(EP.ORDER_LIST, {
      order_status: tab,
      // 一手把 pageidx 当记录偏移量：第 N 页从第 (N-1)*size 条开始取
      pageidx: `${(index - 1) * size}`,
      pagesize: `${size}`,
    });

    const items = parseOrderListPayload(data).map(mapOrderListItem);
    return { items, page: index, pageSize: size, status: tab, hasMore: items.length >= size };
  }

  /** 收货地址列表 */
  async getAddresses(): Promise<YishouAddress[]> {
    this.client.requireAuth(AUTH_MESSAGE);

    const data = await this.client.post<YishouAddressRaw[] | { list?: YishouAddressRaw[] }>(
      EP.ADDRESS_LIST
    );
    const list = Array.isArray(data) ? data : data?.list || [];
    return list.map(mapYishouAddress).filter(item => item.addressId);
  }

  /**
   * 准备结算：抓包 2.1 → 2.3 → 2.6 → 2.7 → 2.11
   *
   * 任何一步失败都会把已加入的购物车条目清掉，避免残留影响下一轮下单。
   * 返回的 protocol 是不透明句柄，编排层原样回传 createOrder / discardCheckout。
   */
  async prepareCheckout(input: PrepareCheckoutInput): Promise<CheckoutReady> {
    this.client.requireAuth(AUTH_MESSAGE);

    const { goodsId, goodsNo, lines, address } = input;
    const uid = this.client.uid;
    const seconds = Math.floor(Date.now() / 1000);
    const addCartId = buildTrackingId(uid, seconds);
    const payId = buildTrackingId(uid, seconds);
    const eventId = buildEventId(uid, Date.now());

    let recIds = '';
    try {
      // ① 取商品规格原始 attribute（抓包 2.1）：加购 selected 的构造原料
      const goods = await this.client.post<YishouCartGoodsInfoRaw>(EP.CART_GOODS_INFO, {
        goods_id: goodsId,
        goods_no: goodsNo,
        from_page: '1',
      });
      const addSelected = buildAddCartSelected(goods?.attribute || [], lines);
      if (addSelected === '[]') {
        throw new StockCheckError(
          StockCheckErrorType.API_ERROR,
          '所选规格在商品详情里已不存在'
        );
      }

      // ② 加购（抓包 2.3）：补齐抓包里的来源参数与保险开关，selected 用 color+item 嵌套结构
      const cart = await this.client.post<{ rec_id?: string | number }>(EP.CART_ADD, {
        goods_id: goodsId,
        selected: addSelected,
        ...CART_ADD_SOURCE,
        add_cart_id: addCartId,
        event_id: eventId,
        landing_event_id: eventId,
      });
      recIds = String(cart?.rec_id ?? '');
      if (!recIds) {
        throw new StockCheckError(
          StockCheckErrorType.API_ERROR,
          '加入购物车失败：未返回 rec_id（商品可能已下架或该规格无货）'
        );
      }

      // ③ 购物车明细（抓包 2.6）：cart_id 的唯一来源
      const carts = await this.client.post<YishouCartsBySupplyRaw>(EP.CARTS_BY_SUPPLY);
      const group = pickCartGroup(carts, { recId: recIds, goodsId, goodsNo });
      const cartLines: YishouCartLineRaw[] = group ? pickCartLines(group, lines) : [];
      if (cartLines.length === 0) {
        throw new StockCheckError(
          StockCheckErrorType.API_ERROR,
          '购物车里找不到本次加购的规格（可能已被抢完）'
        );
      }

      // ④ 算折（抓包 2.7）：只用于展示，失败不阻断主链路
      let activityDiscount: number | undefined;
      try {
        const activities = await this.client.post<YishouCartActivitiesRaw>(EP.CART_ACTIVITIES, {
          select_goods: buildSelectGoods(group!, cartLines, addCartId),
        });
        activityDiscount = toOptionalNumber(activities?.discount_amount);
      } catch {
        // 算折是展示增强，拿不到不影响结算与建单
      }

      // ⑤ 结算确认（抓包 2.11）：selected 必须带真实 cart_id，且不带 is_df（抓包没有）
      const confirm = await this.client.post<YishouConfirmRaw>(EP.ORDER_CONFIRM, {
        rec_ids: recIds,
        selected: buildConfirmSelected(cartLines),
        address_id: address.addressId,
      });

      const stock: YishouConfirmStockRaw[] = Array.isArray(confirm?.stock) ? confirm.stock : [];
      const items: CheckoutSettledItem[] = toSettledItems(stock);
      const num = resolveSettledNum(confirm, stock);
      const payTools = (confirm?.pay_tool || []).map(item => String(item.pay_tool ?? ''));
      const selectedExpress = resolveSelectedExpress(confirm?.express_options_v2);

      const protocol: YishouCheckoutProtocol = {
        recIds,
        goodsId,
        goodsNo,
        stock,
        selectedExpress,
        address,
        payId,
        uid,
      };

      return {
        items,
        num,
        goodsAmount: toOptionalNumber(confirm?.price_tolal ?? confirm?.goods_amount_total),
        shippingFee: toOptionalNumber(confirm?.shipping_fee ?? confirm?.shipping_fee_total),
        ...(activityDiscount !== undefined ? { activityDiscount } : {}),
        payTools,
        address: confirm?.default_address
          ? mapYishouAddress(confirm.default_address as YishouAddressRaw)
          : address,
        protocol,
      };
    } catch (error) {
      // 加购成功后任意一步失败：清掉购物车，避免残留累加
      if (recIds) {
        await this.deleteCart(recIds).catch(() => undefined);
      }
      throw error;
    }
  }

  /** 从协议句柄里安全地取出下单上下文 */
  private readProtocol(protocol: unknown): YishouCheckoutProtocol {
    const value = protocol as YishouCheckoutProtocol | null;
    if (!value || typeof value !== 'object' || !value.recIds || !Array.isArray(value.stock)) {
      throw new StockCheckError(StockCheckErrorType.API_ERROR, '下单上下文缺失，请重新准备结算');
    }
    return value;
  }

  /**
   * 创建订单（抓包 2.15）
   *
   * 任何一次失败都会在服务端留下「订单支付中」临时锁，几分钟内无法再下单，
   * 因此调用前必须先走 prepareCheckout 结算确认。
   *
   * 严格按抓包发：selected（无 cart_id，带 from/piece_together_num）、selected_express、
   * rsa、pay_id、user_address_tag、is_balance_pay；不再发抓包里没有的 custom_note /
   * is_other / is_send_logistics / is_merge_order / is_no_invoice / is_df。
   */
  async createOrder(protocol: unknown, payTool: string): Promise<YishouCreateOrderData> {
    this.client.requireAuth(AUTH_MESSAGE);
    const ctx = this.readProtocol(protocol);
    const { address } = ctx;

    const data = await this.client.post<{
      order_sn?: string;
      pay_status?: string;
      order_amount?: string;
      /** 响应里的 pay_tool 是内部渠道码（实测为 "12"），不是支付方式，别用它 */
      pay_tool?: string;
      /** 真正的支付方式（实测 "1"），与请求传入的 pay_tool 一致 */
      current_pay_tool?: string;
      pay_params?: Record<string, unknown>;
    }>(EP.ORDER_CREATE, {
      rec_ids: ctx.recIds,
      selected: buildCreateSelected(ctx.stock),
      selected_express: JSON.stringify(ctx.selectedExpress),
      rsa: buildRsa(),
      pay_id: ctx.payId,
      ...CREATE_ORDER_CONSTANTS,
      consignee: address.consignee,
      province: address.province,
      city: address.city,
      district: address.district,
      address: address.address,
      mobile: address.mobile,
      pay_tool: payTool,
    });

    const orderSn = String(data?.order_sn ?? '');
    if (!orderSn) {
      throw new StockCheckError(StockCheckErrorType.API_ERROR, '下单失败：未返回订单号');
    }

    return {
      orderSn,
      payStatus: data?.pay_status || 'wait_pay',
      orderAmount: toOptionalNumber(data?.order_amount),
      // create 响应的 pay_tool 是内部渠道码（实测 "12"），真正的支付方式是
      // current_pay_tool，缺失时回落到请求里带去的值（编排层已按结算结果选好）。
      payTool: data?.current_pay_tool || payTool,
      payParams: data?.pay_params,
    };
  }

  /** 放弃结算：清掉 prepareCheckout 加购的商品 */
  async discardCheckout(protocol: unknown): Promise<void> {
    const ctx = this.readProtocol(protocol);
    await this.deleteCart(ctx.recIds);
  }

  /** 删除购物车商品（内部清理用，也供适配器委托） */
  async deleteCart(recIds: string): Promise<void> {
    this.client.requireAuth(AUTH_MESSAGE);
    await this.client.post<unknown>(EP.CART_DELETE, { rec_ids: recIds });
  }

  /**
   * 订单详情摘要（金额 + 支付截止时间）
   *
   * create_order_v4 其实已直接返回 order_amount，这里只在缺失时兜底回查；
   * cancel_expire 是秒级时间戳。
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

  // ==================== 待支付订单续期（抓包 1.1 / 1.4） ====================

  /**
   * 续期确认（抓包 1.1）：只传 order_sn，取回重新结算上下文
   *
   * remainingSeconds 用服务端自己的 cancel_expire - current_timestamp 计算，
   * 编排层据此判断是否进入「剩余 < 5 分钟」窗口，避免本地时钟偏差。
   */
  async confirmWaitPayOrder(orderSn: string): Promise<WaitPayConfirmData> {
    this.client.requireAuth(AUTH_MESSAGE);

    const data = await this.client.post<YishouWaitPayConfirmRaw>(EP.ORDER_CONFIRM_WAIT_PAY, {
      order_sn: orderSn,
    });

    return parseWaitPayConfirm(data, orderSn);
  }

  /** 从续期协议句柄里安全取出上下文 */
  private readRenewProtocol(protocol: unknown): YishouRenewProtocol {
    const value = protocol as YishouRenewProtocol | null;
    if (
      !value ||
      typeof value !== 'object' ||
      !value.orderSn ||
      !Array.isArray(value.stock) ||
      !value.address
    ) {
      throw new StockCheckError(
        StockCheckErrorType.API_ERROR,
        '续期上下文缺失，请重新确认待支付订单'
      );
    }
    return value;
  }

  /**
   * 重新提交待支付订单（抓包 1.4）：刷新支付有效期
   *
   * 参数全部来自 confirmWaitPayOrder 的实时响应，不放建单用的 pay_id / rec_ids。
   * 与 createOrder 一样，reload 是写操作、失败可能留下「订单支付中」临时锁，
   * 调用方必须自己控制频率与冷却。
   */
  async reloadWaitPayOrder(protocol: unknown): Promise<RenewOrderResult> {
    this.client.requireAuth(AUTH_MESSAGE);
    const ctx = this.readRenewProtocol(protocol);
    if (ctx.selectedExpress.length === 0) {
      throw new StockCheckError(
        StockCheckErrorType.API_ERROR,
        '订单未返回可用快递，跳过续期以避免提交无效参数'
      );
    }

    const data = await this.client.post<YishouReloadWaitPayRaw>(
      EP.ORDER_RELOAD_WAIT_PAY,
      buildReloadRequest(ctx)
    );

    const orderSn = String(data?.order_sn ?? ctx.orderSn);
    const payStatus = String(data?.pay_status ?? 'wait_pay');
    const seconds = Number(data?.cancel_expire);

    return {
      orderSn,
      payStatus,
      orderAmount: toOptionalNumber(data?.order_amount),
      ...(Number.isFinite(seconds) && seconds > 0 ? { cancelExpireAt: seconds * 1000 } : {}),
      // 响应里的 pay_tool 是内部渠道码（实测 "12"），真正的支付方式是 current_pay_tool
      payTool: data?.current_pay_tool ? String(data.current_pay_tool) : ctx.payTool,
      finished: payStatus !== 'wait_pay',
    };
  }
}
