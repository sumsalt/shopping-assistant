/**
 * 价格监控 - 循环检查商品拿货价并发送邮件通知
 *
 * 与库存监控的区别：
 * 1. 只监控登录态（uid + token）下的 shop_price，游客价口径不同，不能用于比价
 * 2. 检测到变化后不停止，持续监控直到时长结束或被取消
 * 3. 首次检测只建立基线，不发送通知
 * 4. 不做额外通知冷却：检测间隔（最短 60 秒）就是最小提醒间隔
 */

import { getAdapter, getOrderAdapter } from './adapters';
import type { AdapterConfig } from './adapters';
import type {
  AutoOrderConfig,
  AutoOrderItem,
  AutoOrderStage,
  CouponInfo,
  CouponNewInfo,
  Platform,
  PriceSnapshot,
} from './types';
import { StockCheckError, StockCheckErrorType } from './types';
import {
  sendEmail,
  createPriceChangeTemplate,
  createAutoOrderTemplate,
  createAutoOrderFailedTemplate,
} from './email';
import { placeAutoOrder } from './auto-order';
import { runWithGateContext } from './utils/request-gate';

/** 检测间隔硬下限（秒），需求要求大于 1 分钟一次 */
export const MIN_PRICE_MONITOR_INTERVAL = 60;

/** 默认检测间隔（秒） */
export const DEFAULT_PRICE_MONITOR_INTERVAL = 60;

/** 默认最小价格变动（元） */
export const DEFAULT_MIN_PRICE_DELTA = 0.01;

/**
 * 通知条件
 * - any: 涨跌都通知
 * - drop: 仅降价
 * - rise: 仅涨价
 */
export type PriceNotifyOn = 'any' | 'drop' | 'rise';

/**
 * 价格变化信息
 */
export interface PriceChangeInfo {
  /** 商品ID */
  productId: string;
  /** 商品名称 */
  productName: string;
  /** 变化前价格 */
  previousPrice: number;
  /** 变化后价格 */
  currentPrice: number;
  /** 变动金额（正数为涨价） */
  delta: number;
  /** 变动百分比（正数为涨价） */
  deltaPercent: number;
  /** 变动方向 */
  direction: 'up' | 'down';
  /** 检测时间（毫秒时间戳） */
  detectedAt: number;
}

/**
 * 单张优惠券的变化项（用于邮件与历史记录展示）
 */
export interface CouponChangeItem {
  /** 券类型 */
  kind: '红包' | '满减券';
  /** 展示文案 */
  label: string;
}

/**
 * 优惠券变化信息
 */
export interface CouponChangeInfo {
  /** 新增的券 */
  added: CouponChangeItem[];
  /** 失效/被替换的券 */
  removed: CouponChangeItem[];
  /** 检测时间（毫秒时间戳） */
  detectedAt: number;
}

/**
 * 价格监控任务
 */
export interface PriceMonitorTask {
  /** 监控请求参数 */
  request: {
    /** 平台类型 */
    platform: Platform;
    /** 商品ID */
    productId: string;
  };
  /** 收件人邮箱地址 */
  recipient: string;
  /** 邮件主题（可选） */
  subject?: string;
  /** 商品名称（可选，用于初始展示） */
  productName?: string;
  /** 商品图片 URL（可选） */
  productImage?: string;
}

/**
 * 价格触发的自动下单配置
 *
 * 和到货下单的区别只在于触发条件：这里盯的是拿货价，价格 ≤ targetPrice 就下单。
 */
export interface PriceAutoOrderConfig extends AutoOrderConfig {
  /** 目标价（元）：拿货价低于或等于该值时自动下单 */
  targetPrice: number;
  /** 只在这些规格里下单；空表示全部规格参与 */
  skus?: string[];
}

/**
 * 价格监控配置
 */
export interface PriceMonitorConfig {
  /** 轮次间隔时间（秒），最小 60，默认 60 */
  interval?: number;
  /** 循环总时长（秒），不传则无限循环 */
  duration?: number;
  /** 平台请求配置（必须包含带登录态的账号快照） */
  adapterConfig?: AdapterConfig;
  /** 通知条件，默认 any */
  notifyOn?: PriceNotifyOn;
  /** 最小价格变动（元），默认 0.01 */
  minPriceDelta?: number;
  /** 价格到点自动下单（可选） */
  autoOrder?: PriceAutoOrderConfig;
  /** 初始基线快照（由创建任务时预取） */
  initialSnapshot?: PriceSnapshot;
  /** 续跑时的已检测次数（重启后继续累加，避免进度归零） */
  initialCheckCount?: number;
  /** 续跑时的已通知次数 */
  initialDetectedCount?: number;
  /** 任务 ID（用于全局请求闸门的公平调度） */
  taskId?: string;
}

