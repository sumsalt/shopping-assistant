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
import {
  activeSecondsBetween,
  isWithinActiveWindow,
  msUntilActiveWindowStart,
  normalizeActiveWindow,
  type ActiveWindow,
} from './utils/active-window';

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
  /**
   * 监控模式：
   * - accumulate（默认）：任务内记住所有出现过的商品，累计新商品达到阈值才提醒，反复上下架不重复提醒
   * - diff：每轮与上一轮对比，新增 + 下架数量达到阈值就提醒
   */
  mode?: TabMonitorMode;
  /** 触发提醒的阈值（accumulate 下是累计新增数，diff 下是单轮变化数，默认10） */
  minChangeCount?: number;
  /** 每日生效时段（可选）：只在这个时间段内检测，时段外休眠且不计入监控时长 */
  activeWindow?: ActiveWindow;
  /**
   * 首次启动时是否翻页抓取全部商品来建立完整基线（仅累计模式使用）
   *
   * 打开后初始化会一直翻页到空页为止（最多 MAX_TAB_FULL_SCAN_PAGE_COUNT 页），
   * 把 Tab 里已有的商品全部记为「已见」；续跑时不要打开，
   * 否则每次重启都要全量翻一遍。
   */
  fullInitialScan?: boolean;
  /** 续跑时已记录过的商品（含首次发现时间） */
  initialSeenProducts?: TabSeenProduct[];
  /** 续跑时已记录过的商品 ID（兼容旧任务，只有 ID 没有时间） */
  initialSeenProductIds?: string[];
  /** 续跑时的已检测次数（重启后继续累加，避免进度归零） */
  initialCheckCount?: number;
  /** 续跑时的已通知次数 */
  initialDetectedCount?: number;
  /** 任务 ID（用于全局请求闸门的公平调度） */
  taskId?: string;
  /**
   * 店铺黑名单（供应商标识集合）的读取函数
   *
   * 每轮抓取前调用一次，返回需要过滤掉的 supplyId：
   * - 命中黑名单的商品不参与比对、不记入累计商品、不触发提醒
   * - 传函数而不是数组，是为了让用户在任务运行中把店铺加入黑名单后立即生效
   */
  getBlacklistedSuppliers?: () => string[] | Promise<string[]>;
}

/**
 * 任务内记录过的商品（用于「查看累计商品」按首次发现时间倒序展示）
 */
export interface TabSeenProduct {
  /** 商品 ID */
  productId: string;
  /** 商品名称 */
  productName: string;
  /** 商品货号（一手接口的 goods_no，用于跳转系统内 SKU 详情页） */
  productNo?: string;
  /** 不带店铺名的商品名称（接口 goods_name_without_brand_name，用于卡片展示） */
  shortName?: string;
  /** 价格 */
  price: number;
  /** 商品图片 */
  productImage?: string;
  /** 商品链接 */
  productUrl?: string;
  /** 供应商标识（用于店铺黑名单） */
  supplyId?: string;
  /** 店铺名称（一手接口的 brand_name，多数情况下就是档口/店铺名） */
  shopName?: string;
  /** 市场名称（辅助识别店铺） */
  marketName?: string;
  /** 首次发现时间（ISO 字符串，落盘后仍可读） */
  firstSeenAt: string;
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
 * Tab 监控模式
 */
export type TabMonitorMode = 'accumulate' | 'diff';

/** 全量抓取时最多翻多少页（每页 20 条，100 页约 2000 个商品） */
export const MAX_TAB_FULL_SCAN_PAGE_COUNT = 100;

/** 任务内最多记录多少个商品详情（去重仍按全部 ID 进行，超出后只记 ID 不再记详情） */
export const MAX_TAB_SEEN_PRODUCTS = 5000;

/**
 * Tab 新商品提醒信息（累计模式）
 *
 * 任务内按商品 ID 去重累积：同一商品反复上下架只会被记一次，不会重复提醒。
 */
export interface TabAccumulateChangeInfo {
  mode: 'accumulate';
  /** 本次提醒的新商品（累计达到阈值时一次性推送） */
  newProducts: CollectionStockResult[];
  /** 当前在架商品总数 */
  currentTotal: number;
  /** 任务累计记录过的商品数（去重） */
  seenTotal: number;
}

/**
 * Tab 列表变化信息（逐轮对比模式）
 */
export interface TabDiffChangeInfo {
  mode: 'diff';
  /** 变化类型 */
  changeType: 'list_changed' | 'count_changed' | 'both';
  /** 变化前商品总数 */
  previousTotal: number;
  /** 变化后商品总数 */
  currentTotal: number;
  /** 本轮新增商品 */
  newProducts: CollectionStockResult[];
  /** 本轮下架商品 */
  removedProducts: CollectionStockResult[];
}

/**
 * 提醒内容：累计模式给新商品，对比模式给本轮增删
 */
export type TabChangeInfo = TabAccumulateChangeInfo | TabDiffChangeInfo;

/**
 * 监控结果
 */
export interface TabMonitorResult {
  /** Tab ID */
  tabId: string;
  /** 是否推送了新商品提醒 */
  detected: boolean;
  /** 新商品信息（推送时） */
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
  /** 已推送提醒次数 */
  detectedCount: number;
  /** 当前商品总数 */
  currentTotal: number;
  /** 累计记录过的商品数（去重） */
  seenTotal: number;
  /** 本轮首次出现的商品（用于落盘到任务的已见集合，含首次发现时间） */
  newlySeenProducts?: TabSeenProduct[];
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
 * 可被取消打断的睡眠：任务停止时立即结束等待（休眠可能是几个小时）
 */
const sleepInterruptible = (ms: number, signal: AbortSignal): Promise<void> => {
  if (signal.aborted || ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const onDone = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onDone);
      resolve();
    };
    const timer = setTimeout(onDone, ms);
    signal.addEventListener('abort', onDone, { once: true });
  });
};

