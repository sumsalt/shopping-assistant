/**
 * 库存监控 - 循环检查库存并发送邮件通知
 */

import { checkStock } from './stock-check';
import type { StockCheckRequest, StockCheckResult } from './types';
import type { CheckStockOptions } from './stock-check';
import {
  sendEmail,
  createBackInStockTemplate,
  configureEmailService,
  loadEmailConfigFromEnv,
} from './email';
import { runWithGateContext } from './utils/request-gate';

// SMTP 配置来自环境变量（SMTP_PASS 等），代码里不保存授权码
const emailConfig = loadEmailConfigFromEnv();
if (emailConfig) {
  configureEmailService(emailConfig);
}

/** 库存监控的最小检测间隔（秒）：低于此值按此值执行 */
export const MIN_STOCK_MONITOR_INTERVAL = 2;

/** 可被取消打断的等待，返回时表示已经等够时间或任务被中止 */
const sleepInterruptible = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) {
      resolve();
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal.addEventListener('abort', onAbort, { once: true });
  });

/**
 * 库存监控配置
 */
export interface StockMonitorConfig {
  /** 循环间隔时间（秒），默认 2 秒，最小 2 秒 */
  interval?: number;
  /** 循环总时长（秒），不传则无限循环 */
  duration?: number;
  /** 平台认证配置 */
  adapterConfig?: CheckStockOptions['adapterConfig'];
  /** 续跑时的已检测次数（重启后继续累加，避免进度归零） */
  initialCheckCount?: number;
  /** 续跑时的已出错次数 */
  initialErrorCount?: number;
  /** 任务 ID（用于全局请求闸门的公平调度） */
  taskId?: string;
}

/**
 * 监控任务
 */
export interface MonitorTask {
  /** 监控请求参数 */
  request: StockCheckRequest;
  /** 收件人邮箱地址 */
  recipient: string;
  /** 邮件主题（可选） */
  subject?: string;
  /** 商品图片 URL（可选） */
  productImage?: string;
}

/**
 * 监控结果
 */
export interface MonitorResult {
  /** 监控的商品ID */
  productId: string;
  /** 商品名称 */
  productName: string;
  /** 是否检测到有货 */
  detected: boolean;
  /** 发送邮件是否成功 */
  emailSent?: boolean;
  /** 错误信息 */
  error?: string;
  /** 检测次数 */
  checkCount: number;
  /** 错误次数 */
  errorCount?: number;
}

/**
 * 监控进度信息
 */
export interface MonitorProgress {
  /** 当前已运行时间（秒） */
  elapsedTime: number;
  /** 总时长（秒） */
  duration?: number;
  /** 进度百分比 */
  progress?: number;
  /** 已检测次数 */
  checkCount: number;
  /** 已检测到有货的商品数量 */
  detectedCount: number;
}

/**
 * 进度回调函数类型
 */
export type ProgressCallback = (progress: MonitorProgress) => void;

/**
 * 监控结果回调函数类型
 */
export type ResultCallback = (result: MonitorResult) => void;

/**
 * 循环检查库存并发送邮件通知（一个任务只监控一个商品）
 *
 * 检测到有货后发送邮件并结束任务。
 *
 * @param task 监控任务
 * @param config 监控配置
 * @param progressCallback 进度回调（可选）
 * @param resultCallback 结果回调（可选）
 * @returns Promise<MonitorResult> 监控结果
 *
 * @example
 * ```typescript
 * const result = await monitorStock(
 *   {
 *     request: { platform: 'yishou', productId: '123456' },
 *     recipient: 'customer@example.com',
 *     subject: '商品到货提醒'
 *   },
 *   { interval: 30, duration: 3600 }
 * );
 * ```
 */
export const monitorStock = async (
  task: MonitorTask,
  config: StockMonitorConfig = {},
  progressCallback?: ProgressCallback,
  resultCallback?: ResultCallback
): Promise<MonitorResult> => {
  const { promise } = createCancellableMonitor(task, config, progressCallback, resultCallback);
  return promise;
};

/**
 * 监控单个商品库存
 *
 * @param request 库存查询请求参数
 * @param recipient 收件人邮箱地址
 * @param config 监控配置
 * @param progressCallback 进度回调（可选）
 * @param resultCallback 结果回调（可选）
 * @returns Promise<MonitorResult> 监控结果
 */
