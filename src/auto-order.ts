/**
 * 自动下单（编排层 / 业务决策）
 *
 * 这一层只负责业务决策，不碰任何一手协议细节：
 *   - 挑地址、挑规格、按可售库存分配件数（能买多少买多少 + 多规格合单）
 *   - 把「买哪些规格、几件」交给适配器 prepareCheckout（加购→购物车→算折→结算一次做完）
 *   - 结算结果校验（库存削减 / 购物车残留）、失败语义、支付方式回落、清购物车
 *   - createOrder 用 prepareCheckout 返回的协议上下文建单
 *
 * selected 的三种形态、cart_id、selected_express、埋点 ID 全部由适配器协议层处理，
 * 这里完全不感知——换平台或改协议时编排层无需改动。
 *
 * 支付（微信小程序 / 支付宝 SDK）必须由人在 App 内完成，服务端只能把订单建出来锁住库存，
 * 因此目标是「尽最大可能在有货瞬间把单建出来」，然后立刻通知人去付款。
 *
 * 失败语义：
 * - retryable=true：当前没货 / 被抢完 / 规格下架，下一轮继续监控
 * - uncertain=true：建单请求中断（超时、5xx），订单可能已经生成，绝不能自动重试
 * - 其他：配置或登录态问题，任务应当停下并告警
 */

import { StockCheckError, StockCheckErrorType } from './types';
import type {
  AutoOrderConfig,
  AutoOrderItem,
  AutoOrderResult,
  AutoOrderStage,
  CheckoutLine,
  CheckoutReady,
  CheckoutSettledItem,
  ProductSkuResult,
  SkuInfo,
  YishouAddress,
  YishouCreateOrderData,
} from './types';

/** 订单详情里自动下单关心的字段（create 已返回金额，回查主要拿支付截止时间） */
export interface AutoOrderOrderBrief {
  /** 支付截止时间（毫秒时间戳） */
  expireAt?: number;
  /** 订单实际应付金额 */
  orderAmount?: number;
}

/** prepareCheckout 的入参：编排层只表达业务意图 */
export interface PrepareCheckoutInput {
  goodsId: string;
  goodsNo: string;
  lines: CheckoutLine[];
  address: YishouAddress;
}

/** 自动下单所需的最小适配器能力（协议细节已封装在适配器内部） */
export interface AutoOrderAdapter {
  /** 收货地址列表 */
  getAddresses(): Promise<YishouAddress[]>;
  /** 商品 SKU 列表 */
  getProductSkus(productNo: string): Promise<ProductSkuResult>;
  /** 准备结算：加购 → 购物车明细 → 算折 → 结算确认，产出业务结论 + 不透明协议上下文 */
  prepareCheckout(input: PrepareCheckoutInput): Promise<CheckoutReady>;
  /** 用 prepareCheckout 的协议上下文建单 */
  createOrder(protocol: unknown, payTool: string): Promise<YishouCreateOrderData>;
  /** 放弃结算，清掉加购的商品 */
  discardCheckout(protocol: unknown): Promise<void>;
  /** 订单详情（回查支付截止时间），可选 */
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
  /**
   * 只在这些规格中挑选（skuId 列表，优先于 config.sku）
   *
   * 传入后只会在这些规格里找有货的那个下单，不会回退到未选中的规格。
   */
  skus?: string[];
  /**
   * 每个有货规格各买 1 件（多规格铺开），直到达到 config.num 的件数上限。
   *
   * 用于「手动一键下单」：不选规格，把所有有货 SKU 各下 1 件，总量受 config.num 约束。
   * 默认 false 时沿用「从第一个有货规格起装满 N 件」的行为。
   */
  onePerSku?: boolean;
}

