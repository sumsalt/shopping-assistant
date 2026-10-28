/**
 * 价格监控 - 循环检查商品拿货价并发送邮件通知
 *
 * 与库存监控的区别：
 * 1. 只监控登录态（uid + token）下的 shop_price，游客价口径不同，不能用于比价
 * 2. 检测到变化后不停止，持续监控直到时长结束或被取消
 * 3. 首次检测只建立基线，不发送通知
 * 4. 有通知冷却时间，避免价格反复抖动导致邮件轰炸
 */

import { getAdapter } from './adapters';
import type { AdapterConfig } from './adapters';
import type { Platform, PriceSnapshot } from './types';
import { StockCheckError, StockCheckErrorType } from './types';
import { sendEmail, createPriceChangeTemplate } from './email';

/** 检测间隔硬下限（秒），需求要求大于 1 分钟一次 */
export const MIN_PRICE_MONITOR_INTERVAL = 60;

/** 默认检测间隔（秒） */
export const DEFAULT_PRICE_MONITOR_INTERVAL = 60;

/** 默认多商品之间的最小间隔（秒） */
export const DEFAULT_PRODUCT_GAP_MIN = 10;

/** 默认多商品之间的最大间隔（秒） */
export const DEFAULT_PRODUCT_GAP_MAX = 20;

/** 默认通知冷却时间（秒） */
export const DEFAULT_NOTIFY_COOLDOWN = 300;

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
 * 价格监控配置
 */
