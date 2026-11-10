/**
 * 有货自动下单
 *
 * 链路（一手平台）：
 *   1. 取收货地址
 *   2. 查 SKU，挑第一个可售规格
 *   3. 加入购物车 → rec_id
 *   4. 结算确认 confirm_order_v4 → 校验库存、拿到下单要回传的 stock 明细
 *   5. 创建订单 create_order_v4 → order_sn
 *
 * 支付（微信小程序 / 支付宝 SDK）必须由人在 App 内完成，服务端只能把订单建出来锁住库存，
 * 因此这里的目标是「尽最大可能在有货瞬间把单建出来」，然后立刻通知人去付款。
 *
 * 失败语义：
 * - retryable=true：当前没货 / 被抢完 / 规格下架，属于正常竞争结果，下一轮继续监控
 * - uncertain=true：建单请求中断（超时、5xx），订单可能已经生成，绝不能自动重试，必须人工核对
 * - 其他：配置或登录态问题，继续重试没有意义，任务应当停下并告警
 */

import { StockCheckError, StockCheckErrorType } from './types';
import type {
  AutoOrderConfig,
  AutoOrderResult,
  AutoOrderStage,
  ProductSkuResult,
  SkuInfo,
  YishouAddress,
  YishouCartAddResult,
  YishouConfirmOrderData,
  YishouConfirmStockItem,
  YishouCreateOrderData,
} from './types';

/** 自动下单所需的最小适配器能力 */
export interface AutoOrderAdapter {
  /** 收货地址列表 */
  getAddresses(): Promise<YishouAddress[]>;
  /** 商品 SKU 列表 */
  getProductSkus(productNo: string): Promise<ProductSkuResult>;
  /** 加入购物车 */
  addToCart(goodsId: string, sku: string, num: number): Promise<YishouCartAddResult>;
  /** 结算确认 */
  confirmOrder(recIds: string, selected: string, addressId: string): Promise<YishouConfirmOrderData>;
  /** 创建订单 */
  createOrder(params: {
    recIds: string;
    stock: YishouConfirmStockItem[];
    address: YishouAddress;
    payTool: string;
  }): Promise<YishouCreateOrderData>;
  /** 删除购物车商品 */
  deleteCart(recIds: string): Promise<void>;
  /** 订单支付截止时间（毫秒时间戳），可选 */
  getOrderExpireAt?(orderSn: string): Promise<number | undefined>;
}

/** 下单参数 */
export interface PlaceOrderParams {
  /** 商品 ID（goods_id） */
  goodsId: string;
  /** 商品货号（goods_no），查 SKU 用 */
  goodsNo: string;
  /** 自动下单配置 */
  config: AutoOrderConfig;
}

/** 预检结果（只加购 + 结算，不建单） */
export interface PrecheckOrderResult {
  success: boolean;
  message?: string;
  /** 命中的规格 */
  sku?: string;
  skuLabel?: string;
  /** 购买件数 */
  num?: number;
  /** 商品金额 */
  goodsAmount?: number;
  /** 运费 */
  shippingFee?: number;
  /** 可用支付方式 */
  payTools?: string[];
  /** 收货地址文案 */
  addressText?: string;
  /** 失败阶段 */
  stage?: AutoOrderStage;
  /** 是否属于「暂时没货」 */
  retryable?: boolean;
}

/** 默认支付方式：微信（一手 App 走小程序支付，1 为支付宝） */
export const DEFAULT_AUTO_ORDER_PAY_TOOL = '4';

/** 单次最多购买件数（防止配置错误一下买一堆） */
export const MAX_AUTO_ORDER_NUM = 99;

/** 判断错误是否属于「暂时没货，可以继续等」 */
const isOutOfStockMessage = (message: string): boolean =>
  /库存不足|售罄|抢完|已售完|下架|补货|无货|已抢光|该规格/.test(message);

/** 判断错误是否属于登录态问题 */
const isAuthMessage = (message: string): boolean => /登录|token|未授权/i.test(message);

/** 判断错误是否属于「请求中断、结果未知」 */
const isUncertainError = (error: unknown): boolean => {
  if (error instanceof StockCheckError) {
    return (
      error.type === StockCheckErrorType.NETWORK_ERROR ||
      error.type === StockCheckErrorType.REQUEST_GATE_TIMEOUT
    );
  }
  return error instanceof Error && /超时|timeout|ECONNRESET|socket hang up/i.test(error.message);
};

/** 规范化购买件数 */
const normalizeNum = (num?: number): number => {
  const value = Math.floor(Number(num ?? 1));
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.min(value, MAX_AUTO_ORDER_NUM);
};

/** 构造失败结果 */
const failure = (
  stage: AutoOrderStage,
  message: string,
  extra: Partial<AutoOrderResult> = {}
): AutoOrderResult => ({
  success: false,
  stage,
  message,
  ...extra,
});

/** 加购 + 结算之后的中间态 */
interface PreparedOrder {
  address: YishouAddress;
  sku: SkuInfo;
  skuLabel: string;
  num: number;
  recId: string;
  confirm: YishouConfirmOrderData;
}

type PrepareOutcome =
  | { ok: true; prepared: PreparedOrder }
  | { ok: false; result: AutoOrderResult };

/**
 * 准备阶段：地址 → 规格 → 加购 → 结算确认
 *
 * 任何一步失败都会把已加入的购物车条目清掉，避免残留。
 */
