/**
 * 共享收藏夹监控引擎（实验分支：多任务共用一个收藏夹循环）
 *
 * 与「每个监控任务各自跑循环」不同：
 * - 收藏夹通道的任务不自己轮询，而是把商品注册到这里；
 * - 全局只有一个循环，按固定 pageSize=20 全量翻页读取收藏夹；
 * - 每页商品按 goods_no 找到订阅者，把最新状态推给它；
 * - 未被任何任务订阅的商品视为脏数据，交给 dirtyHandler 清理（取消收藏）。
 *
 * 节奏完全由全局请求闸门控制：翻页请求带收藏夹账号的登录态，进登录桶串行放行；
 * 引擎自身不 sleep——翻完一轮立即进入下一轮，下一次查收藏夹时会被闸门挡住。
 *
 * 本模块只负责「检测 + 分发」，不碰任务状态、不碰数据库、不发邮件、不下单；
 * 这些交给订阅者在 handler 里复用各自的既有逻辑。
 */

import { checkCollectionStock, removeProductFromCollection } from './stock-check';
import { runWithGateContext } from './utils/request-gate';
import type { AdapterConfig } from './adapters';
import type { CollectionStockResult } from './types';

/** 收藏夹账号凭证（登录态 + 出口 IP） */
export interface CollectionAccountConfig {
  platform: 'yishou';
  adapterConfig: AdapterConfig;
  /** 账号 uid，用于闸门 UID 桶分桶 */
  accountKey: string;
}

/** 单个商品的检测结果回调 */
export type CollectionItemHandler = (item: CollectionStockResult) => void | Promise<void>;

/** 脏数据（无订阅商品）处理回调 */
export type CollectionDirtyHandler = (item: CollectionStockResult) => void | Promise<void>;

export interface CollectionMonitorConfig {
  /** 每页数量，固定 20 */
  pageSize?: number;
  /** 日志回调 */
  log?: (message: string, level?: 'info' | 'warn' | 'error') => void;
  /** 脏数据处理（默认取消收藏） */
  onDirty?: CollectionDirtyHandler;
  /** 单轮异常回调 */
  onError?: (error: unknown) => void;
  /** 单轮扫描异常后的重试基准退避毫秒（默认 1000，指数增长到 15s）；测试可设 0 */
  errorRetryDelayMs?: number;
}