export interface PriceMonitorConfig {
  /** 轮次间隔时间（秒），最小 60，默认 60 */
  interval?: number;
  /** 循环总时长（秒），不传则无限循环 */
  duration?: number;
  /** 平台认证配置（必须包含 uid 和 token） */
  adapterConfig?: AdapterConfig;
  /** 通知条件，默认 any */
  notifyOn?: PriceNotifyOn;
  /** 最小价格变动（元），默认 0.01 */
  minPriceDelta?: number;
  /** 通知冷却时间（秒），默认 300 */
  notifyCooldown?: number;
  /** 多商品之间的最小间隔（秒），默认 10 */
  productGapMin?: number;
  /** 多商品之间的最大间隔（秒），默认 20 */
  productGapMax?: number;
  /** 初始基线快照（由创建任务时预取，key 为 productId） */
  initialSnapshots?: Record<string, PriceSnapshot>;
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
  /** 价格变化信息（触发通知时） */
  changeInfo?: PriceChangeInfo;
  /** 当前价格 */
  currentPrice?: number;
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
  /** 各商品当前价格 */
  currentPrices: Record<string, number>;
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
 * 生成指定区间内的随机整数（秒）
 */
const randomBetween = (min: number, max: number): number => {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
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
 * @param task 监控任务
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
  const results = await createCancellablePriceMonitor(
    [task],
    config,
    progressCallback,
    resultCallback
  ).promise;

  return results[0];
};

/**
 * 创建可取消的价格监控
 *
 * @param tasks 监控任务列表
 * @param config 监控配置
 * @param progressCallback 进度回调（可选）
 * @param resultCallback 结果回调（可选）
 * @returns AbortController 和 Promise
 */
export const createCancellablePriceMonitor = (
  tasks: PriceMonitorTask[],
  config: PriceMonitorConfig = {},
  progressCallback?: PriceProgressCallback,
  resultCallback?: PriceResultCallback
) => {
  const controller = new AbortController();
  const { signal } = controller;

  const promise = (async (): Promise<PriceMonitorResult[]> => {
    const {
      interval = DEFAULT_PRICE_MONITOR_INTERVAL,
      duration,
      adapterConfig = {},
      notifyOn = 'any',
      minPriceDelta = DEFAULT_MIN_PRICE_DELTA,
      notifyCooldown = DEFAULT_NOTIFY_COOLDOWN,
      productGapMin = DEFAULT_PRODUCT_GAP_MIN,
      productGapMax = DEFAULT_PRODUCT_GAP_MAX,
      initialSnapshots = {},
    } = config;

    // 校验参数
    if (!tasks || tasks.length === 0) {
      throw new Error('监控任务列表不能为空');
    }

    if (interval < MIN_PRICE_MONITOR_INTERVAL) {
      throw new Error(`检测间隔不能小于 ${MIN_PRICE_MONITOR_INTERVAL} 秒`);
    }

    if (duration !== undefined && duration <= 0) {
      throw new Error('循环总时长必须大于 0');
    }

    if (productGapMin < 0 || productGapMax < productGapMin) {
      throw new Error('商品间隔区间不合法');
    }

    if (!adapterConfig.uid || !adapterConfig.token) {
      throw new StockCheckError(
        StockCheckErrorType.AUTH_REQUIRED,
        '价格监控需要登录态，请先配置 uid 和 token'
      );
    }

    const adapter = getAdapter(tasks[0].request.platform, adapterConfig);

    interface ProductState {
      snapshot?: PriceSnapshot;
      lastNotifiedAt: number;
      result: PriceMonitorResult;
    }

    // 初始化每个商品的状态
    const states = new Map<string, ProductState>();
    tasks.forEach((task) => {
      const key = `${task.request.platform}-${task.request.productId}`;
      const initial = initialSnapshots[task.request.productId];

      states.set(key, {
        snapshot: initial,
        lastNotifiedAt: 0,
        result: {
          productId: task.request.productId,
          productName: initial?.productName || task.productName || '',
          detected: false,
          currentPrice: initial?.shopPrice,
          checkCount: 0,
          errorCount: 0,
        },
      });
    });

    const startTime = Date.now();
    let totalCheckCount = 0;
    let detectedCount = 0;
    let fatalError: StockCheckError | null = null;

    // 主监控循环
    while (!signal.aborted && !fatalError) {
      const elapsedTime = Math.floor((Date.now() - startTime) / 1000);

      if (duration && elapsedTime >= duration) {
        break;
      }

      for (let index = 0; index < tasks.length; index++) {
        if (signal.aborted || fatalError) {
          break;
        }

        const task = tasks[index];
        const key = `${task.request.platform}-${task.request.productId}`;
        const state = states.get(key);

        if (!state) {
          continue;
        }

        try {
          state.result.error = undefined;
          state.result.errorType = undefined;
          state.result.emailSent = undefined;

          const snapshot = await adapter.getPriceInfo(task.request.productId);
          state.result.checkCount++;
          totalCheckCount++;

          state.result.productName = snapshot.productName || state.result.productName;
          state.result.currentPrice = snapshot.shopPrice;

          if (!state.snapshot) {
            // 首次检测：只建立基线，不通知
            state.snapshot = snapshot;
            state.result.detected = false;
            state.result.changeInfo = undefined;
          } else {
            const change = comparePrice(state.snapshot, snapshot, minPriceDelta);
            const now = Date.now();
            const cooldownPassed = now - state.lastNotifiedAt >= notifyCooldown * 1000;

            // 无论是否通知，都要用最新快照更新基线
            state.snapshot = snapshot;

            if (change && shouldNotifyPriceChange(change, notifyOn) && cooldownPassed) {
              state.result.detected = true;
              state.result.changeInfo = change;
              state.lastNotifiedAt = now;
              detectedCount++;

              const emailResult = await sendEmail({
                to: task.recipient,
                subject:
                  task.subject ||
                  `价格变动提醒：${snapshot.productName} ${
                    change.direction === 'down' ? '降价' : '涨价'
                  }`,
                html: createPriceChangeTemplate(
                  snapshot.productName,
                  change,
                  task.productImage || snapshot.productImage,
                  snapshot.productUrl
                ),
              });

              state.result.emailSent = emailResult.success;

              if (!emailResult.success) {
                state.result.error = emailResult.error;
                state.result.errorCount = (state.result.errorCount || 0) + 1;
              }
            } else {
              state.result.detected = false;
              state.result.changeInfo = undefined;
            }
          }

          if (resultCallback) {
            resultCallback({ ...state.result });
          }
        } catch (error) {
          state.result.checkCount++;
          totalCheckCount++;
          state.result.detected = false;
          state.result.changeInfo = undefined;
          state.result.error = error instanceof Error ? error.message : String(error);
          state.result.errorType =
            error instanceof StockCheckError ? error.type : StockCheckErrorType.UNKNOWN_ERROR;
          state.result.errorCount = (state.result.errorCount || 0) + 1;

          if (resultCallback) {
            resultCallback({ ...state.result });
          }

          // 登录态失效属于致命错误，继续跑没有意义
          if (
            error instanceof StockCheckError &&
            error.type === StockCheckErrorType.AUTH_REQUIRED
          ) {
            fatalError = error;
            break;
          }
        }

        // 多商品串行：商品之间随机间隔，最后一个商品不再等待
        if (index < tasks.length - 1 && !signal.aborted && !fatalError) {
          await sleep(randomBetween(productGapMin, productGapMax) * 1000);
        }
      }

      // 触发进度回调
      if (progressCallback) {
        const currentPrices: Record<string, number> = {};
        states.forEach((state) => {
          if (state.result.currentPrice !== undefined) {
            currentPrices[state.result.productId] = state.result.currentPrice;
          }
        });

        progressCallback({
          elapsedTime,
          duration,
          progress: duration ? Math.floor((elapsedTime / duration) * 100) : undefined,
          checkCount: totalCheckCount,
          detectedCount,
          currentPrices,
        });
      }

      if (signal.aborted || fatalError) {
        break;
      }

      const elapsedAfterRound = Math.floor((Date.now() - startTime) / 1000);
      if (duration && elapsedAfterRound + interval >= duration) {
        break;
      }

      // 轮次间隔 + 0~2 秒随机抖动
      await sleep(interval * 1000 + Math.random() * 2000);
    }

    if (fatalError) {
      throw fatalError;
    }

    return Array.from(states.values()).map((state) => state.result);
  })();

  return { controller, promise };
};
