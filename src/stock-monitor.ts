/**
 * 库存监控 - 循环检查库存并发送邮件通知
 */

import { checkStock } from './stock-check';
import type { StockCheckRequest, StockCheckResult } from './types';
import type { CheckStockOptions } from './stock-check';
import { sendEmail, createBackInStockTemplate } from './email';

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
  const {
    interval = 60,
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
    });
  });

  // 主监控循环
  while (true) {
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
        continue; // 跳过已检测到的商品
      }

      try {
        // 调用 checkStock 检查库存
        const result: StockCheckResult = await checkStock(task.request, { adapterConfig });

        // 更新状态中的商品名称
        status.productName = result.productName;
        status.checkCount++;
        totalCheckCount++;

        // 判断是否有货
        if (result.inStock) {
          status.detected = true;

          // 发送邮件通知
          const emailResult = await sendEmail({
            to: task.recipient,
            subject: task.subject || `🎉 ${result.productName} 已到货`,
            html: createBackInStockTemplate(result.productName, result.price),
          });

          status.emailSent = emailResult.success;
          if (!emailResult.success) {
            status.error = emailResult.error;
          }

          // 触发结果回调
          if (resultCallback) {
            resultCallback(status);
          }
        }
      } catch (error) {
        status.error = error instanceof Error ? error.message : String(error);
        status.checkCount++;
        totalCheckCount++;

        // 触发结果回调（即使出错也通知）
        if (resultCallback) {
          resultCallback(status);
        }
      }
    }

    // 计算进度
    const detectedCount = Array.from(taskStatus.values()).filter(s => s.detected).length;
    const progress: MonitorProgress = {
      elapsedTime,
      duration,
      progress: duration ? Math.floor((elapsedTime / duration) * 100) : undefined,
      checkCount: totalCheckCount,
      detectedCount,
    };

    // 触发进度回调
    if (progressCallback) {
      progressCallback(progress);
    }

    // 等待下一次检查
    if (duration && elapsedTime + interval >= duration) {
      // 如果下次检查时间超过总时长，直接结束
      break;
    }

    await sleep(interval * 1000);
  }

  return Array.from(taskStatus.values());
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
      interval = 60,
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
              html: createBackInStockTemplate(result.productName, result.price),
            });

            status.emailSent = emailResult.success;
            if (!emailResult.success) {
              status.error = emailResult.error;
            }

            if (resultCallback) {
              resultCallback(status);
            }
          }
        } catch (error) {
          status.error = error instanceof Error ? error.message : String(error);
          status.checkCount++;
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

      await sleep(interval * 1000);
    }

    return Array.from(taskStatus.values());
  })();

  return { controller, promise };
};
