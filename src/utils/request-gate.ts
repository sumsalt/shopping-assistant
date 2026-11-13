/**
 * 全局请求闸门
 *
 * 只对「后台监控任务」生效：监控循环在执行前用 {@link runWithGateContext} 打上任务上下文，
 * HTTP 出口（utils/http.ts）检测到上下文时才排队取令牌；没有上下文的请求
 * （用户手动查询、创建任务时的基线拉取等）直接放行，不受任何限制。
 *
 * 分桶规则（以「本次请求实际带的凭证」为准，由适配器在请求级声明）：
 * - 带 uid + token：按账号分桶，默认 5 秒放行一次，多账号互不影响
 * - 不带凭证：所有匿名请求共享一个桶，默认 1 秒放行一次（同出口 IP 共享配额）
 *
 * 桶键与请求身份保持一致很重要：给匿名请求排 5 秒桶会让检测变慢，
 * 给登录请求排 1 秒桶则会用匿名配额去打账号接口。
 *
 * 公平策略：每个任务一个 FIFO 子队列，令牌就绪时按任务轮转（round-robin）取队首，
 * 大任务不会饿死小任务；同一任务同一时刻只有 1 个在途请求（任务循环本身串行）。
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** 任务类型 */
export type GateTaskKind = 'stock' | 'price' | 'tab';

/** 请求闸门上下文（由监控循环注入） */
export interface GateContext {
  /** 任务 ID，用于任务级公平调度；同一任务的所有请求共用一个子队列 */
  taskId: string;
  /** 任务类型，仅用于统计展示 */
  kind?: GateTaskKind;
  /**
   * 登录态标识（uid）；为空表示匿名请求，走匿名桶
   *
   * 由 HTTP 出口按请求实际凭证覆盖（`HttpRequestOptions.accountKey`），
   * 任务上下文一般不必设置，保留字段用于显式覆盖。
   */
  accountKey?: string;
}

const storage = new AsyncLocalStorage<GateContext>();

/**
 * 在指定上下文中执行（后续所有异步操作都会继承该上下文）
 */
export const runWithGateContext = <T>(context: GateContext, fn: () => T): T =>
  storage.run(context, fn);

/**
 * 读取当前上下文；没有上下文表示这是用户主动发起的请求，不做限流
 */
export const getGateContext = (): GateContext | undefined => storage.getStore();

/** 闸门参数 */
export interface GateOptions {
  /** 有登录态：同一账号的两次请求最小间隔（毫秒） */
  authIntervalMs: number;
  /** 无登录态：全局两次请求最小间隔（毫秒） */
  anonIntervalMs: number;
  /** 单个请求最长排队时间（毫秒），超时抛 GateTimeoutError */
  maxWaitMs: number;
}

const readEnvInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const options: GateOptions = {
  authIntervalMs: readEnvInt('GATE_AUTH_INTERVAL_MS', 5_000),
  anonIntervalMs: readEnvInt('GATE_ANON_INTERVAL_MS', 1_000),
  maxWaitMs: readEnvInt('GATE_MAX_WAIT_MS', 10 * 60_000),
};

/**
 * 调整闸门参数（运行时可调用，例如从前端设置页下发生效）
 */
export const configureRequestGate = (patch: Partial<GateOptions>): GateOptions => {
  if (typeof patch.authIntervalMs === 'number' && patch.authIntervalMs >= 0) {
    options.authIntervalMs = patch.authIntervalMs;
  }
  if (typeof patch.anonIntervalMs === 'number' && patch.anonIntervalMs >= 0) {
    options.anonIntervalMs = patch.anonIntervalMs;
  }
  if (typeof patch.maxWaitMs === 'number' && patch.maxWaitMs > 0) {
    options.maxWaitMs = patch.maxWaitMs;
  }
  // 间隔变化后，已有桶需要按新间隔重新排期
  for (const bucket of buckets.values()) {
    bucket.intervalMs = bucket.intervalMsFor();
    schedule(bucket);
  }
  return { ...options };
};

/** 读取当前闸门参数 */
export const getGateOptions = (): GateOptions => ({ ...options });

/** 排队超时错误 */
export class GateTimeoutError extends Error {
  readonly taskId: string;
  readonly waitedMs: number;

