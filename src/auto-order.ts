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

/** 订单详情里自动下单关心的字段（create 响应没有金额，必须回查） */
export interface AutoOrderOrderBrief {
  /** 支付截止时间（毫秒时间戳） */
  expireAt?: number;
  /** 订单实际应付金额 */
  orderAmount?: number;
}

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
  /** 订单详情（回查金额与支付截止时间），可选 */
  getOrderDetail?(orderSn: string): Promise<AutoOrderOrderBrief>;
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
  /** 购买件数（实际可买数量） */
  num?: number;
  /** 用户配置的购买件数 */
  requestedNum?: number;
  /** 库存不足，实际件数少于配置件数 */
  numReduced?: boolean;
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

/**
 * 建单失败后的冷却时长
 *
 * 一手对任何一次 create_order_v4 失败（含 500）都会写「订单支付中」临时锁，
 * 实测 3-5 分钟内同商品无法再下单。冷却期内继续检测、不重复建单。
 */
export const CREATE_LOCK_COOLDOWN_MS = 3 * 60_000;

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

/** 判断是否是一手服务端 5xx（建单 5xx 会留下「订单支付中」锁，不能自动重试） */
const isServerError = (error: unknown): boolean =>
  error instanceof StockCheckError &&
  error.type === StockCheckErrorType.API_ERROR &&
  /HTTP 请求失败: 5\d\d|服务异常|系统繁忙/.test(error.message);

/** 创建订单没有返回金额时，用 confirm 的商品金额 + 运费估算（不含券/活动抵扣） */
const estimateAmount = (confirm: YishouConfirmOrderData): number | undefined => {
  if (confirm.goodsAmount === undefined) {
    return undefined;
  }
  return Math.round((confirm.goodsAmount + (confirm.shippingFee ?? 0)) * 100) / 100;
};

/**
 * 选一个 confirm 认可的支付方式
 *
 * confirm 返回的 pay_tool[] 才是该账号当前可用的方式（实测只有 1 支付宝 / 4 微信），
 * 配置里选的方式不可用时回落到微信，再不行用第一个，避免建单直接 400。
 */
const resolvePayTool = (configured: string, available: string[]): string => {
  if (available.length === 0 || available.includes(configured)) {
    return configured;
  }
  if (available.includes(DEFAULT_AUTO_ORDER_PAY_TOOL)) {
    return DEFAULT_AUTO_ORDER_PAY_TOOL;
  }
  return available[0];
};

/** 规范化购买件数 */
const normalizeNum = (num?: number): number => {
  const value = Math.floor(Number(num ?? 1));
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.min(value, MAX_AUTO_ORDER_NUM);
};

/**
 * 结算回传的实际件数
 *
 * 一手在库存不足时会按剩余库存削减数量，真实可买件数以 num_total 为准；
 * 该字段缺失时退回累加 stock 里的 num。
 */