/**
 * 比较两次商品列表的差异（逐轮对比模式使用）
 *
 * @param previousList 上一轮的商品列表
 * @param currentList 本轮的商品列表
 * @returns 变化信息；无任何变化时返回 null
 */
const compareProductLists = (
  previousList: CollectionStockResult[],
  currentList: CollectionStockResult[]
): Omit<TabDiffChangeInfo, 'mode'> | null => {
  const previousIds = new Set(previousList.map(item => item.productId));
  const currentIds = new Set(currentList.map(item => item.productId));

  const previousTotal = previousList.length;
  const currentTotal = currentList.length;

  const countChanged = previousTotal !== currentTotal;
  const newIds = [...currentIds].filter(id => !previousIds.has(id));
  const removedIds = [...previousIds].filter(id => !currentIds.has(id));
  const listChanged = newIds.length > 0 || removedIds.length > 0;

  if (!countChanged && !listChanged) {
    return null;
  }

  const currentMap = new Map(currentList.map(item => [item.productId, item]));
  const previousMap = new Map(previousList.map(item => [item.productId, item]));

  const newProducts = newIds.map(id => currentMap.get(id)!);
  const removedProducts = removedIds.map(id => previousMap.get(id)!);

  let changeType: TabDiffChangeInfo['changeType'] = 'both';
  if (countChanged && !listChanged) {
    changeType = 'count_changed';
  } else if (!countChanged && listChanged) {
    changeType = 'list_changed';
  }

  return {
    changeType,
    previousTotal,
    currentTotal,
    newProducts,
    removedProducts,
  };
};

