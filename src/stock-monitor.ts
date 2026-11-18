/**
 * 库存监控 - 循环检查库存并发送邮件通知
 */

import { checkStock, getProductSkus } from './stock-check';
import { getOrderAdapter } from './adapters';
import { placeAutoOrder } from './auto-order';
import type {
  AutoOrderConfig,
  AutoOrderItem,
  AutoOrderStage,
  StockCheckRequest,
  StockCheckResult,
} from './types';
import type { CheckStockOptions } from './stock-check';
import {
  sendEmail,
  createBackInStockTemplate,
  createAutoOrderTemplate,
  createAutoOrderFailedTemplate,
  configureEmailService,
  loadEmailConfigFromEnv,
} from './email';
import { runWithGateContext, type GateContext } from './utils/request-gate';

// SMTP 配置来自环境变量（SMTP_PASS 等），代码里不保存授权码
const emailConfig = loadEmailConfigFromEnv();
if (emailConfig) {
  configureEmailService(emailConfig);
}

/** 库存监控的最小检测间隔（秒）：仅用于任务配置展示，实验分支不再用它 sleep，节奏完全交给请求闸门 */
export const MIN_STOCK_MONITOR_INTERVAL = 2;

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
  /**
   * 只监控这些规格（skuId）
   *
   * 为空表示监控全部规格：只要有任意规格有货就算到货。
   * 指定后，商品整体有货但所选规格都没货时不算到货，也不会触发下单。
   */
  skus?: string[];
  /**
   * 有货自动下单配置
   *
   * 启用后，检测到有货时不再只发邮件，而是直接加购 + 结算 + 建单（锁住库存），
   * 再把订单号发出来由人工完成支付。
   */
  autoOrder?: AutoOrderConfig;
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
  /** 命中的规格（配置了监控规格时） */
  matchedSkus?: string[];
  /** 命中规格的展示文案：蓝色 / L、黑色 / M */
  matchedSkuLabel?: string;
  /** 商品整体有货，但所选规格都没货（等待所选规格补货） */
  skuWaiting?: boolean;
  /** 发送邮件是否成功 */
  emailSent?: boolean;
  /** 错误信息 */
  error?: string;
  /** 检测次数 */
  checkCount: number;
  /** 错误次数 */
  errorCount?: number;
  /** 自动下单成功的订单号 */
  orderSn?: string;
  /** 订单金额 */
  orderAmount?: number;
  /** 支付截止时间（毫秒时间戳） */
  orderExpireAt?: number;
  /** 实际下单的规格 */
  orderSkuLabel?: string;
  /** 下单明细：多规格合单时有多行 */
  orderItems?: AutoOrderItem[];
  /** 实际下单件数（库存不足时小于配置件数） */
  orderNum?: number;
  /** 自动下单失败原因 */
  orderError?: string;
  /** 自动下单失败所处阶段 */
  orderStage?: AutoOrderStage;
  /** 下单结果未知（请求中断），需要人工核对 */
  orderUncertain?: boolean;
  /** 自动下单尝试次数 */
  orderAttempts?: number;
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
 * 库存监控的闸门上下文
 *
 * 检测跟随任务凭证：当前账号有登录态就带凭证走 IP+UID 两层桶，
 * 匿名模式则只有 IP 桶（两层间隔都是 1 秒，节奏一致）。
 * 下单链路 skipGate，不进闸门排队。
 */
