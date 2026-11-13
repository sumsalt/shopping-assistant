/**
 * 待支付订单自动续期 - 编排层
 *
 * 与协议层解耦：本文件只表达「每分钟扫一次待支付订单，对快过期的续期」，
 * 不接触 selected / cart_id / rsa / 地址字段等任何协议细节——那些都在
 * adapters/yishou/renew.ts，通过 confirmWaitPayOrder → reloadWaitPayOrder
 * 的不透明 protocol 句柄原样传递。
 *
 * 判定与风控：
 *   - 订单列表的 cancelExpireAt 只做初筛（减少 confirm 请求量）；
 *     真正是否续期用 confirm 响应里服务端的 cancel_expire - current_timestamp 复判，
 *     避免本地时钟偏差导致误判。
 *   - 每单 4 分钟冷却：若 reload 没能真正刷新有效期，也不会每分钟重复提交同一单。
 *     reload_wait_pay_order 是写操作，失败可能留下「订单支付中」临时锁，必须克制。
 *   - selected_express 解析为空 / 默认地址缺失：跳过并告警，不硬凑参数。
 *   - reload 返回非 wait_pay（已付 / 已关）：标记该单结束，后续不再续期。
 *   - 凭据失效：停止任务并告警，不无限重试。
 *
 * 接口已 skipGate（YishouOrderApi 构造时带 skipGate:true），因此请求节流由本层自律，
 * 也不挂 runWithGateContext —— 避免与全局闸门的 15 秒排队耦合。
 */

import type { AdapterConfig, RenewOrderAdapter } from './adapters/types';
import type { OrderListItem } from './types';
import { StockCheckError, StockCheckErrorType } from './types';

// ==================== 常量 ====================

/** 扫描周期（秒）：需求固定每分钟一次 */
export const RENEW_SCAN_INTERVAL_SECONDS = 60;
/** 触发阈值（秒）：剩余有效期小于 5 分钟才续期 */
export const RENEW_THRESHOLD_SECONDS = 5 * 60;
/** 单订单冷却（毫秒）：4 分钟，防止有效期未刷新时重复提交 */
export const RENEW_COOLDOWN_MS = 4 * 60 * 1000;
/** 单轮最大翻页数（一手每页 10 条） */
export const RENEW_MAX_PAGES = 20;
/** 单轮最大处理订单数 */
export const RENEW_MAX_ORDERS_PER_ROUND = 200;
/** 同一次扫描内相邻请求的最小间隔（毫秒） */
export const RENEW_REQUEST_GAP_MS = 300;
/**
 * 两次 reload（写操作）之间的最小间隔（毫秒）
 *
 * reload 是写操作，连续提交同一账号的多笔订单容易被服务端限流；
 * 读请求（列表 / confirm）仍按 {@link RENEW_REQUEST_GAP_MS} 走。
 */
export const RENEW_WRITE_GAP_MS = 5_000;
/** 订单列表每页条数（一手硬上限） */
export const RENEW_PAGE_SIZE = 10;
/** 最近续期记录保留条数 */
export const RENEW_RECENT_LIMIT = 50;

/** 结束前提前多久发提醒（秒）：10 分钟 */
export const RENEW_ENDING_SOON_LEAD_SECONDS = 10 * 60;
/** 提醒发信失败后的最小重试间隔（毫秒）：避免每轮都重试刷屏 */
export const RENEW_ENDING_SOON_RETRY_MS = 2 * 60 * 1000;

/**
 * 「即将结束」提醒的判定入参（纯函数，供 web 层与单测共用）
 */
export interface RenewEndingSoonInput {
  /** 本轮总时长（秒）；不传表示无限循环，永远不提醒 */
  duration?: number;
  /** 本轮已运行秒数 */
  elapsedTime: number;
  /** 上次成功提醒对应的计时起点（createdAt 毫秒）；延长任务后会变化 */
  notifiedForCreatedAt?: number;
  /** 当前计时起点（createdAt 毫秒） */
  createdAt: number;
  /** 上次尝试发信时间（毫秒） */
  lastAttemptAt?: number;
  /** 当前时间（毫秒） */
  now: number;
}

