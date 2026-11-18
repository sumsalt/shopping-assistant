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
}

interface Subscription {
  handler: CollectionItemHandler;
}

/**
 * 共享收藏夹监控引擎。
 *
 * 由 server 层持有单例；start 后常驻，stop 后清空订阅并终止循环。
 */
export class CollectionMonitorEngine {
  private readonly subscriptions = new Map<string, Subscription>();
  private controller: AbortController | null = null;
  private running = false;
  private config: CollectionMonitorConfig = {};
  private account: CollectionAccountConfig | null = null;

  /** 注册一个商品的监听；同一 goods_no 只能有一个订阅（重复注册覆盖） */
  subscribe(productNo: string, handler: CollectionItemHandler): void {
    const key = String(productNo || '').trim();
    if (!key) return;
    this.subscriptions.set(key, { handler });
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
        try {
          while (!controller.signal.aborted) {
            await this.scanOnce(account, pageSize, controller.signal, log);
            // 不 sleep：立即进入下一轮，下一次翻页请求会被闸门挡住
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            log(`收藏夹共享循环异常退出: ${error instanceof Error ? error.message : String(error)}`, 'error');
            this.config.onError?.(error);
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
  }

  /** 单轮：全量翻页直到某页不足 pageSize */
  private async scanOnce(
    account: CollectionAccountConfig,
    pageSize: number,
    signal: AbortSignal,
    log: (message: string, level?: 'info' | 'warn' | 'error') => void
  ): Promise<void> {
    for (let page = 1; ; page++) {
      if (signal.aborted) return;

      const result = await checkCollectionStock(
        { platform: account.platform, page, pageSize },
        { adapterConfig: account.adapterConfig }
      );

      const items = [...result.inStockItems, ...result.outOfStockItems];
      if (items.length === 0) return;

      // 已拉取的这一页完整处理完（哪怕中途 stop），避免半页数据被丢弃
      for (const item of items) {
        const sub = this.subscriptions.get(String(item.productNo || '').trim());
        if (sub) {
          try {
            await sub.handler(item);
          } catch (error) {
            log(`分发商品 ${item.productNo} 失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
          }
        } else {
          // 脏数据：不在任何任务订阅里，清理（默认取消收藏）
          await this.handleDirty(item, account);
        }
      }

      // 不足一页说明到底了
      if (items.length < pageSize) return;
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
