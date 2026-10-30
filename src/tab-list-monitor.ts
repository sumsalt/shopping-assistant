/**
 * Tab商品列表监控 - 监控Tab商品列表变化并发送邮件通知
 */

import { YishouAdapter } from './adapters';
import type { AdapterConfig } from './adapters/types';
import type { CollectionStockCheckResult, CollectionStockResult } from './types';
import {
  sendEmail,
  createTabChangeTemplate,
  configureEmailService,
  loadEmailConfigFromEnv,
} from './email';
import { runWithGateContext } from './utils/request-gate';

// SMTP 配置来自环境变量（SMTP_PASS 等），代码里不保存授权码
const emailConfig = loadEmailConfigFromEnv();
if (emailConfig) {
  configureEmailService(emailConfig);
}

/**
 * Tab监控配置
 */
export interface TabMonitorConfig {
  /** 循环间隔时间（秒），默认 60 秒（1分钟） */
  interval?: number;
  /** 循环总时长（秒），不传则无限循环 */
  duration?: number;
  /** 平台认证配置 */
  adapterConfig?: AdapterConfig;
  /** Tab ID */
  tabId: string;
  /** 页码，默认为1 */
  page?: number;
  /** 每页数量，默认为20 */
  pageSize?: number;
  /** 排序方式，默认为1 */
  sort?: number;
  /** 最低价格，默认为0 */
  minPrice?: number;
  /** 最高价格，默认为0 */
  maxPrice?: number;
  /** 触发变化的最少商品数量，默认10 */
  minChangeCount?: number;
  /** 任务 ID（用于全局请求闸门的公平调度） */
  taskId?: string;
}

/**
 * 监控任务
 */
export interface TabMonitorTask {
  /** 收件人邮箱地址 */
  recipient: string;
  /** 邮件主题（可选） */
  subject?: string;
  /** Tab 名称（可选，用于邮件标题） */
  tabName?: string;
}

/**
 * Tab商品列表变化信息
 */
export interface TabChangeInfo {
  /** 变化类型 */
  changeType: 'list_changed' | 'count_changed' | 'both';
  /** 变化前商品总数 */
  previousTotal: number;
  /** 变化后商品总数 */
  currentTotal: number;
  /** 变化前商品ID集合 */
  previousProductIds: Set<string>;
  /** 变化后商品ID集合 */
  currentProductIds: Set<string>;
  /** 新增商品列表 */
  newProducts: CollectionStockResult[];
  /** 删除商品列表 */
  removedProducts: CollectionStockResult[];
}

/**
 * 监控结果
 */