/**
 * 是否应该发送「自动续期即将结束」提醒。
 *
 * - 只针对有限时长任务，且总时长必须大于提前量（避免 5 分钟任务一启动就发）；
 * - 剩余时长进入 10 分钟窗口才触发；
 * - 以 createdAt 为去重键：进程重启续跑不会重复发，延长任务（计时起点重置）后可再次提醒；
 * - 发信失败后隔一段时间才重试，成功后的去重置位由调用方负责。
 */
export const shouldNotifyRenewEndingSoon = (input: RenewEndingSoonInput): boolean => {
  const { duration, elapsedTime } = input;
  if (duration === undefined || duration <= RENEW_ENDING_SOON_LEAD_SECONDS) return false;
  if (duration - elapsedTime > RENEW_ENDING_SOON_LEAD_SECONDS) return false;
  if (input.notifiedForCreatedAt === input.createdAt) return false;
  if (
    input.lastAttemptAt !== undefined &&
    input.now - input.lastAttemptAt < RENEW_ENDING_SOON_RETRY_MS
  ) {
    return false;
  }
  return true;
};

// ==================== 类型 ====================

export interface OrderRenewMonitorConfig {
  /** 任务总时长（秒），不传则无限循环；由 web 层按创建时间 + duration 续跑 */
  duration?: number;
  /** 登录态快照；仅用于日志排查，adapter 由调用方构造后注入 */
  adapterConfig?: AdapterConfig;
  /** 以下参数主要供单测覆盖，生产使用默认值 */
  intervalSeconds?: number;
  thresholdSeconds?: number;
  cooldownMs?: number;
  maxPages?: number;
  maxOrdersPerRound?: number;
  requestGapMs?: number;
  writeGapMs?: number;
  /** 运行日志，默认丢弃；web 层注入 ctx.log 后写入 PM2 */
  logger?: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

/** 一条续期记录（落盘展示用，全部用 number 时间戳） */
export interface OrderRenewalRecord {
  orderSn: string;
  renewedAt: number;
  /** 续期前剩余可支付秒数（服务端时钟口径） */
  remainingBefore?: number;
  /** 续期前的支付截止（毫秒） */
  expireBefore?: number;
  /** 续期后的支付截止（毫秒），reload 响应或回查得到 */
  expireAfter?: number;
  /** 是否确认支付截止确实后移 */
  verified?: boolean;
  /** 订单金额 */
  orderAmount?: number;
  /** 本次结束原因（已付/已关），存在即不再续期 */
  finishedReason?: string;
}

/** 累计结果（每轮回传给 web 层落盘） */
export interface OrderRenewMonitorResult {
  /** 已扫描轮次 */
  checkCount: number;
  /** 累计扫描到的待支付订单数 */
  scannedCount: number;
  /** 累计成功续期次数 */
  renewedCount: number;
  /** 累计跳过次数（时间充足 / 已过期 / 冷却中 / 无快递 / 无地址 / 已结束） */
  skippedCount: number;
  /** 累计被标记结束的订单数 */
  finishedCount: number;
  /** 最近一次错误（成功轮会清空） */
  error?: string;
  /** 最近一次扫描时间戳 */
  lastScanAt?: number;
  /** 最近续期记录（新 → 旧） */
  recentRenewals: OrderRenewalRecord[];
}

export interface OrderRenewProgress {
  elapsedTime: number;
  duration?: number;
  checkCount: number;
  renewedCount: number;
}

export type OrderRenewResultCallback = (result: OrderRenewMonitorResult) => void;
export type OrderRenewProgressCallback = (progress: OrderRenewProgress) => void;

// ==================== 工具 ====================

/** 可被取消打断的等待（与 stock-monitor.ts 同款实现） */
const sleepInterruptible = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise(resolve => {
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

/** 登录态失效：继续重试没有意义，直接停任务 */
const isAuthError = (error: unknown): boolean => {
  if (error instanceof StockCheckError) {
    return error.type === StockCheckErrorType.AUTH_REQUIRED;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('登录') || message.includes('AUTH_REQUIRED');
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * 翻页拉取全部待支付订单，直到不满页 / 到达上限
 *
 * 固定传 `wait_pay` 让服务端只回待支付订单；page 每轮 +1，由 getOrderList
 * 换算成 `pageidx = (page-1) * RENEW_PAGE_SIZE` 的记录偏移量，
 * 因此 >10 笔待支付订单也能逐页覆盖、不会重复第一页。
 */
const scanWaitPayOrders = async (
  adapter: RenewOrderAdapter,
  maxPages: number,
  maxOrders: number,
  gapMs: number,
  signal: AbortSignal
): Promise<OrderListItem[]> => {
  const all: OrderListItem[] = [];

  for (let page = 1; page <= maxPages && all.length < maxOrders; page++) {
    if (signal.aborted) break;

    const list = await adapter.getOrderList(page, RENEW_PAGE_SIZE, 'wait_pay');
    const items = Array.isArray(list?.items) ? list.items : [];
    all.push(...items);

    if (items.length < RENEW_PAGE_SIZE || !list.hasMore) break;
    if (page < maxPages && all.length < maxOrders) {
      await sleepInterruptible(gapMs, signal);
    }
  }

  return all.slice(0, maxOrders);
};

// ==================== 主循环 ====================

/**
 * 创建可取消的续期监控
 *
 * adapter 由调用方注入（web 层用 getRenewAdapter 构造），便于单测直接 mock，
 * 也让编排层不依赖任何具体平台。
 */
export const createCancellableOrderRenewMonitor = (
  adapter: RenewOrderAdapter,
  config: OrderRenewMonitorConfig = {},
  resultCallback?: OrderRenewResultCallback,
  progressCallback?: OrderRenewProgressCallback
): { controller: AbortController; promise: Promise<OrderRenewMonitorResult> } => {
  const controller = new AbortController();
  const signal = controller.signal;
  const startTime = Date.now();

  const intervalSeconds = config.intervalSeconds ?? RENEW_SCAN_INTERVAL_SECONDS;
  const thresholdSeconds = config.thresholdSeconds ?? RENEW_THRESHOLD_SECONDS;
  const cooldownMs = config.cooldownMs ?? RENEW_COOLDOWN_MS;
  const maxPages = config.maxPages ?? RENEW_MAX_PAGES;
  const maxOrders = config.maxOrdersPerRound ?? RENEW_MAX_ORDERS_PER_ROUND;
  const gapMs = config.requestGapMs ?? RENEW_REQUEST_GAP_MS;
  const writeGapMs = config.writeGapMs ?? RENEW_WRITE_GAP_MS;
  const logger = config.logger;
  const duration = config.duration;

  const result: OrderRenewMonitorResult = {
    checkCount: 0,
    scannedCount: 0,
    renewedCount: 0,
    skippedCount: 0,
    finishedCount: 0,
    recentRenewals: [],
  };

  /** 跨轮状态：每单冷却截止时间、已结束订单 */
  const cooldownUntil = new Map<string, number>();
  const finishedOrders = new Set<string>();
  /** 本轮告警（如缺快递 / 地址、有效期未后移），成功轮才清空上一轮的错误 */
  let roundWarning: string | undefined;

  /** 单轮处理结果：用于日志与统计 */
  type OrderOutcome =
    | 'renewed'
    | 'finished'
    | 'not-due'
    | 'cooldown'
    | 'expired'
    | 'no-address'
    | 'failed';

  const recordRenewal = (record: OrderRenewalRecord) => {
    result.recentRenewals.unshift(record);
    result.recentRenewals = result.recentRenewals.slice(0, RENEW_RECENT_LIMIT);
  };

  const processOrder = async (order: OrderListItem, now: number): Promise<OrderOutcome> => {
    const orderSn = String(order.orderSn || '').trim();
    if (!orderSn || finishedOrders.has(orderSn)) return 'expired';

    if ((cooldownUntil.get(orderSn) ?? 0) > now) {
      result.skippedCount++;
      return 'cooldown';
    }

    // 初筛：本地时钟只用于「明显还有很久 / 已过期」的快速排除
    if (order.cancelExpireAt !== undefined) {
      const localRemaining = order.cancelExpireAt - now;
      if (localRemaining <= 0) {
        result.skippedCount++;
        return 'expired';
      }
      if (localRemaining >= thresholdSeconds * 1000) {
        result.skippedCount++;
        return 'not-due';
      }
    }

    // 复判：用服务端自己的时钟差，避免本地时间被改 / 漂移
    const confirmed = await adapter.confirmWaitPayOrder(orderSn);
    const remaining =
      confirmed.remainingSeconds !== undefined
        ? confirmed.remainingSeconds
        : confirmed.cancelExpireAt !== undefined
          ? (confirmed.cancelExpireAt - now) / 1000
          : undefined;

    if (remaining === undefined || remaining <= 0 || remaining >= thresholdSeconds) {
      result.skippedCount++;
      return remaining !== undefined && remaining >= thresholdSeconds ? 'not-due' : 'expired';
    }
    if (!confirmed.hasAddress || !confirmed.hasExpress) {
      result.skippedCount++;
      roundWarning = `订单 ${orderSn} 缺少默认地址或可用快递，跳过续期`;
      logger?.(`订单 ${orderSn} 缺少默认地址或可用快递，跳过续期`, 'warn');
      return 'no-address';
    }

    const renewed = await adapter.reloadWaitPayOrder(confirmed.protocol);

    // 冷却无条件设置：即使 reload 没能刷新有效期，也不会每分钟重复提交同一单
    cooldownUntil.set(orderSn, Date.now() + cooldownMs);

    let expireAfter = renewed.cancelExpireAt;
    if (expireAfter === undefined && adapter.getOrderDetail) {
      try {
        const detail = await adapter.getOrderDetail(orderSn);
        expireAfter = detail?.expireAt;
      } catch {
        // 回查失败不影响本次续期结果，只是无法标注 verified
      }
    }

    const expireBefore = confirmed.cancelExpireAt;
    const verified =
      expireAfter !== undefined && expireBefore !== undefined
        ? expireAfter > expireBefore
        : undefined;

    const record: OrderRenewalRecord = {
      orderSn,
      renewedAt: Date.now(),
      remainingBefore: remaining,
      ...(expireBefore !== undefined ? { expireBefore } : {}),
      ...(expireAfter !== undefined ? { expireAfter } : {}),
      ...(verified !== undefined ? { verified } : {}),
      ...(renewed.orderAmount !== undefined ? { orderAmount: renewed.orderAmount } : {}),
    };

    if (renewed.finished) {
      finishedOrders.add(orderSn);
      result.finishedCount++;
      record.finishedReason = `订单状态变为 ${renewed.payStatus}，不再续期`;
    } else {
      result.renewedCount++;
      if (verified === false) {
        roundWarning = `订单 ${orderSn} 续期后支付截止未后移，请人工核对续期流程`;
        logger?.(`订单 ${orderSn} 续期后支付截止未后移`, 'warn');
      }
    }

    recordRenewal(record);

    logger?.(
      `订单 ${orderSn} 续期${renewed.finished ? '结束' : '成功'}：剩余 ${remaining}s → 截止 ${
        expireAfter !== undefined ? new Date(expireAfter).toLocaleString('zh-CN') : '未知'
      }`
    );

    return renewed.finished ? 'finished' : 'renewed';
  };

  const promise = (async (): Promise<OrderRenewMonitorResult> => {
    while (true) {
      if (signal.aborted) break;

      const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
      if (duration !== undefined && elapsedTime >= duration) break;

      result.checkCount++;
      result.lastScanAt = Date.now();
      roundWarning = undefined;
      let roundError: string | undefined;

      try {
        const scanned = await scanWaitPayOrders(adapter, maxPages, maxOrders, gapMs, signal);
        result.scannedCount += scanned.length;

        /**
         * 剩余越少越先续
         *
         * 列表顺序通常按创建时间倒序，快过期的可能排在后面；一旦写操作被限流，
         * 排在后面的单就会一直续不上。按服务端给的支付截止升序处理，
         * 保证「本轮所有进入窗口的订单」按紧急程度依次提交。
         */
        const orders = [...scanned].sort(
          (a, b) =>
            (a.cancelExpireAt ?? Number.MAX_SAFE_INTEGER) -
            (b.cancelExpireAt ?? Number.MAX_SAFE_INTEGER)
        );

        const round = {
          renewed: 0,
          finished: 0,
          notDue: 0,
          cooldown: 0,
          expired: 0,
          noAddress: 0,
          failed: 0,
        };

        const seenThisRound = new Set<string>();
        /** 本轮续期失败的单：轮末统一重试一次，避免 60 秒空窗把订单拖过期 */
        const failedOrders: OrderListItem[] = [];

        for (const order of orders) {
          if (signal.aborted) break;
          const orderSn = String(order.orderSn || '').trim();
          if (!orderSn || seenThisRound.has(orderSn)) {
            result.skippedCount++;
            continue;
          }
          seenThisRound.add(orderSn);

          let wrote = false;
          try {
            const outcome = await processOrder(order, Date.now());
            if (outcome === 'renewed') round.renewed++;
            else if (outcome === 'finished') round.finished++;
            else if (outcome === 'not-due') round.notDue++;
            else if (outcome === 'cooldown') round.cooldown++;
            else if (outcome === 'no-address') round.noAddress++;
            else round.expired++;
            wrote = outcome === 'renewed' || outcome === 'finished';
          } catch (error) {
            // 凭据失效是全局问题，向上抛让主循环停止
            if (isAuthError(error)) throw error;
            round.failed++;
            failedOrders.push(order);
            roundError = errorMessage(error);
            logger?.(`订单 ${orderSn} 续期失败：${roundError}`, 'warn');
          }

          // 写操作之间留更长间隔，避免同一账号连续 reload 被服务端限流
          await sleepInterruptible(wrote ? Math.max(gapMs, writeGapMs) : gapMs, signal);
        }

        /**
         * 轮末重试
         *
         * 同一账号连续 reload 时服务端可能短暂拒绝（上笔还在「支付中」），
         * 失败的单不设冷却，隔一段时间在本轮内再试一次；
         * 仍失败就留到下一轮，避免「一轮只续上一单」。
         */
        if (failedOrders.length > 0 && !signal.aborted) {
          logger?.(`本轮 ${failedOrders.length} 单续期失败，${writeGapMs}ms 后重试`)
          await sleepInterruptible(writeGapMs, signal)

          const retry = { renewed: 0, finished: 0, failed: 0 };
          for (const order of failedOrders) {
            if (signal.aborted) break;
            const orderSn = String(order.orderSn || '').trim();
            try {
              const outcome = await processOrder(order, Date.now());
              if (outcome === 'renewed') retry.renewed++;
              else if (outcome === 'finished') retry.finished++;
            } catch (error) {
              if (isAuthError(error)) throw error;
              retry.failed++;
              roundError = errorMessage(error);
              logger?.(`订单 ${orderSn} 重试仍失败：${roundError}`, 'warn');
            }
            await sleepInterruptible(Math.max(gapMs, writeGapMs), signal);
          }

          round.renewed += retry.renewed;
          round.finished += retry.finished;
          round.failed = retry.failed;
          if (retry.failed === 0) {
            roundError = undefined;
          }
        }

        const candidates = round.renewed + round.finished + round.noAddress + round.failed;
        const acted = candidates > 0;
        if (acted || result.checkCount % 10 === 0) {
          logger?.(
            `第 ${result.checkCount} 轮：扫描 ${scanned.length} 单，候选 ${candidates}，`
              + `续期 ${round.renewed}，结束 ${round.finished}，失败 ${round.failed}，`
              + `未到窗口 ${round.notDue}，冷却 ${round.cooldown}，已过期 ${round.expired}`
          );
        }
      } catch (error) {
        roundError = errorMessage(error);
        result.error = roundError;
        if (isAuthError(error)) {
          resultCallback?.(result);
          break;
        }
      }

      result.error = roundError ?? roundWarning ?? undefined;

      if (resultCallback) resultCallback(result);
      if (progressCallback) {
        progressCallback({
          elapsedTime,
          ...(duration !== undefined ? { duration } : {}),
          checkCount: result.checkCount,
          renewedCount: result.renewedCount,
        });
      }

      if (signal.aborted) break;
      if (duration !== undefined && elapsedTime + intervalSeconds >= duration) break;
      await sleepInterruptible(intervalSeconds * 1000, signal);
    }

    return result;
  })();

  return { controller, promise };
};