  constructor(taskId: string, waitedMs: number) {
    super(`请求排队超时（已等待 ${Math.round(waitedMs / 1000)} 秒）`);
    this.name = 'GateTimeoutError';
    this.taskId = taskId;
    this.waitedMs = waitedMs;
  }
}

interface Waiter {
  taskId: string;
  kind?: GateTaskKind;
  enqueuedAt: number;
  resolve: () => void;
  reject: (error: GateTimeoutError) => void;
  timer: NodeJS.Timeout;
}

interface Bucket {
  key: string;
  /** 是否走登录态配额 */
  authenticated: boolean;
  /** 当前生效的间隔（动态读取，方便运行时调整） */
  intervalMs: number;
  intervalMsFor: () => number;
  /** 上次放行时间 */
  lastGrantAt: number;
  /** taskId -> 该任务的等待队列 */
  queues: Map<string, Waiter[]>;
  /** 有等待的任务 ID 列表，轮转指针在其上移动 */
  order: string[];
  /** 轮转指针 */
  cursor: number;
  granted: number;
  timedOut: number;
  timer: NodeJS.Timeout | null;
}

const buckets = new Map<string, Bucket>();

const bucketKeyOf = (accountKey?: string): string =>
  accountKey && accountKey.trim() ? `auth:${accountKey.trim()}` : 'anon';

const getBucket = (context: GateContext): Bucket => {
  const key = bucketKeyOf(context.accountKey);
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const authenticated = key !== 'anon';
  const bucket: Bucket = {
    key,
    authenticated,
    intervalMs: authenticated ? options.authIntervalMs : options.anonIntervalMs,
    intervalMsFor: () =>
      authenticated ? options.authIntervalMs : options.anonIntervalMs,
    lastGrantAt: 0,
    queues: new Map(),
    order: [],
    cursor: 0,
    granted: 0,
    timedOut: 0,
    timer: null,
  };
  buckets.set(key, bucket);
  return bucket;
};

/** 取下一位应放行的等待者（任务级轮转） */
const shiftNext = (bucket: Bucket): Waiter | null => {
  const total = bucket.order.length;
  for (let i = 0; i < total; i++) {
    const index = (bucket.cursor + i) % total;
    const taskId = bucket.order[index];
    const queue = bucket.queues.get(taskId);

    if (!queue || queue.length === 0) {
      continue;
    }

    const waiter = queue.shift();
    if (!waiter) {
      continue;
    }

    if (queue.length === 0) {
      bucket.queues.delete(taskId);
      bucket.order.splice(index, 1);
      bucket.cursor = bucket.order.length === 0 ? 0 : index % bucket.order.length;
    } else {
      bucket.cursor = (index + 1) % bucket.order.length;
    }

    return waiter;
  }

  bucket.order.length = 0;
  bucket.cursor = 0;
  return null;
};

/** 安排下一次放行 */
function schedule(bucket: Bucket): void {
  if (bucket.timer || bucket.order.length === 0) {
    return;
  }

  const wait = Math.max(0, bucket.lastGrantAt + bucket.intervalMs - Date.now());
  bucket.timer = setTimeout(() => {
    bucket.timer = null;
    drain(bucket);
  }, wait);
  // 不要让闸门定时器阻止进程退出
  bucket.timer.unref?.();
}

/** 尝试放行一个等待者 */
const drain = (bucket: Bucket): void => {
  if (bucket.order.length === 0) {
    return;
  }

  const now = Date.now();
  if (now - bucket.lastGrantAt < bucket.intervalMs) {
    schedule(bucket);
    return;
  }

  const waiter = shiftNext(bucket);
  if (!waiter) {
    return;
  }

  clearTimeout(waiter.timer);
  bucket.lastGrantAt = now;
  bucket.granted++;
  waiter.resolve();

  if (bucket.order.length > 0) {
    schedule(bucket);
  }
};

/**
 * 申请一次请求配额
 *
 * 仅在存在任务上下文时由 HTTP 出口调用；返回的 Promise resolve 后才允许发请求。
 * 排队超过 {@link GateOptions.maxWaitMs} 会 reject，调用方应视为一次任务失败而非无限挂起。
 */