/** 可被 abort 打断的 sleep：异常退避等待时用，stop 能立即唤醒而不必干等 */
const sleepAbortable = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise(resolve => {
    if (signal.aborted) return resolve();
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

interface Subscription {
  handler: CollectionItemHandler;
}

/** 连续多少轮无人订阅才判定为脏数据（恢复期保护） */
const MISS_THRESHOLD = 2;

/** 占位有效期：创建任务到订阅完成之间的窗口，超时自动失效，避免残留占位阻止清理 */
const RESERVE_TTL_MS = 60_000;

/**
 * 共享收藏夹监控引擎。
 *
 * 由 server 层持有单例；start 后常驻，stop 后清空订阅并终止循环。
 */
export class CollectionMonitorEngine {
  private readonly subscriptions = new Map<string, Subscription>();
  /** 最近一次扫描到的 goods_no → collect_id（供外部按商品移除收藏） */
  private readonly collectIds = new Map<string, string>();
  /** 连续多少轮「在收藏夹里但没有订阅」；达到阈值才当脏数据清理，避免恢复期误删 */
  private readonly missCounts = new Map<string, number>();
  /**
   * 占位：创建任务时「已加入收藏夹、但任务尚未订阅」的窗口。
   * 期间扫描到该商品不清理，避免刚加进去就被当脏数据删掉。
   */
  private readonly reserved = new Map<string, number>();
  private controller: AbortController | null = null;
  private running = false;
  private config: CollectionMonitorConfig = {};
  private account: CollectionAccountConfig | null = null;

  /** 注册一个商品的监听；同一 goods_no 只能有一个订阅（重复注册覆盖） */
  subscribe(productNo: string, handler: CollectionItemHandler): void {
    const key = String(productNo || '').trim();
    if (!key) return;
    this.subscriptions.set(key, { handler });
    // 任务已接管，占位使命结束
    this.reserved.delete(key);
  }

  /**
   * 占位一个即将订阅的商品（创建任务、加入收藏夹前后调用）。
   * 占位期间扫描到它不会被当作脏数据清理。
   */
  reserve(productNo: string): void {
    const key = String(productNo || '').trim();
    if (!key) return;
    this.reserved.set(key, Date.now());
  }

  /** 取消占位（创建失败时回滚） */
  unreserve(productNo: string): void {
    this.reserved.delete(String(productNo || '').trim());
  }

  /** 注销一个商品的监听 */
  unsubscribe(productNo: string): void {
    this.subscriptions.delete(String(productNo || '').trim());
  }

  /** 该商品是否已被订阅 */
  has(productNo: string): boolean {
    return this.subscriptions.has(String(productNo || '').trim());
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** 当前订阅数 */
  get size(): number {
    return this.subscriptions.size;
  }

  /**
   * 启动常驻循环。
   *
   * @param account 收藏夹账号凭证；必须带登录态（uid/token），否则抛错
   */
  start(account: CollectionAccountConfig, config: CollectionMonitorConfig = {}): void {
    if (this.running) return;
    if (!account.accountKey?.trim()) {
      throw new Error('收藏夹监控账号缺少登录态（uid），无法启动共享循环');
    }

    this.account = account;
    this.config = config;
    this.running = true;
    const controller = new AbortController();
    this.controller = controller;

    const log = config.log ?? (() => {});
    const pageSize = config.pageSize && config.pageSize > 0 ? Math.floor(config.pageSize) : 20;
    const accountKey = account.accountKey;

    // 整个循环跑在闸门上下文里：翻页请求带登录态 → 进 uid:<账号> 桶 + IP 桶，
    // 由登录桶控制节奏（不 sleep）。
    void runWithGateContext(
      {
        taskId: 'collection-engine',
        kind: 'stock',
        accountKey,
        localAddress: account.adapterConfig.localAddress,
      },
      async () => {
        log('收藏夹共享循环已启动', 'info');
        let consecutiveFailures = 0;
        const baseRetry = this.config.errorRetryDelayMs ?? 1000;
        try {
          while (!controller.signal.aborted) {
            try {
              await this.scanOnce(account, pageSize, controller.signal, log);
              // 成功一轮即清零连续失败计数，恢复正常节奏
              consecutiveFailures = 0;
              // 不 sleep：立即进入下一轮，下一次翻页请求会被闸门挡住
            } catch (error) {
              if (controller.signal.aborted) break;
              // 单轮异常（超时 / 502 等）不再终止整个循环：记日志、退避后续跑。
              // 否则一次一手接口抖动就会让所有订阅商品永远扫不到、checkCount 卡在 0。
              consecutiveFailures += 1;
              log(
                `收藏夹单轮扫描失败（连续 ${consecutiveFailures} 次）: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                'error'
              );
              this.config.onError?.(error);
              // 指数退避封顶 15s，避免接口持续故障时疯狂空转；abort 可立即打断
              const backoff = Math.min(baseRetry * 2 ** (consecutiveFailures - 1), 15_000);
              await sleepAbortable(backoff, controller.signal);
            }
          }
        } finally {
          this.running = false;
          this.controller = null;
          log('收藏夹共享循环已停止', 'info');
        }
      }
    );
  }

  /** 停止循环（不清空订阅；订阅由各任务删除时自行 unsubscribe） */
  stop(): void {
    this.running = false;
    this.controller?.abort();
    this.controller = null;
    this.account = null;
    // 账号可能已变，缓存与计数一并作废
    this.collectIds.clear();
    this.missCounts.clear();
    this.reserved.clear();
  }

  /** 该商品最近一次扫描到的收藏条目 ID（没有则 undefined） */
  getCollectId(productNo: string): string | undefined {
    return this.collectIds.get(String(productNo || '').trim());
  }

  /**
   * 忘记某个商品的缓存态（收藏条目 ID、未命中计数、占位）。
   * 由 server 层在「成功把商品移出收藏夹」后调用：否则引擎残留的旧 collectId 会让
   * 下一次 ensureCollected 命中假缓存、误以为商品还在收藏夹，导致重新发起后扫不到。
   */
  forgetProduct(productNo: string): void {
    const key = String(productNo || '').trim();
    this.collectIds.delete(key);
    this.missCounts.delete(key);
    this.reserved.delete(key);
  }

  /** 单轮：全量翻页直到某页不足 pageSize */
  private async scanOnce(
    account: CollectionAccountConfig,
    pageSize: number,
    signal: AbortSignal,
    log: (message: string, level?: 'info' | 'warn' | 'error') => void
  ): Promise<void> {
    /** 本轮出现过的商品；用于清理「已从收藏夹消失」的未命中计数 */
    const seen = new Set<string>();

    for (let page = 1; ; page++) {
      if (signal.aborted) return;

      const result = await checkCollectionStock(
        { platform: account.platform, page, pageSize },
        { adapterConfig: account.adapterConfig }
      );

      const items = [...result.inStockItems, ...result.outOfStockItems];
      if (items.length === 0) break;

      // 已拉取的这一页完整处理完（哪怕中途 stop），避免半页数据被丢弃
      for (const item of items) {
        const no = String(item.productNo || '').trim();
        if (!no) continue;
        seen.add(no);
        if (item.collectId) this.collectIds.set(no, item.collectId);

        const sub = this.subscriptions.get(no);
        if (sub) {
          this.missCounts.delete(no);
          try {
            await sub.handler(item);
          } catch (error) {
            log(`分发商品 ${no} 失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
          }
          continue;
        }

        // 占位中（创建任务 → 订阅之间的窗口）：不清理也不累计未命中
        const reservedAt = this.reserved.get(no);
        if (reservedAt !== undefined) {
          if (Date.now() - reservedAt <= RESERVE_TTL_MS) {
            this.missCounts.delete(no);
            continue;
          }
          this.reserved.delete(no);
        }

        // 未订阅：连续 MISS_THRESHOLD 轮都无人认领才清理，
        // 避免服务重启时「任务尚未恢复完」把正常商品当脏数据删掉。
        const miss = (this.missCounts.get(no) ?? 0) + 1;
        this.missCounts.set(no, miss);
        if (miss >= MISS_THRESHOLD) {
          this.missCounts.delete(no);
          await this.handleDirty(item, account);
        }
      }

      // 不足一页说明到底了
      if (items.length < pageSize) break;
    }

    // 本轮已消失的商品：清掉未命中计数，避免下次出现直接触发清理
    for (const no of this.missCounts.keys()) {
      if (!seen.has(no)) this.missCounts.delete(no);
    }
  }

  /** 处理脏数据商品 */
  private async handleDirty(item: CollectionStockResult, account: CollectionAccountConfig): Promise<void> {
    const dirty = this.config.onDirty;
    if (dirty) {
      await dirty(item);
      return;
    }
    // 默认清理：取消收藏
    if (!item.collectId || item.collectId === '0') return;
    try {
      await removeProductFromCollection(
        {
          platform: account.platform,
          productNo: item.productNo,
          collectId: item.collectId,
          productId: item.productId,
        },
        { adapterConfig: account.adapterConfig }
      );
    } catch (error) {
      this.config.log?.(
        `清理脏数据 ${item.productNo} 失败: ${error instanceof Error ? error.message : String(error)}`,
        'warn'
      );
    }
  }
}