const resolveActualNum = (confirm: YishouConfirmOrderData): number => {
  if (confirm.numTotal && confirm.numTotal > 0) {
    return confirm.numTotal;
  }
  return confirm.stock.reduce((total, item) => {
    const value = Number.parseInt(String(item?.num ?? ''), 10);
    return Number.isFinite(value) && value > 0 ? total + value : total;
  }, 0);
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
  /** 实际下单件数（已被库存削减） */
  num: number;
  /** 用户配置的件数 */
  requestedNum: number;
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
  const requestedNum = normalizeNum(config.num);
  /** 本次实际尝试的件数：选规格后会按可售库存削减，失败信息里也用它 */
  let num = requestedNum;

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
          { num: requestedNum }
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
        result: failure('sku', '该商品当前没有可售规格', { retryable: true, num: requestedNum }),
      };
    }

    // 能买多少买多少：可售库存不足配置件数时按库存下单。
    // 否则库存只剩 1~2 件时，配置 5 件的任务会一直空等补货，永远抢不到。
    num = Math.max(1, Math.min(requestedNum, pick.saleStock));
    const skuLabel = [pick.color, pick.size].filter(Boolean).join(' / ');
    const selected = JSON.stringify([{ sku: pick.skuId, num: String(num) }]);

    // ③ 加购
    stage = 'cart';
    const cart = await adapter.addToCart(goodsId, pick.skuId, num);
    recId = cart.recId;

    // ④ 结算确认：库存真没了就别去建单，避免触发一手那边的锁单
    stage = 'confirm';
    const confirm = await adapter.confirmOrder(recId, selected, address.addressId);

    // 结算时一手会按剩余库存结算：out_stock 只代表部分失效，
    // 只要还有可买件数就继续建单，不再因为 out_stock 非空直接放弃。
    const actualNum = resolveActualNum(confirm);

    if (confirm.stock.length === 0 || actualNum <= 0) {
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

    // 结算件数大于本次加购数量，说明购物车里还留着上一轮没清掉的条目，
    // 直接建单会多买：清掉重来，下一轮按正确数量下单。
    if (actualNum > num) {
      await adapter.deleteCart(recId).catch(() => undefined);
      recId = null;
      return {
        ok: false,
        result: failure('confirm', '购物车存在残留商品，已清理，下一轮重新下单', {
          retryable: true,
          sku: pick.skuId,
          skuLabel,
          num,
        }),
      };
    }

    return {
      ok: true,
      prepared: { address, sku: pick, skuLabel, num: actualNum, requestedNum, recId, confirm },
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
  const configuredPayTool = params.config.payTool || DEFAULT_AUTO_ORDER_PAY_TOOL;
  const prepared = await prepareOrder(adapter, params);

  if (!prepared.ok) {
    return prepared.result;
  }

  const { address, sku, skuLabel, num, requestedNum, recId, confirm } = prepared.prepared;
  const payTool = resolvePayTool(configuredPayTool, confirm.payTools);

  try {
    const created = await adapter.createOrder({
      recIds: recId,
      stock: confirm.stock,
      address: confirm.defaultAddress?.addressId ? confirm.defaultAddress : address,
      payTool,
    });

    // create_order_v4 不返回金额，金额和支付截止时间都要回查订单详情；查不到不影响下单结果
    let expireAt: number | undefined;
    let orderAmount = created.orderAmount ?? estimateAmount(confirm);

    if (adapter.getOrderDetail) {
      const detail = await adapter.getOrderDetail(created.orderSn).catch(() => undefined);
      expireAt = detail?.expireAt;
      orderAmount = detail?.orderAmount ?? orderAmount;
    }

    return {
      success: true,
      stage: 'done',
      orderSn: created.orderSn,
      orderAmount,
      payTool: created.payTool || payTool,
      sku: sku.skuId,
      skuLabel,
      num,
      requestedNum,
      numReduced: num < requestedNum,
      recId,
      expireAt,
      message:
        num < requestedNum
          ? `已创建待付款订单（库存不足，按实际可买 ${num} 件下单）`
          : '已创建待付款订单',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // 建单失败时购物车里还留着刚加的商品，不清理的话下一轮加购会累加数量，可能买多件。
    // 结果未知（超时/中断）时先不动，避免干扰可能已经存在的订单。
    if (!isUncertainError(error)) {
      await adapter.deleteCart(recId).catch(() => undefined);
    }

    if (isAuthMessage(message)) {
      return failure('create', `一手登录态失效：${message}`, { num });
    }

    if (isUncertainError(error)) {
      return failure('create', `建单请求中断，订单可能已生成，请到 App 核对：${message}`, {
        uncertain: true,
        cooldownMs: CREATE_LOCK_COOLDOWN_MS,
        num,
      });
    }

    // 建单 5xx：一手会在服务端写入「订单支付中」临时锁，几分钟内同商品无法再下单
    if (isServerError(error)) {
      return failure(
        'create',
        `建单返回服务端错误，订单未确认且可能已触发锁单（3-5 分钟内同商品无法再下单），请先到 App「我的订单」核对：${message}`,
        { uncertain: true, cooldownMs: CREATE_LOCK_COOLDOWN_MS, num }
      );
    }

    if (isOutOfStockMessage(message)) {
      return failure('create', message, {
        retryable: true,
        cooldownMs: CREATE_LOCK_COOLDOWN_MS,
        num,
      });
    }

    return failure('create', message, { cooldownMs: CREATE_LOCK_COOLDOWN_MS, num });
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

  const { address, sku, skuLabel, num, requestedNum, recId, confirm } = prepared.prepared;

  // 预检不建单，把购物车清干净
  await adapter.deleteCart(recId).catch(() => undefined);

  return {
    success: true,
    sku: sku.skuId,
    skuLabel,
    num,
    requestedNum,
    numReduced: num < requestedNum,
    goodsAmount: confirm.goodsAmount,
    shippingFee: confirm.shippingFee,
    payTools: confirm.payTools,
    addressText: [address.area, address.address].filter(Boolean).join(' '),
    message: num < requestedNum ? `库存不足，将按 ${num} 件下单` : '可以下单',
  };
};