/** 预检结果（只准备结算 + 结算，不建单） */
export interface PrecheckOrderResult {
  success: boolean;
  message?: string;
  /** 命中的规格（多规格合单时为第一行） */
  sku?: string;
  skuLabel?: string;
  /** 下单明细（多规格合单时有多行） */
  items?: AutoOrderItem[];
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
  /** 活动优惠金额（cart/activities 算出，仅展示） */
  activityDiscount?: number;
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

/** 手动「一键下单」的件数上限：所有有货规格各 1 件，合计不超过此数 */
export const MANUAL_ORDER_MAX_NUM = 5;

/**
 * 建单失败后的冷却时长
 *
 * 一手对任何一次 create_order_v4 失败（含 500）都会写「订单支付中」临时锁，
 * 实测 3-5 分钟内同商品无法再下单。冷却期内继续检测、不重复建单。
 */
export const CREATE_LOCK_COOLDOWN_MS = 3 * 60_000;

/** 判断错误是否属于「暂时没货，可以继续等」 */
const isOutOfStockMessage = (message: string): boolean =>
  /库存不足|售罄|抢完|已售完|下架|补货|无货|已抢光|该规格|不存在/.test(message);

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

/** 结算没给金额时用商品金额 + 运费估算（不含券/活动抵扣） */
const estimateAmount = (ready: CheckoutReady): number | undefined => {
  if (ready.goodsAmount === undefined) {
    return undefined;
  }
  return Math.round((ready.goodsAmount + (ready.shippingFee ?? 0)) * 100) / 100;
};

/**
 * 选一个结算认可的支付方式
 *
 * 结算返回的 payTools[] 才是该账号当前可用的方式（实测只有 1 支付宝 / 4 微信），
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

/** 规格文案：蓝色 / L */
const skuLabelOf = (sku: SkuInfo): string =>
  [sku.color, sku.size].filter(Boolean).join(' / ') || sku.skuId;

/**
 * 按规格顺序分配件数
 *
 * 「能买多少买多少」+ 合单：用户要 5 件、蓝色 1 件、黑色 1 件时，
 * 这一单就是 蓝色×1 + 黑色×1，而不是只买第一个规格的 1 件。
 *
 * onePerSku=true 时改为「每个有货规格各取 1 件」，直到凑满 requestedNum：
 * 用于手动一键下单，把有货的规格都铺上，但总量不超过 requestedNum。
 */
const allocateItems = (
  candidates: SkuInfo[],
  requestedNum: number,
  onePerSku = false
): Array<{ sku: SkuInfo; num: number }> => {
  const allocation: Array<{ sku: SkuInfo; num: number }> = [];
  let remaining = requestedNum;

  for (const item of candidates) {
    if (remaining <= 0) break;
    const available = Math.floor(Number(item.saleStock) || 0);
    if (available <= 0) continue;
    const take = onePerSku ? Math.min(1, available, remaining) : Math.min(available, remaining);
    allocation.push({ sku: item, num: take });
    remaining -= take;
  }

  return allocation;
};

/** 结算明细 → 下单明细（规格文案用本次查到的 SKU 列表补齐） */
const toOrderItems = (
  settled: CheckoutSettledItem[],
  labelOf: Map<string, string>
): AutoOrderItem[] =>
  settled
    .filter(item => item.sku && item.num > 0)
    .map(item => ({ sku: item.sku, skuLabel: labelOf.get(item.sku) || item.sku, num: item.num }));

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

/** 结算准备后的中间态 */
interface PreparedOrder {
  address: YishouAddress;
  /** 下单明细（多规格合单时有多行） */
  items: AutoOrderItem[];
  /** 实际下单件数（已被库存削减） */
  num: number;
  /** 用户配置的件数 */
  requestedNum: number;
  /** 结算就绪结果（含不透明协议上下文，建单/清购物车都要用） */
  ready: CheckoutReady;
}

type PrepareOutcome =
  | { ok: true; prepared: PreparedOrder }
  | { ok: false; result: AutoOrderResult };

/**
 * 准备阶段：地址 → 规格 → 结算准备（适配器内部完成加购/购物车/算折/结算）
 *
 * 适配器 prepareCheckout 内部会自己清理失败时残留的购物车；
 * 这里只在「结算成功但业务校验不通过」时主动 discardCheckout。
 */
const prepareOrder = async (
  adapter: AutoOrderAdapter,
  params: PlaceOrderParams
): Promise<PrepareOutcome> => {
  const { goodsId, goodsNo, config, skus, onePerSku } = params;
  const requestedNum = normalizeNum(config.num);
  let num = requestedNum;
  const wantedSkus = (skus || []).filter(Boolean);
  let ready: CheckoutReady | null = null;
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

    // ② 规格：指定了 SKU 就只在这些里挑，否则全部规格都可参与
    stage = 'sku';
    const skuResult = await adapter.getProductSkus(goodsNo);
    const candidates = wantedSkus.length
      ? skuResult.skuList.filter(item => wantedSkus.includes(item.skuId))
      : config.sku
        ? skuResult.skuList.filter(item => item.skuId === config.sku)
        : skuResult.skuList;

    const allocation = allocateItems(candidates, requestedNum, Boolean(onePerSku));

    if (allocation.length === 0) {
      const hasFilter = wantedSkus.length > 0 || Boolean(config.sku);
      return {
        ok: false,
        result: failure('sku', hasFilter ? '所选规格当前都没有货' : '该商品当前没有可售规格', {
          retryable: true,
          num: requestedNum,
        }),
      };
    }

    num = allocation.reduce((total, item) => total + item.num, 0);
    const skuLabel = allocation.map(item => skuLabelOf(item.sku)).join('、');
    const addedSkus = new Set(allocation.map(item => item.sku.skuId));

    // ③ 结算准备：协议层一次做完加购 → 购物车明细 → 算折 → 结算确认
    stage = 'cart';
    ready = await adapter.prepareCheckout({
      goodsId,
      goodsNo,
      lines: allocation.map(item => ({ sku: item.sku.skuId, num: item.num })),
      address,
    });
    stage = 'confirm';

    const labelOf = new Map(skuResult.skuList.map(item => [item.skuId, skuLabelOf(item)]));
    const items = toOrderItems(ready.items, labelOf);
    const actualNum = ready.num > 0 ? ready.num : items.reduce((total, item) => total + item.num, 0);

    // 结算时一手会按剩余库存结算：只要还有可买件数就继续建单；
    // 完全没货才放弃，避免触发一手那边的锁单。
    if (ready.items.length === 0 || actualNum <= 0) {
      await adapter.discardCheckout(ready.protocol).catch(() => undefined);
      ready = null;
      return {
        ok: false,
        result: failure('confirm', '结算时该商品已无库存（可能刚被抢完）', {
          retryable: true,
          sku: allocation[0].sku.skuId,
          skuLabel,
          num,
        }),
      };
    }

    // 结算里出现本次没加购的规格、或件数比加购的还多，说明购物车有残留：清掉重来。
    const hasUnexpectedSku = items.some(item => !addedSkus.has(item.sku));
    if (hasUnexpectedSku || actualNum > num) {
      await adapter.discardCheckout(ready.protocol).catch(() => undefined);
      ready = null;
      return {
        ok: false,
        result: failure('confirm', '购物车存在残留商品，已清理，下一轮重新下单', {
          retryable: true,
          sku: allocation[0].sku.skuId,
          skuLabel,
          num,
        }),
      };
    }

    // 结算明细缺失时用计划明细兜底，保证结果里仍有规格与件数
    const finalItems =
      items.length > 0
        ? items
        : allocation.map(item => ({ sku: item.sku.skuId, skuLabel: skuLabelOf(item.sku), num: item.num }));

    return {
      ok: true,
      prepared: { address, items: finalItems, num: actualNum, requestedNum, ready },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // 结算成功之后才抛的异常，协议上下文已在手上，需要主动清理购物车
    if (ready) {
      await adapter.discardCheckout(ready.protocol).catch(() => undefined);
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

  const { items, num, requestedNum, ready } = prepared.prepared;
  const skuLabel = items.map(item => item.skuLabel).join('、');
  const payTool = resolvePayTool(configuredPayTool, ready.payTools);

  try {
    const created = await adapter.createOrder(ready.protocol, payTool);

    // create_order_v4 已直接返回金额；回查订单详情只补支付截止时间，查不到不影响下单结果
    let expireAt: number | undefined;
    let orderAmount = created.orderAmount ?? estimateAmount(ready);

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
      sku: items[0]?.sku,
      skuLabel,
      items,
      num,
      requestedNum,
      numReduced: num < requestedNum,
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
      await adapter.discardCheckout(ready.protocol).catch(() => undefined);
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
      return failure('create', message, { retryable: true, cooldownMs: CREATE_LOCK_COOLDOWN_MS, num });
    }
    return failure('create', message, { cooldownMs: CREATE_LOCK_COOLDOWN_MS, num });
  }
};

/**
 * 预检：完整走一遍「地址 → 规格 → 结算准备」，然后清掉购物车
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

  const { address, items, num, requestedNum, ready } = prepared.prepared;
  const skuLabel = items.map(item => item.skuLabel).join('、');
  const detail = items.map(item => `${item.skuLabel} × ${item.num}`).join('、');

  // 预检不建单，把购物车清干净
  await adapter.discardCheckout(ready.protocol).catch(() => undefined);

  return {
    success: true,
    sku: items[0]?.sku,
    skuLabel,
    items,
    num,
    requestedNum,
    numReduced: num < requestedNum,
    goodsAmount: ready.goodsAmount,
    shippingFee: ready.shippingFee,
    activityDiscount: ready.activityDiscount,
    payTools: ready.payTools,
    addressText: [address.area, address.address].filter(Boolean).join(' '),
    message:
      num < requestedNum
        ? `库存不足，将按 ${num} 件下单（${detail}）`
        : `可以下单（${detail}，共 ${num} 件）`,
  };
};