export const monitorSingleStock = async (
  request: StockCheckRequest,
  recipient: string,
  config: StockMonitorConfig = {},
  progressCallback?: ProgressCallback,
  resultCallback?: ResultCallback
): Promise<MonitorResult> => {
  return monitorStock({ request, recipient }, config, progressCallback, resultCallback);
};

/**
 * 创建可取消的库存监控
 *
 * @param task 监控任务（一个任务只包含一个商品）
 * @param config 监控配置
 * @param progressCallback 进度回调（可选）
 * @param resultCallback 结果回调（可选）
 * @returns AbortController 和 Promise
 */
export const createCancellableMonitor = (
  task: MonitorTask,
  config: StockMonitorConfig = {},
  progressCallback?: ProgressCallback,
  resultCallback?: ResultCallback
) => {
  const controller = new AbortController();
  const { signal } = controller;

  // 打上任务上下文：循环内所有 HTTP 请求都会经过全局请求闸门（用户手动操作无上下文，不受限）
  const promise = runWithGateContext(
    {
      taskId: config.taskId || 'stock-monitor',
      kind: 'stock',
      accountKey: config.adapterConfig?.uid,
    },
    async (): Promise<MonitorResult> => {
      const {
        interval = MIN_STOCK_MONITOR_INTERVAL,
        duration,
        adapterConfig = {},
        initialCheckCount = 0,
        initialErrorCount = 0,
      } = config;

      // 校验参数
      if (!task?.request?.productId) {
        throw new Error('监控商品不能为空');
      }

      if (interval <= 0) {
        throw new Error('循环间隔时间必须大于 0');
      }

      // 实际生效间隔：低于最小间隔的配置（含历史任务里的 1 秒）一律按最小间隔执行
      const effectiveInterval = Math.max(MIN_STOCK_MONITOR_INTERVAL, interval);

      if (duration !== undefined && duration <= 0) {
        throw new Error('循环总时长必须大于 0');
      }

      const result: MonitorResult = {
        productId: task.request.productId,
        productName: '',
        detected: false,
        checkCount: initialCheckCount,
        errorCount: initialErrorCount,
      };

      const startTime = Date.now();

      // 主监控循环
      while (true) {
        // 检查是否被取消
        if (signal.aborted) {
          break;
        }

        const cycleStartedAt = Date.now();
        const elapsedTime = Math.floor((cycleStartedAt - startTime) / 1000);

        // 检查是否达到总时长限制
        if (duration && elapsedTime >= duration) {
          break;
        }

        // 已检测到有货，任务完成
        if (result.detected) {
          break;
        }

        try {
          const checkResult: StockCheckResult = await checkStock(task.request, { adapterConfig });
          result.productName = checkResult.productName;
          result.checkCount++;

          if (checkResult.inStock) {
            result.detected = true;

            const emailResult = await sendEmail({
              to: task.recipient,
              subject: task.subject || `🎉 ${checkResult.productName} 已到货`,
              html: createBackInStockTemplate(checkResult.productName, checkResult.price, task.productImage),
            });

            result.emailSent = emailResult.success;
            if (!emailResult.success) {
              result.error = emailResult.error;
            }
          }

          // 每次检查都触发结果回调（不仅是有货或出错时）
          if (resultCallback) {
            resultCallback(result);
          }

          // 请求节奏由全局请求闸门控制（匿名 1 秒 / 登录态 15 秒），轮次节奏由下方 sleep 控制
        } catch (error) {
          result.error = error instanceof Error ? error.message : String(error);
          result.checkCount++;
          result.errorCount = (result.errorCount || 0) + 1;

          if (resultCallback) {
            resultCallback(result);
          }
        }

        if (progressCallback) {
          progressCallback({
            elapsedTime,
            duration,
            progress: duration ? Math.floor((elapsedTime / duration) * 100) : undefined,
            checkCount: result.checkCount,
            detectedCount: result.detected ? 1 : 0,
          });
        }

        if (signal.aborted) {
          break;
        }

        if (duration && elapsedTime + effectiveInterval >= duration) {
          break;
        }

        // 轮次之间至少间隔 effectiveInterval 秒（从本轮开始算，含请求耗时）
        await sleepInterruptible(
          effectiveInterval * 1000 - (Date.now() - cycleStartedAt),
          signal
        );
      }

      return result;
    }
  );

  return { controller, promise };
};