/**
 * 价格监控结果（单个商品的当前状态）
 */
export interface PriceMonitorResult {
  /** 监控的商品ID */
  productId: string;
  /** 商品名称 */
  productName: string;
  /** 本次检测是否触发通知 */
  detected: boolean;
  /** 价格变化信息（触发通知且价格满足条件时） */
  changeInfo?: PriceChangeInfo;
  /** 优惠券变化信息（触发通知时） */
  couponChangeInfo?: CouponChangeInfo;
  /** 当前红包列表（用于落盘基线） */
  coupons?: CouponInfo[];
  /** 当前满减券列表（用于落盘基线） */
  couponsNew?: CouponNewInfo[];
  /** 当前价格 */
  currentPrice?: number;
  /** 本次是否因价格到点触发了自动下单 */
  orderTriggered?: boolean;
  /** 自动下单成功的订单号 */
  orderSn?: string;
  /** 订单金额 */
  orderAmount?: number;
  /** 支付截止时间（毫秒时间戳） */
  orderExpireAt?: number;
  /** 下单规格（多规格合单时用「、」连接） */
  orderSkuLabel?: string;
  /** 下单明细 */
  orderItems?: AutoOrderItem[];
  /** 实际下单件数 */
  orderNum?: number;
  /** 下单失败原因 */
  orderError?: string;
  /** 本轮因商品无货跳过了下单（没有真正发起下单请求） */
  orderSkipped?: 'no_stock';
  /** 下单失败所处阶段 */
  orderStage?: AutoOrderStage;
  /** 建单结果未知（需要人工核对） */
  orderUncertain?: boolean;
  /** 下单尝试次数 */
  orderAttempts?: number;
  /** 发送邮件是否成功 */
  emailSent?: boolean;
  /** 错误信息 */
  error?: string;
  /** 错误类型 */
  errorType?: StockCheckErrorType;
  /** 检测次数 */
  checkCount: number;
  /** 错误次数 */
  errorCount?: number;
}

/**
 * 价格监控进度信息
 */
export interface PriceMonitorProgress {
  /** 当前已运行时间（秒） */
  elapsedTime: number;
  /** 总时长（秒） */
  duration?: number;
  /** 进度百分比 */
  progress?: number;
  /** 已检测次数 */
  checkCount: number;
  /** 已触发通知次数 */
  detectedCount: number;
  /** 当前价格 */
  currentPrice?: number;
}

/**
 * 进度回调函数类型
 */
export type PriceProgressCallback = (progress: PriceMonitorProgress) => void;

/**
 * 结果回调函数类型
 */
export type PriceResultCallback = (result: PriceMonitorResult) => void;

/**
 * 睡眠函数
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * 比较两次价格快照
 *
 * @param previous 上一次快照
 * @param current 当前快照
 * @param minPriceDelta 最小变动金额，低于该值视为无变化
 * @returns 价格变化信息，无变化时返回 null
 */
export const comparePrice = (
  previous: PriceSnapshot,
  current: PriceSnapshot,
  minPriceDelta: number = DEFAULT_MIN_PRICE_DELTA
): PriceChangeInfo | null => {
  const previousPrice = previous.shopPrice;
  const currentPrice = current.shopPrice;

  // 保留两位小数，避免浮点误差
  const delta = Math.round((currentPrice - previousPrice) * 100) / 100;

  // 价格无效（如接口异常返回 0）时不判定为变化
  if (!Number.isFinite(delta) || previousPrice <= 0 || currentPrice <= 0) {
    return null;
  }

  if (Math.abs(delta) + 1e-9 < minPriceDelta) {
    return null;
  }

  return {
    productId: current.productId,
    productName: current.productName,
    previousPrice,
    currentPrice,
    delta,
    deltaPercent: Math.round((delta / previousPrice) * 10000) / 100,
    direction: delta > 0 ? 'up' : 'down',
    detectedAt: current.capturedAt,
  };
};

/**
 * 把快照里的优惠券整理成可比较的键值对
 *
 * 红包按「券 ID + 标题」区分；满减券同一券 ID 可能有多档门槛，按「券 ID + 门槛 + 减免」区分。
 */