export const createStockGateContext = (config: StockMonitorConfig): GateContext => ({
  taskId: config.taskId || 'stock-monitor',
  kind: 'stock',
});

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
      // 桶由每次请求实际带的凭证决定：检测带凭证 → IP+UID 桶，匿名 → 仅 IP 桶；下单 skipGate，不排队
      const promise = runWithGateContext(
    createStockGateContext(config),
    async (): Promise<MonitorResult> => {
      const {
        interval = MIN_STOCK_MONITOR_INTERVAL,
        duration,
        adapterConfig = {},
        initialCheckCount = 0,
        initialErrorCount = 0,
        autoOrder,
      } = config;

      // 校验参数
      if (!task?.request?.productId) {
        throw new Error('监控商品不能为空');
      }

      // 实验分支：interval 仅保留为任务配置字段用于展示，不再驱动 sleep；
      // 实际请求节奏完全由双层请求闸门（IP 1s + UID 1s）控制。

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

      // 自动下单要落到具体商品上，没有登录态时不可能下单，
      // 直接降级为普通到货提醒（避免任务一启动就失败退出）
      const autoOrderEnabled = Boolean(autoOrder?.enabled && adapterConfig.uid && adapterConfig.token);
      const orderAdapter = autoOrderEnabled ? getOrderAdapter('yishou', adapterConfig) : null;

      // 只监控指定规格时，商品级有货还要再看这些规格是否真的有货
      const monitorSkus = (config.skus || []).filter(Boolean);

      const startTime = Date.now();

      // 建单失败后的冷却截止时间：一手会给「订单支付中」临时锁，冷却期内只检测不重复下单
      let orderCooldownUntil = 0;

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

        // 已检测到有货，任务完成
        if (result.detected) {
          break;
        }

        try {
          // 每轮重置瞬时状态，与价格监控口径一致：
          // error（检测/邮件失败）和 orderError（下单失败）都只代表「最近一轮」，
          // 下一轮成功或不再尝试时自动从卡片消失，不会一直挂着旧错误。
          // 注意：非 retryable 的下单失败在本轮 break 结束任务，清空发生在下一轮开头、
          // 那时循环已经不会再来，因此最终失败原因仍会被保留。
          result.error = undefined;
          result.orderError = undefined;
          result.emailSent = undefined;

          const checkResult: StockCheckResult = await checkStock(task.request, {
            adapterConfig,
          });
          result.productName = checkResult.productName;
          result.checkCount++;

          // 每轮重置，避免上一轮命中结果残留到本轮
          result.matchedSkus = undefined;
          result.matchedSkuLabel = undefined;

          let inStock = checkResult.inStock;

          if (inStock && monitorSkus.length > 0) {
            // SKU 查询与检测用同一份配置，跟随任务凭证
            const skuDetail = await getProductSkus(
              { platform: task.request.platform, productId: checkResult.productId },
              { adapterConfig }
            );
            const hits = skuDetail.skuList.filter(
              item => monitorSkus.includes(item.skuId) && item.saleStock > 0
            );

            inStock = hits.length > 0;
            // 商品有货但所选规格没货：不算到货，前端提示「等待所选规格」
            result.skuWaiting = !inStock;

            if (hits.length > 0) {
              result.matchedSkus = hits.map(item => item.skuId);
              result.matchedSkuLabel = hits
                .map(item => [item.color, item.size].filter(Boolean).join(' / ') || item.skuId)
                .join('、');
            }
          } else {
            result.skuWaiting = undefined;
          }

          if (inStock) {
            if (autoOrderEnabled && orderAdapter && Date.now() < orderCooldownUntil) {
              // 上次建单失败触发了服务端锁单，冷却期内继续检测但不再建单，避免撞锁
              const waitSeconds = Math.ceil((orderCooldownUntil - Date.now()) / 1000);
              result.orderError = `上次建单失败，冷却中（约 ${waitSeconds} 秒后重试）`;
            } else if (autoOrderEnabled && orderAdapter) {
              // 自动下单：成功才算「检测到」，失败但可重试时继续盯下一轮
              const orderResult = await placeAutoOrder(orderAdapter, {
                goodsId: checkResult.productId,
                goodsNo: checkResult.productNo,
                config: autoOrder || { enabled: true },
                skus: monitorSkus,
              });

              result.orderAttempts = (result.orderAttempts || 0) + 1;
              result.orderStage = orderResult.stage;

              // 建单失败会触发一手「订单支付中」临时锁，记下冷却截止时间
              if (!orderResult.success && orderResult.cooldownMs) {
                orderCooldownUntil = Date.now() + orderResult.cooldownMs;
              }

              if (orderResult.success) {
                result.detected = true;
                result.orderSn = orderResult.orderSn;
                result.orderAmount = orderResult.orderAmount;
                result.orderExpireAt = orderResult.expireAt;
                result.orderSkuLabel = orderResult.skuLabel;
                result.orderItems = orderResult.items;
                result.orderNum = orderResult.num;
                result.orderError = undefined;

                const emailResult = await sendEmail({
                  to: task.recipient,
                  subject: `✅ 已自动下单：${checkResult.productName}（订单 ${orderResult.orderSn}）`,
                  html: createAutoOrderTemplate({
                    productName: checkResult.productName,
                    productImage: task.productImage || checkResult.productImage,
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
                // 没货 / 被抢完：不结束任务，下一轮继续
                result.orderError = orderResult.message;
              } else {
                // 登录态失效、配置错误、建单结果未知：继续重试没有意义，停下并告警
                result.orderError = orderResult.message;
                result.orderUncertain = orderResult.uncertain;

                const emailResult = await sendEmail({
                  to: task.recipient,
                  subject: `⚠️ 自动下单失败：${checkResult.productName}`,
                  html: createAutoOrderFailedTemplate({
                    productName: checkResult.productName,
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
                  resultCallback(result);
                }
                break;
              }
            } else {
              result.detected = true;

              const emailResult = await sendEmail({
                to: task.recipient,
                subject: task.subject || `🎉 ${checkResult.productName} 已到货`,
                html: createBackInStockTemplate(
                  checkResult.productName,
                  checkResult.price,
                  task.productImage,
                  checkResult.priceNote,
                  result.matchedSkuLabel
                ),
              });

              result.emailSent = emailResult.success;
              if (!emailResult.success) {
                result.error = emailResult.error;
              }
            }
          }

          // 每次检查都触发结果回调（不仅是有货或出错时）
          if (resultCallback) {
            resultCallback(result);
          }

          // 请求节奏由全局请求闸门控制（IP / UID 两层各 1 秒），轮次节奏由下方 sleep 控制
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

        // 时长边界守卫：不开启一个注定超出总时长的轮次（非 pacing）。
        if (duration && elapsedTime + MIN_STOCK_MONITOR_INTERVAL >= duration) {
          break;
        }

        // 实验分支：不再按间隔固定 sleep。
        // 下一轮立即进入，checkStock 里的请求会被双层闸门挡住，节奏完全由闸门控制。
      }

      return result;
    }
  );

  return { controller, promise };
};