/**
 * 循环监控Tab商品列表并发送新商品提醒
 *
 * 判定规则：任务内记住所有出现过的商品 ID，只有「从没见过的商品」才算新商品；
 * 累计新商品数达到 minChangeCount 时推送一次，邮件只列新商品，不关心下架。
 * 因此同一商品反复上下架不会被反复提醒。
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
      initialCheckCount = 0,
      initialDetectedCount = 0,
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

    // 监控模式：老任务没有该字段，按累计模式处理（与线上已有行为一致）
    const mode: TabMonitorMode = config.mode === 'diff' ? 'diff' : 'accumulate';

    // 初始化状态
    let previousList: CollectionStockResult[] = [];
    let checkCount = initialCheckCount;
    let detectedCount = initialDetectedCount;
    let errorCount = 0;
    const startTime = Date.now();

    // 任务内已见过的商品（仅累计模式使用）：同一商品反复上下架只记一次，不会重复提醒
    // 续跑时优先用带时间的 initialSeenProducts；老任务只有 ID，按任务启动时间补齐
    const seenProducts: TabSeenProduct[] = [...(config.initialSeenProducts ?? [])];
    const seenProductIds = new Set<string>(
      (config.initialSeenProducts ?? []).map(item => item.productId)
    );
    for (const productId of config.initialSeenProductIds ?? []) {
      if (seenProductIds.has(productId)) {
        continue;
      }
      seenProductIds.add(productId);
      seenProducts.push({
        productId,
        productName: '',
        price: 0,
        firstSeenAt: new Date(startTime).toISOString(),
      });
    }

    /** 把本轮抓到的商品并入已见集合，返回新商品（原始条目 + 待落盘的记录） */
    const markSeen = (
      items: CollectionStockResult[]
    ): { items: CollectionStockResult[]; records: TabSeenProduct[] } => {
      const newlySeen: CollectionStockResult[] = [];
      const records: TabSeenProduct[] = [];
      const now = new Date().toISOString();

      for (const item of items) {
        if (seenProductIds.has(item.productId)) {
          continue;
        }

        seenProductIds.add(item.productId);
        newlySeen.push(item);

        const record: TabSeenProduct = {
          productId: item.productId,
          productName: item.productName,
          ...(item.productNo ? { productNo: item.productNo } : {}),
          ...(item.productNameWithoutBrand ? { shortName: item.productNameWithoutBrand } : {}),
          price: item.price,
          ...(item.productImage ? { productImage: item.productImage } : {}),
          ...(item.productUrl ? { productUrl: item.productUrl } : {}),
          ...(item.supplyId ? { supplyId: item.supplyId } : {}),
          ...(item.brandName ? { shopName: item.brandName } : {}),
          ...(item.marketName ? { marketName: item.marketName } : {}),
          firstSeenAt: now,
        };
        records.push(record);

        // 详情只保留最近 MAX_TAB_SEEN_PRODUCTS 个，避免任务记录无限膨胀；
        // 去重仍用全量 ID 集合，所以超出上限也不会重复提醒
        if (seenProducts.length < MAX_TAB_SEEN_PRODUCTS) {
          seenProducts.push(record);
        }
      }

      return { items: newlySeen, records };
    };

    // 已发现但还没达到提醒阈值的新商品，凑够 minChangeCount 个再一次性推送
    let pendingNewProducts: CollectionStockResult[] = [];

    // 生效时段（可选）：配置后只在时段内检测，时段外休眠
    const activeWindow = normalizeActiveWindow(config.activeWindow);

    // 从时段外休眠醒来后需要先重建基线：休眠可能持续几个小时，
    // 醒来后直接把休眠期间上架的商品当成「刚发现的新商品」推送，会打扰用户
    let needBaselineRefresh = false;

    /** 已运行时长（秒）：配置了生效时段时只累计时段内的时间，休眠不消耗时长 */
    const getElapsedSeconds = (): number =>
      activeWindow
        ? Math.floor(activeSecondsBetween(new Date(startTime), new Date(), activeWindow))
        : Math.floor((Date.now() - startTime) / 1000);

    /** 上报进度（newlySeenProducts 用于把本轮新记住的商品落盘到任务上） */
    const reportProgress = (newlySeenProducts?: TabSeenProduct[]): void => {
      if (!progressCallback) {
        return;
      }

      const elapsed = getElapsedSeconds();
      progressCallback({
        elapsedTime: elapsed,
        duration,
        progress: duration ? Math.floor((elapsed / duration) * 100) : undefined,
        checkCount,
        detectedCount,
        currentTotal: previousList.length,
        seenTotal: mode === 'accumulate' ? seenProductIds.size : 0,
        ...(newlySeenProducts && newlySeenProducts.length > 0 ? { newlySeenProducts } : {}),
      });
    };

    // 创建适配器
    const adapter = new YishouAdapter(adapterConfig);

    /**
     * 读取当前店铺黑名单（每轮读取一次，用户运行中新增黑名单也能立即生效）
     *
     * 读取失败时按「没有黑名单」处理：宁可多抓一点，也不要因为配置读取异常把整轮监控搞挂
     */
    const resolveBlacklistedSuppliers = async (): Promise<Set<string>> => {
      if (!config.getBlacklistedSuppliers) {
        return new Set();
      }

      try {
        const ids = await config.getBlacklistedSuppliers();
        return new Set(
          (ids ?? [])
            .map(id => String(id).trim())
            .filter(Boolean)
        );
      } catch (error) {
        console.warn(`[Tab监控] 读取店铺黑名单失败，本轮不做过滤，Tab ID: ${tabId}`, error);
        return new Set();
      }
    };

    /** 合并多页商品并按 productId 去重（翻页期间排序抖动会出现重复条目） */
    const mergeProducts = (...lists: CollectionStockResult[][]): CollectionStockResult[] => {
      const merged: CollectionStockResult[] = [];
      const seenIds = new Set<string>();

      for (const list of lists) {
        for (const item of list) {
          if (seenIds.has(item.productId)) {
            continue;
          }
          seenIds.add(item.productId);
          merged.push(item);
        }
      }

      return merged;
    };

    /**
     * 抓取列表，按页合并去重
     *
     * @param pages 最多抓多少页
     * @param startPage 从第几页开始抓（默认配置的起始页）
     *
     * - 某一页返回空列表时提前结束（后面不会有数据了，省掉多余请求）
     * - 同一商品出现在多页时按 productId 去重
     * - 任何一页报错都会中断本轮，不返回「半份列表」，避免把缺失的商品当成新商品
     */
    const fetchPages = async (
      pages: number,
      startPage: number = page
    ): Promise<{
      list: CollectionStockResult[];
      pagesFetched: number;
    }> => {
      const merged: CollectionStockResult[] = [];
      const seenIds = new Set<string>();
      let pagesFetched = 0;

      for (let offset = 0; offset < pages; offset++) {
        const currentPage = startPage + offset;
        const result: CollectionStockCheckResult = await adapter.getTabGoodsList(
          tabId,
          currentPage,
          pageSize,
          sort,
          minPrice,
          maxPrice
        );
        pagesFetched++;

        const items = [...result.inStockItems, ...result.outOfStockItems];
        if (items.length === 0) {
          break;
        }

        for (const item of items) {
          if (seenIds.has(item.productId)) {
            continue;
          }
          seenIds.add(item.productId);
          merged.push(item);
        }

        // 全量抓取页数多，每 10 页打一条进度，避免日志刷屏
        if (pages > 1 && pagesFetched % 10 === 0) {
          console.log(
            `[Tab监控] 全量翻页中：已抓 ${pagesFetched} 页 / ${merged.length} 个商品，Tab ID: ${tabId}`
          );
        }
      }

      // 店铺黑名单：直接丢掉整条商品，既不参与比对也不进入累计记录
      const blacklisted = await resolveBlacklistedSuppliers();
      const list =
        blacklisted.size > 0
          ? merged.filter(item => !item.supplyId || !blacklisted.has(item.supplyId))
          : merged;

      if (list.length !== merged.length) {
        console.log(
          `[Tab监控] 已过滤 ${merged.length - list.length} 个黑名单店铺商品，Tab ID: ${tabId}`
        );
      }

      return { list, pagesFetched };
    };

    /** 抓取当前列表，并把其中没见过的商品记入已见集合 */
    const fetchAndMarkSeen = async (
      pages: number,
      startPage: number = page
    ): Promise<{
      list: CollectionStockResult[];
      newlySeen: TabSeenProduct[];
      pagesFetched: number;
    }> => {
      const { list, pagesFetched } = await fetchPages(pages, startPage);

      // 逐轮对比模式不需要已见集合
      if (mode !== 'accumulate') {
        return { list, newlySeen: [], pagesFetched };
      }

      const { records } = markSeen(list);
      return { list, newlySeen: records, pagesFetched };
    };

    // 首次获取商品列表（只记录基线，不发送通知）
    // 启动时若正好在生效时段外，就先不建基线：休眠到下一个时段入口再建，
    // 否则会把「上次运行结束到本次启动」之间的商品都算成新商品
    if (activeWindow && !isWithinActiveWindow(new Date(), activeWindow)) {
      needBaselineRefresh = true;
      console.log(
        `[Tab监控] 启动时不在生效时段 ${activeWindow.start}-${activeWindow.end}，进入时段后再建立基线，Tab ID: ${tabId}`
      );
    } else {
      try {
        // 新建任务时翻页抓全部商品建立完整基线，任务创建前就存在的商品不会被当成「新上架」；
        // 累计模式续跑时已见集合已落盘，只抓第一页即可；逐轮对比模式没有落盘基线，需要全量重建
        const initPages =
          mode === 'diff' || config.fullInitialScan ? MAX_TAB_FULL_SCAN_PAGE_COUNT : 1;

        if (initPages > 1) {
          console.log(
            `[Tab监控] 初始化全量翻页（最多 ${initPages} 页），Tab ID: ${tabId}`
          );
        }

        const { list, newlySeen, pagesFetched } = await fetchAndMarkSeen(initPages);
        previousList = list;
        checkCount++;

        console.log(
          `[Tab监控] 初始化完成，Tab ID: ${tabId}, 翻页 ${pagesFetched} 页, 本次抓取商品数: ${previousList.length}, 累计已记录: ${seenProducts.length}`
        );

        if (initPages === MAX_TAB_FULL_SCAN_PAGE_COUNT && pagesFetched >= initPages) {
          console.warn(
            `[Tab监控] 初始化已达 ${initPages} 页上限，更靠后的商品不会被记入基线，Tab ID: ${tabId}`
          );
        }

        // 初次建基线同样只记录不推送（重启续跑时 initialSeenProducts 已包含历史商品）
        reportProgress(newlySeen);
      } catch (error) {
        console.error('[Tab监控] 初始化失败:', error);
        throw new Error(`初始化Tab监控失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 等待第一次间隔后再开始监控
    await sleepInterruptible(interval * 1000, signal);

    // 主监控循环
    while (true) {
      // 检查是否被取消
      if (signal.aborted) {
        break;
      }

      const elapsedTime = getElapsedSeconds();

      // 检查是否达到总时长限制（休眠不计时，不会因为停在时段外而被判到期）
      if (duration && elapsedTime >= duration) {
        break;
      }

      // 不在生效时段：休眠到下次开始，期间不发请求、不消耗监控时长
      if (activeWindow && !isWithinActiveWindow(new Date(), activeWindow)) {
        const waitMs = msUntilActiveWindowStart(new Date(), activeWindow);

        console.log(
          `[Tab监控] 不在生效时段 ${activeWindow.start}-${activeWindow.end}，休眠 ${Math.round(
            waitMs / 1000
          )} 秒后继续，Tab ID: ${tabId}`
        );

        reportProgress();

        await sleepInterruptible(waitMs, signal);

        // 醒来后进入时段，先重建基线再开始检测
        needBaselineRefresh = true;
        continue;
      }

      // 刚进入生效时段：先抓一轮并入「已见」集合，不比对、不推送
      if (needBaselineRefresh) {
        try {
          const { list, newlySeen, pagesFetched } = await fetchAndMarkSeen(
            MAX_TAB_FULL_SCAN_PAGE_COUNT
          );

          previousList = list;
          checkCount++;
          needBaselineRefresh = false;

          console.log(
            `[Tab监控] 已进入生效时段，重建基线，Tab ID: ${tabId}, 翻页 ${pagesFetched} 页, 当前商品数: ${previousList.length}`
          );

          reportProgress(newlySeen);

          // 基线建好后等一个间隔再检测，避免把「建基线」和「检测」压在同一时刻
          await sleepInterruptible(interval * 1000, signal);
          continue;
        } catch (error) {
          errorCount++;
          const message = error instanceof Error ? error.message : String(error);
          console.error('[Tab监控] 进入生效时段后建立基线失败:', error);

          if (resultCallback) {
            resultCallback({
              tabId,
              detected: false,
              error: message,
              checkCount,
              errorCount,
            });
          }

          // 保持待重建状态，下一个间隔继续重试，不拿旧基线做检测
          await sleepInterruptible(interval * 1000, signal);
          continue;
        }
      }

      let currentList: CollectionStockResult[] = [];
      let detected = false;
      let changeInfo: TabChangeInfo | undefined;
      let errorStr: string | undefined;
      let newlySeenProducts: TabSeenProduct[] | undefined;

      try {
        // 每轮先只抓第一页（一次请求）：
        // - 首页没有新商品 → 本轮结束，不再翻页
        // - 首页出现新商品 → 立刻翻页抓全部商品，避免漏掉排在后面的新商品
        const firstPage = await fetchPages(1);
        let pagesFetched = firstPage.pagesFetched;
        currentList = firstPage.list;

        const previousIds = new Set(previousList.map(entry => entry.productId));
        const firstPageHasNew = firstPage.list.some(entry =>
          mode === 'accumulate'
            ? !seenProductIds.has(entry.productId)
            : !previousIds.has(entry.productId)
        );
        const didFullScan = firstPageHasNew;

        if (didFullScan) {
          const rest = await fetchPages(
            MAX_TAB_FULL_SCAN_PAGE_COUNT - 1,
            page + 1
          );
          pagesFetched += rest.pagesFetched;
          currentList = mergeProducts(firstPage.list, rest.list);

          console.log(
            `[Tab监控] 首页发现新商品，执行全量抓取：翻页 ${pagesFetched} 页，抓取 ${currentList.length} 个商品，Tab ID: ${tabId}`
          );
        }

        checkCount++;

        if (mode === 'diff') {
          if (!didFullScan) {
            // 首页没有新商品：不翻页，也不做对比（下架等变化留到下次全量时再算）
            console.log(
              `[Tab监控] 首页无新商品，跳过本轮对比，Tab ID: ${tabId}, 当前商品数: ${currentList.length}`
            );

            if (resultCallback) {
              resultCallback({ tabId, detected: false, checkCount, errorCount });
            }
          } else {
            // 逐轮对比：全量结果与上一份全量基线相比，新增 + 下架合计达到阈值就提醒
            const comparison = compareProductLists(previousList, currentList);
          const changeCount = comparison
            ? comparison.newProducts.length + comparison.removedProducts.length
            : 0;

          if (comparison && changeCount >= minChangeCount) {
            detected = true;
            changeInfo = { mode: 'diff', ...comparison };

            console.log(
              `[Tab监控] 本轮变化 ${changeCount} 个（新增 ${comparison.newProducts.length} / 下架 ${comparison.removedProducts.length}），达到阈值 ${minChangeCount}，Tab ID: ${tabId}`
            );

            const emailResult = await sendEmail({
              to: task.recipient,
              subject:
                task.subject ||
                `🔔 ${task.tabName || 'Tab商品列表'} 有 ${changeCount} 个商品变化`,
              html: createTabChangeTemplate(task.tabName || 'Tab商品列表', changeInfo, tabId),
            });

            if (resultCallback) {
              resultCallback({
                tabId,
                detected,
                changeInfo,
                emailSent: emailResult.success,
                error: emailResult.success ? undefined : emailResult.error,
                checkCount,
                errorCount,
              });
            }

            if (emailResult.success) {
              detectedCount++;
            } else {
              errorCount++;
            }
          } else {
            console.log(
              `[Tab监控] 本轮变化 ${changeCount}/${minChangeCount}，未达阈值，Tab ID: ${tabId}, 当前商品数: ${currentList.length}`
            );

            if (resultCallback) {
              resultCallback({ tabId, detected: false, checkCount, errorCount });
            }
          }

            previousList = currentList;
          }
        } else {
          // 累计模式：只认「从没出现过的商品」，反复上下架的老商品不会重复计入
          const { items: newlySeen, records: newlySeenRecords } = markSeen(currentList);

          if (newlySeen.length > 0) {
            newlySeenProducts = newlySeenRecords;
            pendingNewProducts.push(...newlySeen);

            console.log(
              `[Tab监控] 本轮发现 ${newlySeen.length} 个新商品，累计待提醒 ${pendingNewProducts.length}/${minChangeCount}，Tab ID: ${tabId}`
            );
          }

          // 累计新商品达到阈值：把这一批新商品一次性推送出去
          if (pendingNewProducts.length >= minChangeCount) {
            const batch = pendingNewProducts;

            detected = true;
            changeInfo = {
              mode: 'accumulate',
              newProducts: batch,
              currentTotal: currentList.length,
              seenTotal: seenProductIds.size,
            };

            console.log(
              `[Tab监控] 累计新商品达到阈值，发送提醒 ${batch.length} 个，Tab ID: ${tabId}`
            );

            const emailResult = await sendEmail({
              to: task.recipient,
              subject:
                task.subject ||
                `🔔 ${task.tabName || 'Tab商品列表'} 新增 ${batch.length} 个商品`,
              html: createTabChangeTemplate(task.tabName || 'Tab商品列表', changeInfo, tabId),
            });

            if (resultCallback) {
              resultCallback({
                tabId,
                detected,
                changeInfo,
                emailSent: emailResult.success,
                error: emailResult.success ? undefined : emailResult.error,
                checkCount,
                errorCount,
              });
            }

            if (emailResult.success) {
              // 推送成功才清空待提醒队列；失败保留，下一轮继续重试，避免漏报
              pendingNewProducts = [];
              detectedCount++;
            } else {
              errorCount++;
            }
          } else {
            console.log(
              `[Tab监控] 本轮无新商品或累计不足阈值（${pendingNewProducts.length}/${minChangeCount}），Tab ID: ${tabId}, 当前商品数: ${currentList.length}`
            );

            if (resultCallback) {
              resultCallback({ tabId, detected: false, checkCount, errorCount });
            }
          }

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

      // 触发进度回调（同时把本轮新记住的商品 ID 交给上层落盘）
      reportProgress(newlySeenProducts);

      // 检查是否被取消
      if (signal.aborted) {
        break;
      }

      // 检查是否接近总时长限制
      if (duration && getElapsedSeconds() + interval >= duration) {
        break;
      }

      // 等待下一次检测
      await sleepInterruptible(interval * 1000, signal);
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