const collectCoupons = (snapshot: PriceSnapshot): Map<string, CouponChangeItem> => {
  const coupons = new Map<string, CouponChangeItem>();

  for (const coupon of snapshot.coupons ?? []) {
    const label = [coupon.typeTitle, coupon.title].filter(Boolean).join('：') || `红包 ${coupon.couponId}`;
    coupons.set(`coupon:${coupon.couponId}:${label}`, { kind: '红包', label });
  }

  for (const coupon of snapshot.couponsNew ?? []) {
    const label = `满${coupon.threshold}减${coupon.reduce}`;
    coupons.set(`couponNew:${coupon.couponId}:${coupon.threshold}:${coupon.reduce}`, {
      kind: '满减券',
      label,
    });
  }

  return coupons;
};

/**
 * 比较两次快照的优惠券列表
 *
 * 只关心券的新增与失效（满减券门槛/金额变了会表现为一删一增），
 * 没有变化时返回 null。
 */
export const compareCoupons = (
  previous: PriceSnapshot,
  current: PriceSnapshot
): CouponChangeInfo | null => {
  const before = collectCoupons(previous);
  const after = collectCoupons(current);

  const added: CouponChangeItem[] = [];
  const removed: CouponChangeItem[] = [];

  for (const [key, item] of after) {
    if (!before.has(key)) {
      added.push(item);
    }
  }

  for (const [key, item] of before) {
    if (!after.has(key)) {
      removed.push(item);
    }
  }

  if (added.length === 0 && removed.length === 0) {
    return null;
  }

  return { added, removed, detectedAt: current.capturedAt };
};

/**
 * 判断价格变化是否满足通知条件
 */
export const shouldNotifyPriceChange = (
  change: PriceChangeInfo,
  notifyOn: PriceNotifyOn = 'any'
): boolean => {
  if (notifyOn === 'drop') {
    return change.direction === 'down';
  }
  if (notifyOn === 'rise') {
    return change.direction === 'up';
  }
  return true;
};

/**
 * 监控单个商品价格
 *
 * @param task 监控任务（一个任务只包含一个商品）
 * @param config 监控配置
 * @param progressCallback 进度回调（可选）
 * @param resultCallback 结果回调（可选）
 * @returns Promise<PriceMonitorResult>
 */
export const monitorPrice = async (
  task: PriceMonitorTask,
  config: PriceMonitorConfig = {},
  progressCallback?: PriceProgressCallback,
  resultCallback?: PriceResultCallback
): Promise<PriceMonitorResult> => {
  return createCancellablePriceMonitor(task, config, progressCallback, resultCallback).promise;
};

/**
 * 创建可取消的价格监控
 *
 * 一个任务只监控一个商品，请求节奏由全局请求闸门统一控制。
 *
 * @param task 监控任务
 * @param config 监控配置
 * @param progressCallback 进度回调（可选）
 * @param resultCallback 结果回调（可选）
 * @returns AbortController 和 Promise
 */