const prepareOrder = async (
  adapter: AutoOrderAdapter,
  params: PlaceOrderParams
): Promise<PrepareOutcome> => {
  const { goodsId, goodsNo, config } = params;
  const num = normalizeNum(config.num);

  let recId: string | null = null;
  let stage: AutoOrderStage = 'address';

  try {
    // ① 地址：优先用指定地址，否则取第一个（账号默认地址排在最前）
    const addresses = await adapter.getAddresses();
    const address = config.addressId
      ? addresses.find(item => item.addressId === config.addressId)
      : addresses[0];

    if (!address) {
      return {
        ok: false,
        result: failure(
          'address',
          config.addressId ? '指定的收货地址不存在，请重新选择' : '一手账号没有收货地址，请先在 App 中添加',
          { num }
        ),
      };
    }

    // ② 规格：指定了 SKU 就用它，否则取第一个可售规格
    stage = 'sku';
    const skuResult = await adapter.getProductSkus(goodsNo);
    const candidates = config.sku
      ? skuResult.skuList.filter(item => item.skuId === config.sku)
      : skuResult.skuList;
    const pick = candidates.find(item => item.saleStock > 0);

    if (!pick) {
      return {
        ok: false,
        result: failure('sku', '该商品当前没有可售规格', { retryable: true, num }),
      };
    }

    const skuLabel = [pick.color, pick.size].filter(Boolean).join(' / ');
    const selected = JSON.stringify([{ sku: pick.skuId, num: String(num) }]);

    // ③ 加购
    stage = 'cart';
    const cart = await adapter.addToCart(goodsId, pick.skuId, num);
    recId = cart.recId;

    // ④ 结算确认：库存真没了就别去建单，避免触发一手那边的锁单
    stage = 'confirm';
    const confirm = await adapter.confirmOrder(recId, selected, address.addressId);

    if (confirm.stock.length === 0 || confirm.outStock.length > 0) {
      await adapter.deleteCart(recId).catch(() => undefined);
      recId = null;
      return {
        ok: false,
        result: failure('confirm', '结算时该商品已无库存（可能刚被抢完）', {
          retryable: true,
          sku: pick.skuId,
          skuLabel,
          num,
        }),
      };
    }

    return {
      ok: true,
      prepared: { address, sku: pick, skuLabel, num, recId, confirm },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (recId) {
      await adapter.deleteCart(recId).catch(() => undefined);
    }

    if (isAuthMessage(message)) {
      return { ok: false, result: failure(stage, `一手登录态失效：${message}`, { num }) };
    }

    if (isOutOfStockMessage(message)) {
      return { ok: false, result: failure(stage, message, { retryable: true, num }) };
    }

    return { ok: false, result: failure(stage, message, { num }) };
  }
};

/**
 * 执行一次自动下单
 *
 * @param adapter 适配器（一手）
 * @param params 商品与配置
 * @returns 下单结果
 */
export const placeAutoOrder = async (
  adapter: AutoOrderAdapter,
  params: PlaceOrderParams
): Promise<AutoOrderResult> => {
  const payTool = params.config.payTool || DEFAULT_AUTO_ORDER_PAY_TOOL;
  const prepared = await prepareOrder(adapter, params);

  if (!prepared.ok) {
    return prepared.result;
  }

  const { address, sku, skuLabel, num, recId, confirm } = prepared.prepared;

  try {
    const created = await adapter.createOrder({
      recIds: recId,
      stock: confirm.stock,
      address: confirm.defaultAddress?.addressId ? confirm.defaultAddress : address,
      payTool,
    });

    // 支付截止时间：拿不到不影响下单结果
    let expireAt: number | undefined;
    if (adapter.getOrderExpireAt) {
      expireAt = await adapter.getOrderExpireAt(created.orderSn).catch(() => undefined);
    }

    return {
      success: true,
      stage: 'done',
      orderSn: created.orderSn,
      orderAmount: created.orderAmount,
      payTool: created.payTool || payTool,
      sku: sku.skuId,
      skuLabel,
      num,
      recId,
      expireAt,
      message: '已创建待付款订单',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (isAuthMessage(message)) {
      return failure('create', `一手登录态失效：${message}`, { num });
    }

    if (isUncertainError(error)) {
      return failure('create', `建单请求中断，订单可能已生成，请到 App 核对：${message}`, {
        uncertain: true,
        num,
      });
    }

    if (isOutOfStockMessage(message)) {
      return failure('create', message, { retryable: true, num });
    }

    return failure('create', message, { num });
  }
};

/**
 * 预检：完整走一遍「地址 → 规格 → 加购 → 结算」，然后清掉购物车
 *
 * 用来在创建监控任务前确认参数正确、大概多少钱，不会生成订单。
 */
export const precheckAutoOrder = async (
  adapter: AutoOrderAdapter,
  params: PlaceOrderParams
): Promise<PrecheckOrderResult> => {
  const prepared = await prepareOrder(adapter, params);

  if (!prepared.ok) {
    return {
      success: false,
      message: prepared.result.message,
      stage: prepared.result.stage,
      retryable: prepared.result.retryable,
    };
  }

  const { address, sku, skuLabel, num, recId, confirm } = prepared.prepared;

  // 预检不建单，把购物车清干净
  await adapter.deleteCart(recId).catch(() => undefined);

  return {
    success: true,
    sku: sku.skuId,
    skuLabel,
    num,
    goodsAmount: confirm.goodsAmount,
    shippingFee: confirm.shippingFee,
    payTools: confirm.payTools,
    addressText: [address.area, address.address].filter(Boolean).join(' '),
    message: '可以下单',
  };
};