export const acquireRequestSlot = (context: GateContext): Promise<void> => {
  const bucket = getBucket(context);
  const now = Date.now();

  // 无人排队且距上次放行已够间隔：直接放行
  if (bucket.order.length === 0 && now - bucket.lastGrantAt >= bucket.intervalMs) {
    bucket.lastGrantAt = now;
    bucket.granted++;
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      taskId: context.taskId,
      kind: context.kind,
      enqueuedAt: now,
      resolve,
      reject: (error: GateTimeoutError) => {
        const index = bucket.order.indexOf(context.taskId);
        if (index >= 0) {
          const queue = bucket.queues.get(context.taskId);
          if (queue) {
            const at = queue.indexOf(waiter);
            if (at >= 0) {
              queue.splice(at, 1);
            }
            if (queue.length === 0) {
              bucket.queues.delete(context.taskId);
              const orderIndex = bucket.order.indexOf(context.taskId);
              if (orderIndex >= 0) {
                bucket.order.splice(orderIndex, 1);
                bucket.cursor = bucket.order.length === 0 ? 0 : orderIndex % bucket.order.length;
              }
            }
          }
        }
        bucket.timedOut++;
        reject(error);
      },
      timer: setTimeout(() => {
        waiter.reject(new GateTimeoutError(context.taskId, Date.now() - waiter.enqueuedAt));
      }, options.maxWaitMs),
    };
    waiter.timer.unref?.();

    const queue = bucket.queues.get(context.taskId);
    if (queue) {
      queue.push(waiter);
    } else {
      bucket.queues.set(context.taskId, [waiter]);
      bucket.order.push(context.taskId);
    }

    schedule(bucket);
  });
};

/** 单个任务的排队统计 */
export interface GateTaskStats {
  taskId: string;
  kind?: GateTaskKind;
  pending: number;
  oldestWaitMs: number;
}

/** 单个桶的统计 */
export interface GateBucketStats {
  key: string;
  authenticated: boolean;
  intervalMs: number;
  pending: number;
  granted: number;
  timedOut: number;
  /** 距下一个令牌就绪的毫秒数 */
  nextGrantInMs: number;
  tasks: GateTaskStats[];
}

/** 闸门整体统计 */
export interface GateStats {
  options: GateOptions;
  pending: number;
  granted: number;
  timedOut: number;
  buckets: GateBucketStats[];
}

/**
 * 读取闸门运行状态（用于 /api/gate/stats 和排障）
 */
export const getGateStats = (): GateStats => {
  const now = Date.now();
  const list: GateBucketStats[] = [];
  let pending = 0;
  let granted = 0;
  let timedOut = 0;

  for (const bucket of buckets.values()) {
    const tasks: GateTaskStats[] = bucket.order.map((taskId) => {
      const queue = bucket.queues.get(taskId) || [];
      const oldest = queue[0];
      return {
        taskId,
        kind: oldest?.kind,
        pending: queue.length,
        oldestWaitMs: oldest ? now - oldest.enqueuedAt : 0,
      };
    });

    const bucketPending = tasks.reduce((sum, task) => sum + task.pending, 0);
    pending += bucketPending;
    granted += bucket.granted;
    timedOut += bucket.timedOut;

    list.push({
      key: bucket.key,
      authenticated: bucket.authenticated,
      intervalMs: bucket.intervalMs,
      pending: bucketPending,
      granted: bucket.granted,
      timedOut: bucket.timedOut,
      nextGrantInMs: Math.max(0, bucket.lastGrantAt + bucket.intervalMs - now),
      tasks,
    });
  }

  list.sort((a, b) => b.pending - a.pending);

  return { options: { ...options }, pending, granted, timedOut, buckets: list };
};

/**
 * 清空闸门状态（仅用于测试）
 */
export const resetRequestGate = (): void => {
  for (const bucket of buckets.values()) {
    if (bucket.timer) {
      clearTimeout(bucket.timer);
      bucket.timer = null;
    }
    for (const queue of bucket.queues.values()) {
      for (const waiter of queue) {
        clearTimeout(waiter.timer);
      }
    }
  }
  buckets.clear();
};