export interface TabMonitorResult {
  /** Tab ID */
  tabId: string;
  /** 是否检测到变化 */
  detected: boolean;
  /** 变化信息（检测到变化时） */
  changeInfo?: TabChangeInfo;
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
export interface TabMonitorProgress {
  /** 当前已运行时间（秒） */
  elapsedTime: number;
  /** 总时长（秒） */
  duration?: number;
  /** 进度百分比 */
  progress?: number;
  /** 已检测次数 */
  checkCount: number;
  /** 已检测到变化的次数 */
  detectedCount: number;
  /** 当前商品总数 */
  currentTotal: number;
}

/**
 * 进度回调函数类型
 */
export type TabProgressCallback = (progress: TabMonitorProgress) => void;

/**
 * 监控结果回调函数类型
 */
export type TabResultCallback = (result: TabMonitorResult) => void;

/**
 * 睡眠函数
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * 比较两次商品列表的差异
 * @param previousList 上一次的商品列表
 * @param currentList 当前的商品列表
 * @returns 变化信息
 */
const compareProductLists = (
  previousList: CollectionStockResult[],
  currentList: CollectionStockResult[]
): TabChangeInfo | null => {
  const previousIds = new Set(previousList.map(item => item.productId));
  const currentIds = new Set(currentList.map(item => item.productId));

  const previousTotal = previousList.length;
  const currentTotal = currentList.length;

  // 检查商品总数是否变化
  const countChanged = previousTotal !== currentTotal;

  // 检查商品列表是否变化
  const newIds = [...currentIds].filter(id => !previousIds.has(id));
  const removedIds = [...previousIds].filter(id => !currentIds.has(id));
  const listChanged = newIds.length > 0 || removedIds.length > 0;

  if (!countChanged && !listChanged) {
    return null;
  }

  // 获取新增和删除的商品详细信息
  const currentMap = new Map(currentList.map(item => [item.productId, item]));
  const previousMap = new Map(previousList.map(item => [item.productId, item]));

  const newProducts = newIds.map(id => currentMap.get(id)!);
  const removedProducts = removedIds.map(id => previousMap.get(id)!);

  let changeType: TabChangeInfo['changeType'] = 'both';
  if (countChanged && !listChanged) {
    changeType = 'count_changed';
  } else if (!countChanged && listChanged) {
    changeType = 'list_changed';
  }

  return {
    changeType,
    previousTotal,
    currentTotal,
    previousProductIds: previousIds,
    currentProductIds: currentIds,
    newProducts,
    removedProducts,
  };
};

/**
 * 循环监控Tab商品列表并发送变化通知
 *
 * @param task 监控任务
 * @param config 监控配置
 * @param progressCallback 进度回调（可选）
 * @param resultCallback 结果回调（可选）
 * @returns Promise<TabMonitorResult> 监控结果
 *
 * @example
 * ```typescript
 * import { monitorTabList } from './tab-list-monitor';
 *
 * // 启动监控
 * const result = await monitorTabList(
 *   {
 *     recipient: 'user@example.com',
 *     subject: 'Tab商品列表变化提醒',
 *     tabName: '羽绒服专区'
 *   },
 *   {
 *     tabId: '146453',
 *     interval: 300, // 每 5 分钟检查一次
 *     duration: 7200, // 最多运行 2 小时
 *     adapterConfig: { uid: 'xxx', token: 'xxx' }
 *   },
 *   (progress) => {
 *     console.log(`进度: ${progress.progress}%, 当前商品数: ${progress.currentTotal}`);
 *   },
 *   (result) => {
 *     console.log(`检测到变化: ${result.detected ? '是' : '否'}`);
 *   }
 * );
 * ```
 */
export const monitorTabList = async (
  task: TabMonitorTask,
  config: TabMonitorConfig,
  progressCallback?: TabProgressCallback,
  resultCallback?: TabResultCallback
): Promise<TabMonitorResult> => {
  const { promise } = createCancellableTabMonitor(task, config, progressCallback, resultCallback);
  return promise;
};

/**
 * 创建可取消的Tab监控
 *
 * @param task 监控任务
 * @param config 监控配置
 * @param progressCallback 进度回调（可选）
 * @param resultCallback 结果回调（可选）
 * @returns AbortController 和 Promise，可以用于取消监控
 *
 * @example
 * ```typescript
 * const { controller, promise } = createCancellableTabMonitor(
 *   {
 *     recipient: 'user@example.com',
 *     tabName: '羽绒服专区'
 *   },
 *   {
 *     tabId: '146453',
 *     interval: 300
 *   }
 * );
 *
 * // 10分钟后取消监控
 * setTimeout(() => {
 *   controller.abort();
 * }, 600000);
 *
 * const result = await promise;
 * ```
 */
export const createCancellableTabMonitor = (
  task: TabMonitorTask,
  config: TabMonitorConfig,
  progressCallback?: TabProgressCallback,
  resultCallback?: TabResultCallback
) => {
  const controller = new AbortController();
  const { signal } = controller;

  // 打上任务上下文：循环内所有 HTTP 请求都会经过全局请求闸门（用户手动操作无上下文，不受限）
  const promise = runWithGateContext(
    {
      taskId: config.taskId || 'tab-monitor',
      kind: 'tab',
      accountKey: config.adapterConfig?.uid,
    },
    async (): Promise<TabMonitorResult> => {
    const {
      interval = 60,
      duration = 24 * 60 * 60,
      adapterConfig = {},
      tabId,
      page = 1,
      pageSize = 20,
      sort = 1,
      minPrice = 0,
      maxPrice = 0,
      minChangeCount = 10,
    } = config;

    // 校验参数
    if (!tabId) {
      throw new Error('Tab ID 不能为空');
    }

    if (!task.recipient) {
      throw new Error('收件人邮箱地址不能为空');
    }

    if (interval <= 0) {
      throw new Error('循环间隔时间必须大于 0');
    }

    if (duration !== undefined && duration <= 0) {
      throw new Error('循环总时长必须大于 0');
    }

    // 初始化状态
    let previousList: CollectionStockResult[] = [];
    let checkCount = 0;
    let detectedCount = 0;
    let errorCount = 0;
    const startTime = Date.now();

    // 创建适配器
    const adapter = new YishouAdapter(adapterConfig);

    // 首次获取商品列表（不发送通知）
    try {
      const result: CollectionStockCheckResult = await adapter.getTabGoodsList(
        tabId,
        page,
        pageSize,
        sort,
        minPrice,
        maxPrice
      );
      previousList = [...result.inStockItems, ...result.outOfStockItems];
      checkCount++;

      console.log(`[Tab监控] 初始化完成，Tab ID: ${tabId}, 当前商品数: ${previousList.length}`);
    } catch (error) {
      console.error('[Tab监控] 初始化失败:', error);
      throw new Error(`初始化Tab监控失败: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 等待第一次间隔后再开始监控
    await sleep(interval * 1000);

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

      let currentList: CollectionStockResult[] = [];
      let detected = false;
      let changeInfo: TabChangeInfo | undefined;
      let errorStr: string | undefined;

      try {
        // 获取当前商品列表
        const result: CollectionStockCheckResult = await adapter.getTabGoodsList(
          tabId,
          page,
          pageSize,
          sort,
          minPrice,
          maxPrice
        );

        currentList = [...result.inStockItems, ...result.outOfStockItems];
        checkCount++;

        // 比较商品列表差异
        const comparison = compareProductLists(previousList, currentList);

        // 只有当变化的商品个数大于等于 minChangeCount 时才算变化
        const hasEnoughChanges = comparison && (comparison.newProducts.length + comparison.removedProducts.length) >= minChangeCount;

        if (hasEnoughChanges) {
          detected = true;
          detectedCount++;
          changeInfo = comparison;

          // 更新历史列表
          previousList = currentList;

          console.log(`[Tab监控] 检测到变化! Tab ID: ${tabId}, 变化类型: ${comparison.changeType}`);
          console.log(`  商品总数: ${comparison.previousTotal} → ${comparison.currentTotal}`);
          console.log(`  新增商品: ${comparison.newProducts.length}`);
          console.log(`  删除商品: ${comparison.removedProducts.length}`);

          // 发送邮件通知
          const emailResult = await sendEmail({
            to: task.recipient,
            subject: task.subject || `🔔 ${task.tabName || 'Tab商品列表'} 变化提醒`,
            html: createTabChangeTemplate(
              task.tabName || 'Tab商品列表',
              changeInfo,
              tabId
            ),
          });

          // 触发结果回调
          const monitorResult: TabMonitorResult = {
            tabId,
            detected,
            changeInfo,
            emailSent: emailResult.success,
            error: emailResult.success ? undefined : emailResult.error,
            checkCount,
            errorCount,
          };

          if (resultCallback) {
            resultCallback(monitorResult);
          }

          // 更新错误计数
          if (!emailResult.success) {
            errorCount++;
          }
        } else {
          const changeCount = comparison ? (comparison.newProducts.length + comparison.removedProducts.length) : 0;
          if (comparison && changeCount > 0) {
            console.log(`[Tab监控] 检测到变化但数量不足（${changeCount}/${minChangeCount}），Tab ID: ${tabId}, 当前商品数: ${currentList.length}`);
          } else {
            console.log(`[Tab监控] 未检测到变化，Tab ID: ${tabId}, 当前商品数: ${currentList.length}`);
          }

          // 触发结果回调（即使没有变化）
          const monitorResult: TabMonitorResult = {
            tabId,
            detected: false,
            checkCount,
            errorCount,
          };

          if (resultCallback) {
            resultCallback(monitorResult);
          }

          // 更新历史列表
          previousList = currentList;
        }
      } catch (error) {
        errorCount++;
        errorStr = error instanceof Error ? error.message : String(error);
        console.error('[Tab监控] 检测失败:', error);

        // 触发结果回调
        const monitorResult: TabMonitorResult = {
          tabId,
          detected: false,
          error: errorStr,
          checkCount,
          errorCount,
        };

        if (resultCallback) {
          resultCallback(monitorResult);
        }
      }

      // 触发进度回调
      const progress: TabMonitorProgress = {
        elapsedTime,
        duration,
        progress: duration ? Math.floor((elapsedTime / duration) * 100) : undefined,
        checkCount,
        detectedCount,
        currentTotal: currentList.length,
      };

      if (progressCallback) {
        progressCallback(progress);
      }

      // 检查是否被取消
      if (signal.aborted) {
        break;
      }

      // 检查是否接近总时长限制
      if (duration && elapsedTime + interval >= duration) {
        break;
      }

      // 等待下一次检测
      await sleep(interval * 1000);
    }

    // 返回最终结果
    return {
      tabId,
      detected: detectedCount > 0,
      checkCount,
      errorCount,
    };
    }
  );

  return { controller, promise };
};
