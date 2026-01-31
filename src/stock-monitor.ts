/**
 * 库存监控 - 循环检查库存并发送邮件通知
 */

import { checkStock } from './stock-check';
import type { StockCheckRequest, StockCheckResult } from './types';
import type { CheckStockOptions } from './stock-check';
import { sendEmail, createBackInStockTemplate } from './email';
import { configureEmailService } from './index';

configureEmailService({
  host: 'smtp.qq.com',
  port: 465,
  user: 'sumsalt@qq.com',
  pass: 'drkrrwyavsbzbjib',
  secure: true,
});

/**
 * 库存监控配置
 */
export interface StockMonitorConfig {
  /** 循环间隔时间（秒），默认 60 秒 */
  interval?: number;
  /** 循环总时长（秒），不传则无限循环 */
  duration?: number;
  /** 平台认证配置 */
  adapterConfig?: CheckStockOptions['adapterConfig'];
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
 * 循环检查库存并发送邮件通知
 *
 * @param tasks 监控任务列表
 * @param config 监控配置
 * @param progressCallback 进度回调（可选）
 * @param resultCallback 结果回调（可选）
 * @returns Promise<MonitorResult[]> 所有监控结果
 *
 * @example
 * ```typescript
 * import { configureEmailService } from './email';
 * import { monitorStock } from './stock-monitor';
 *
 * // 先配置邮件服务
 * configureEmailService({
 *   host: 'smtp.example.com',
 *   port: 465,
 *   user: 'your-email@example.com',
 *   pass: 'your-password',
 *   fromName: '购物助手'
 * });
 *
 * // 启动监控
 * const results = await monitorStock(
 *   [
 *     {
 *       request: { platform: 'yishou', productId: '123456' },
 *       recipient: 'customer@example.com',
 *       subject: '商品到货提醒'
 *     }
 *   ],
 *   {
 *     interval: 30, // 每 30 秒检查一次
 *     duration: 3600, // 最多运行 1 小时
 *     adapterConfig: { uid: 'xxx', token: 'xxx' }
 *   },
 *   (progress) => {
 *     console.log(`进度: ${progress.progress}%`);
 *   },
 *   (result) => {
 *     console.log(`商品 ${result.productName}: ${result.detected ? '已到货' : '未检测到'}`);
 *   }
 * );
 * ```
 */
export const monitorStock = async (
  tasks: MonitorTask[],
  config: StockMonitorConfig = {},
  progressCallback?: ProgressCallback,
  resultCallback?: ResultCallback
): Promise<MonitorResult[]> => {
  const { promise } = createCancellableMonitor(tasks, config, progressCallback, resultCallback);
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
  const results = await monitorStock(
    [{ request, recipient }],
    config,
    progressCallback,
    resultCallback
  );
  return results[0];
};

/**
 * 睡眠函数
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * 取消监控（返回一个 AbortController 用于取消监控）
 *
 * @returns AbortController 和 Promise，可以用于取消监控
 *
 * @example
 * ```typescript
 * const { controller, promise } = createCancellableMonitor([
 *   {
 *     request: { platform: 'yishou', productId: '123456' },
 *     recipient: 'customer@example.com'
 *   }
 * ]);
 *
 * // 5 秒后取消监控
 * setTimeout(() => {
 *   controller.abort();
 * }, 5000);
 *
 * const results = await promise;
 * ```
 */
export const createCancellableMonitor = (
  tasks: MonitorTask[],
  config: StockMonitorConfig = {},
  progressCallback?: ProgressCallback,
  resultCallback?: ResultCallback
) => {
  const controller = new AbortController();
  const { signal } = controller;

  const promise = (async (): Promise<MonitorResult[]> => {
    const {
      interval = 1,
      duration,
      adapterConfig = {},
    } = config;

    // 校验参数
    if (!tasks || tasks.length === 0) {
      throw new Error('监控任务列表不能为空');
    }

    if (interval <= 0) {
      throw new Error('循环间隔时间必须大于 0');
    }

    if (duration !== undefined && duration <= 0) {
      throw new Error('循环总时长必须大于 0');
    }

    // 记录每个商品的状态
    const taskStatus = new Map<string, MonitorResult>();
    const startTime = Date.now();
    let totalCheckCount = 0;

    // 初始化任务状态
    tasks.forEach(task => {
      const key = `${task.request.platform}-${task.request.productId}`;
      taskStatus.set(key, {
        productId: task.request.productId,
        productName: '',
        detected: false,
        checkCount: 0,
        errorCount: 0,
      });
    });

    // 主监控循环
    while (true) {
      // 检查是否被取消
      if (signal.aborted) {
        break;
      }

      const elapsedTime = Math.floor((Date.now() - startTime) / 1000);

      // 检查是否达到总时长限制
      if (duration && elapsedTime >= duration) {
        break;
      }

      // 检查是否所有商品都已检测到有货
      const allDetected = Array.from(taskStatus.values()).every(status => status.detected);
      if (allDetected) {
        break;
      }

      // 遍历任务进行检查
      for (const task of tasks) {
        const key = `${task.request.platform}-${task.request.productId}`;
        const status = taskStatus.get(key);

        if (!status || status.detected) {
          continue;
        }

        try {
          const result: StockCheckResult = await checkStock(task.request, { adapterConfig });
          status.productName = result.productName;
          status.checkCount++;
          totalCheckCount++;

          if (result.inStock) {
            status.detected = true;

            const emailResult = await sendEmail({
              to: task.recipient,
              subject: task.subject || `🎉 ${result.productName} 已到货`,
              html: createBackInStockTemplate(result.productName, result.price, task.productImage),
            });

            status.emailSent = emailResult.success;
            if (!emailResult.success) {
              status.error = emailResult.error;
            }
          }

          // 每次检查都触发结果回调（不仅是有货或出错时）
          if (resultCallback) {
            resultCallback(status);
          }

          const randomDelay = Math.random() * 0.5 + 0.7;
          await sleep(interval * 1000 + randomDelay * 1000);
        } catch (error) {
          status.error = error instanceof Error ? error.message : String(error);
          status.checkCount++;
          status.errorCount = (status.errorCount || 0) + 1;
          totalCheckCount++;

          if (resultCallback) {
            resultCallback(status);
          }
        }
      }

      const detectedCount = Array.from(taskStatus.values()).filter(s => s.detected).length;
      const progress: MonitorProgress = {
        elapsedTime,
        duration,
        progress: duration ? Math.floor((elapsedTime / duration) * 100) : undefined,
        checkCount: totalCheckCount,
        detectedCount,
      };

      if (progressCallback) {
        progressCallback(progress);
      }

      if (signal.aborted) {
        break;
      }

      if (duration && elapsedTime + interval >= duration) {
        break;
      }
    }

    return Array.from(taskStatus.values());
  })();

  return { controller, promise };
};