export const createCancellablePriceMonitor = (
  task: PriceMonitorTask,
  config: PriceMonitorConfig = {},
  progressCallback?: PriceProgressCallback,
  resultCallback?: PriceResultCallback
) => {
  const controller = new AbortController();
  const { signal } = controller;

  // 打上任务上下文：循环内所有 HTTP 请求都会经过全局请求闸门（用户手动操作无上下文，不受限）
  const promise = runWithGateContext(
    {
      taskId: config.taskId || 'price-monitor',
      kind: 'price',
    },
    async (): Promise<PriceMonitorResult> => {
      const {
        interval = DEFAULT_PRICE_MONITOR_INTERVAL,
        duration,
        adapterConfig = {},
        notifyOn = 'any',
        minPriceDelta = DEFAULT_MIN_PRICE_DELTA,
        autoOrder,
        initialSnapshot,
        initialCheckCount = 0,
        initialDetectedCount = 0,
      } = config;

      // 校验参数
      if (!task?.request?.productId) {
        throw new Error('监控商品不能为空');
      }

      if (interval < MIN_PRICE_MONITOR_INTERVAL) {
        throw new Error(`检测间隔不能小于 ${MIN_PRICE_MONITOR_INTERVAL} 秒`);
      }

      if (duration !== undefined && duration <= 0) {
        throw new Error('循环总时长必须大于 0');
      }

      if (!adapterConfig.uid || !adapterConfig.token) {
        throw new StockCheckError(
          StockCheckErrorType.AUTH_REQUIRED,
          '价格监控需要登录态，请先在账号管理中选择带登录态的账号'
        );
      }

      const adapter = getAdapter(task.request.platform, adapterConfig);

      // 价格到点自动下单：只在开关打开且目标价有效时建立下单链路
      const autoOrderEnabled = Boolean(autoOrder?.enabled && Number(autoOrder.targetPrice) > 0);
      const orderAdapter = autoOrderEnabled
        ? getOrderAdapter(task.request.platform, adapterConfig)
        : null;

      /** 建单失败会触发一手「订单支付中」临时锁，冷却期内只检测不建单 */
      let orderCooldownUntil = 0;
      /** 已成功下单：结束监控，避免同一任务重复建单 */
      let orderPlaced = false;

      /** 基线快照，首次检测只建立基线不通知 */
      let snapshot: PriceSnapshot | undefined = initialSnapshot;
      let detectedCount = initialDetectedCount;

      const result: PriceMonitorResult = {
        productId: task.request.productId,
        productName: initialSnapshot?.productName || task.productName || '',
        detected: false,
        currentPrice: initialSnapshot?.shopPrice,
        checkCount: initialCheckCount,
        errorCount: 0,
      };

      const startTime = Date.now();

      // 主监控循环
      while (!signal.aborted) {
        const elapsedTime = Math.floor((Date.now() - startTime) / 1000);

        if (duration && elapsedTime >= duration) {
          break;
        }

        try {
          result.error = undefined;
          result.errorType = undefined;
          result.emailSent = undefined;

          const current = await adapter.getPriceInfo(task.request.productId);
          result.checkCount++;

          result.productName = current.productName || result.productName;
          result.currentPrice = current.shopPrice;
          result.coupons = current.coupons;
          result.couponsNew = current.couponsNew;
          // 每轮重置，避免上一轮的下单失败原因一直挂在卡片上
          result.orderError = undefined;
          result.orderSkipped = undefined;

          // 目标价触发：拿货价 ≤ 目标价就下单，与「涨跌通知」相互独立。
          // 首次检测也参与判断——创建任务时价格已经在目标价以下，应该立刻买。
          if (
            autoOrder &&
            autoOrderEnabled &&
            orderAdapter &&
            !orderPlaced &&
            current.shopPrice > 0 &&
            current.shopPrice <= autoOrder.targetPrice
          ) {
            // 商品详情这一次响应本身就带库存状态，无货时直接跳过整条下单链路：
            // 省掉查规格、加购、结算、清购物车四个请求，也不用把「买不到」记成下单失败。
            // 只有明确 inStock === false 才跳过，旧快照缺这个字段时仍按原逻辑尝试。
            if (current.inStock === false) {
              result.orderSkipped = 'no_stock';
              result.orderError = `商品当前无货（${current.stockMessage || '暂时缺货'}），已到目标价，等待补货`;
            } else if (Date.now() < orderCooldownUntil) {
              const waitSeconds = Math.ceil((orderCooldownUntil - Date.now()) / 1000);
              result.orderError = `上次建单失败，冷却中（约 ${waitSeconds} 秒后重试）`;
            } else {
              const orderResult = await placeAutoOrder(orderAdapter, {
                goodsId: current.productId,
                goodsNo: current.productNo,
                config: autoOrder,
                skus: autoOrder.skus ?? [],
              });

              result.orderAttempts = (result.orderAttempts || 0) + 1;
              result.orderStage = orderResult.stage;

              if (!orderResult.success && orderResult.cooldownMs) {
                orderCooldownUntil = Date.now() + orderResult.cooldownMs;
              }

              if (orderResult.success) {
                orderPlaced = true;
                result.orderTriggered = true;
                result.orderSn = orderResult.orderSn;
                result.orderAmount = orderResult.orderAmount;
                result.orderExpireAt = orderResult.expireAt;
                result.orderSkuLabel = orderResult.skuLabel;
                result.orderItems = orderResult.items;
                result.orderNum = orderResult.num;
                result.orderError = undefined;

                const emailResult = await sendEmail({
                  to: task.recipient,
                  subject: `✅ 价格到点已自动下单：${current.productName}（订单 ${orderResult.orderSn}）`,
                  html: createAutoOrderTemplate({
                    productName: current.productName,
                    productImage: task.productImage || current.productImage,
                    orderSn: orderResult.orderSn,
                    orderAmount: orderResult.orderAmount,
                    skuLabel: orderResult.skuLabel,
                    items: orderResult.items,
                    num: orderResult.num,
                    requestedNum: orderResult.requestedNum,
                    payTool: orderResult.payTool,
                    expireAt: orderResult.expireAt,
                  }),
                });

                result.emailSent = emailResult.success;
                if (!emailResult.success) {
                  result.error = emailResult.error;
                }
              } else if (orderResult.retryable) {
                // 没货 / 被抢完：不结束任务，下一轮价格仍达标时会再试
                result.orderError = orderResult.message;
              } else {
                // 登录态失效、配置错误、建单结果未知：继续重试没有意义，停下并告警
                result.orderError = orderResult.message;
                result.orderUncertain = orderResult.uncertain;

                const emailResult = await sendEmail({
                  to: task.recipient,
                  subject: `⚠️ 价格到点自动下单失败：${current.productName}`,
                  html: createAutoOrderFailedTemplate({
                    productName: current.productName,
                    message: orderResult.message || '未知原因',
                    stage: orderResult.stage,
                    uncertain: orderResult.uncertain,
                  }),
                });

                result.emailSent = emailResult.success;
                if (!emailResult.success) {
                  result.error = emailResult.error;
                }

                if (resultCallback) {
                  resultCallback({ ...result });
                }
                break;
              }
            }
          }

          if (!snapshot) {
            // 首次检测：只建立基线，不通知（已下单时保留 detected）
            snapshot = current;
            if (!orderPlaced) {
              result.detected = false;
              result.changeInfo = undefined;
              result.couponChangeInfo = undefined;
            }
          } else {
            const change = comparePrice(snapshot, current, minPriceDelta);
            const couponChange = compareCoupons(snapshot, current);

            // 无论是否通知，都要用最新快照更新基线
            snapshot = current;

            // 价格按 notifyOn 过滤；优惠券变化独立判断，不受涨跌方向限制
            const notifyPrice = Boolean(change && shouldNotifyPriceChange(change, notifyOn));
            const notifyCoupon = Boolean(couponChange);

            if (notifyPrice || notifyCoupon) {
              result.detected = true;
              result.changeInfo = notifyPrice && change ? change : undefined;
              result.couponChangeInfo = notifyCoupon && couponChange ? couponChange : undefined;
              detectedCount++;

              // 本轮已经下单成功：下单邮件已经说清价格与订单，
              // 不再重复发一封价格变动邮件，但变化本身仍然记录。
              if (orderPlaced) {
                if (resultCallback) {
                  resultCallback({ ...result });
                }
                break;
              }

              // 标题把涨跌方向和幅度放在最前面，邮件列表里一眼能看出变化类型
              const parts: string[] = [];
              if (notifyPrice && change) {
                const directionLabel = change.direction === 'down' ? '降价' : '涨价';
                parts.push(`${directionLabel} ${Math.abs(change.deltaPercent).toFixed(2)}%`);
              }
              if (notifyCoupon) {
                parts.push('优惠券变化');
              }

              const emailResult = await sendEmail({
                to: task.recipient,
                subject:
                  task.subject ||
                  `【${parts.join('｜')}】${current.productName}`,
                html: createPriceChangeTemplate(
                  current.productName,
                  notifyPrice && change ? change : null,
                  task.productImage || current.productImage,
                  current.productUrl,
                  notifyCoupon && couponChange ? couponChange : undefined
                ),
              });

              result.emailSent = emailResult.success;

              if (!emailResult.success) {
                result.error = emailResult.error;
                result.errorCount = (result.errorCount || 0) + 1;
              }
            } else {
              result.detected = false;
              result.changeInfo = undefined;
              result.couponChangeInfo = undefined;
            }
          }

          if (resultCallback) {
            resultCallback({ ...result });
          }
        } catch (error) {
          result.checkCount++;
          result.detected = false;
          result.changeInfo = undefined;
          result.error = error instanceof Error ? error.message : String(error);
          result.errorType =
            error instanceof StockCheckError ? error.type : StockCheckErrorType.UNKNOWN_ERROR;
          result.errorCount = (result.errorCount || 0) + 1;

          if (resultCallback) {
            resultCallback({ ...result });
          }

          // 登录态失效属于致命错误，继续跑没有意义
          if (
            error instanceof StockCheckError &&
            error.type === StockCheckErrorType.AUTH_REQUIRED
          ) {
            throw error;
          }
        }

        if (signal.aborted) {
          break;
        }

        // 已成功下单：任务到此结束，继续跑只会重复建单
        if (orderPlaced) {
          break;
        }

        // 触发进度回调
        if (progressCallback) {
          progressCallback({
            elapsedTime,
            duration,
            progress: duration ? Math.floor((elapsedTime / duration) * 100) : undefined,
            checkCount: result.checkCount,
            detectedCount,
            currentPrice: result.currentPrice,
          });
        }

        const elapsedAfterRound = Math.floor((Date.now() - startTime) / 1000);
        if (duration && elapsedAfterRound + interval >= duration) {
          break;
        }

        // 轮次间隔 + 0~2 秒随机抖动
        await sleep(interval * 1000 + Math.random() * 2000);
      }

      return result;
    }
  );

  return { controller, promise };
};
