/**
 * 双层全局请求闸门
 *
 * 设计原则：**闸门是 HTTP 出口的默认属性，不是调用方申请的许可。**
 * 每个发往一手的请求都自带显式身份 {@link GateIdentity}，出口据此依次申请两层令牌：
 * - IP 层（`ip:<出口IP>`）：同一出口 IP 的最小间隔，默认 1 秒。所有请求都过这一层。
 * - UID 层（`uid:<账号键>`）：同一账号的最小间隔，默认 1 秒。
 *   匿名请求（无账号身份）只过 IP 桶，跳过 UID 层。
 *
 * 不再使用 AsyncLocalStorage 隐式上下文：请求身份由调用方（一手 client）随请求显式传入，
 * 不再依赖「循环有没有打上下文」这种隐式开关。是否限流由身份里的 {@link GatePolicy} 决定：
 * - `normal`（默认）：过闸门；
 * - `bypass`：仅下单 / 登录等时效敏感或前置场景豁免。
 *
 * 每个身份还带一个 {@link GateFlow} 业务流标识，仅用于统计展示（哪个业务在排队），
 * 也作为 UID 桶内的公平调度键（同一 flow 的请求共用一个子队列轮转）。
 */

/** 业务流：请求属于哪个后台业务，仅用于闸门统计与公平分组 */
export type GateFlow =
  | 'monitor.stock'
  | 'monitor.price'
  | 'monitor.tab'
  | 'collection.sync'
  | 'collection.index'
  | 'collection.write'
  | 'order.renew'
  | 'order.checkout'
  | 'auth.login'
  | 'manual';

/** 闸门策略：是否参与限流 */
export type GatePolicy = 'normal' | 'bypass';

/** 请求闸门层级 */
export type GateScope = 'ip' | 'uid';

/**
 * 请求自带的闸门身份
 *
 * 由一手 client 在发请求时从账号快照（profile）解析并显式传入，不依赖任何上下文。
 */
export interface GateIdentity {
  /** 业务流，决定统计归类与 UID 桶内的公平分组 */
  flow: GateFlow;
  /** 公平调度键；缺省时用 flow。同一键的请求共用一个子队列轮转 */
  queueKey?: string;
  /**
   * 登录 uid；空串表示匿名请求。
   * 有值进 `uid:<accountKey>`；匿名只过 IP 桶。
   */
  accountKey?: string;
  /**
   * 出口 IP（本机网卡 localAddress）。
   * 决定进哪个 IP 桶；未指定进 `ip:default`。
   */
  localAddress?: string;
}

/** 闸门参数 */
export interface GateOptions {
  /** IP 桶：同一出口 IP 两次请求的最小间隔（毫秒） */
  ipIntervalMs: number;
  /** UID 桶：同一账号两次请求的最小间隔（毫秒） */
  uidIntervalMs: number;
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

// 实验分支：两层都压到 1 秒，用来观察一手的风控阈值
const options: GateOptions = {
  ipIntervalMs: readEnvInt('GATE_IP_INTERVAL_MS', 1_000),
  uidIntervalMs: readEnvInt('GATE_UID_INTERVAL_MS', 1_000),
  maxWaitMs: readEnvInt('GATE_MAX_WAIT_MS', 10 * 60_000),
};

/**
 * 调整闸门参数（运行时可调用，例如从前端设置页下发生效）
 */
export const configureRequestGate = (patch: Partial<GateOptions>): GateOptions => {
  if (typeof patch.ipIntervalMs === 'number' && patch.ipIntervalMs >= 0) {
    options.ipIntervalMs = patch.ipIntervalMs;
  }
  if (typeof patch.uidIntervalMs === 'number' && patch.uidIntervalMs >= 0) {
    options.uidIntervalMs = patch.uidIntervalMs;
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
  readonly queueKey: string;
  readonly waitedMs: number;

  constructor(queueKey: string, waitedMs: number) {
    super(`请求排队超时（已等待 ${Math.round(waitedMs / 1000)} 秒）`);
    this.name = 'GateTimeoutError';
    this.queueKey = queueKey;
    this.waitedMs = waitedMs;
  }
}

interface Waiter {
  queueKey: string;
  flow: GateFlow;
  enqueuedAt: number;
  resolve: () => void;
  reject: (error: GateTimeoutError) => void;
  timer: NodeJS.Timeout;
}

interface Bucket {
  key: string;
  scope: GateScope;
  /** 当前生效的间隔（动态读取，方便运行时调整） */
  intervalMs: number;
  intervalMsFor: () => number;
  /** 上次放行时间 */
  lastGrantAt: number;
  /** queueKey -> 该身份的等待队列 */
  queues: Map<string, Waiter[]>;
  /** 有等待的身份 key 列表，轮转指针在其上移动 */
  order: string[];
  /** 轮转指针 */
  cursor: number;
  granted: number;
  timedOut: number;
  timer: NodeJS.Timeout | null;
}

const buckets = new Map<string, Bucket>();

const getBucket = (key: string, scope: GateScope): Bucket => {
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const bucket: Bucket = {
    key,
    scope,
    intervalMs: scope === 'ip' ? options.ipIntervalMs : options.uidIntervalMs,
    intervalMsFor: () => (scope === 'ip' ? options.ipIntervalMs : options.uidIntervalMs),
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

/** 取下一位应放行的等待者（身份级轮转） */
const shiftNext = (bucket: Bucket): Waiter | null => {
  const total = bucket.order.length;
  for (let i = 0; i < total; i++) {
    const index = (bucket.cursor + i) % total;
    const queueKey = bucket.order[index];
    const queue = bucket.queues.get(queueKey);

    if (!queue || queue.length === 0) {
      continue;
    }

    const waiter = queue.shift();
    if (!waiter) {
      continue;
    }

    if (queue.length === 0) {
      bucket.queues.delete(queueKey);
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

/** 在单个桶里申请一次配额 */
const acquireBucket = (bucket: Bucket, identity: GateIdentity, queueKey: string): Promise<void> => {
  const now = Date.now();

  // 无人排队且距上次放行已够间隔：直接放行
  if (bucket.order.length === 0 && now - bucket.lastGrantAt >= bucket.intervalMs) {
    bucket.lastGrantAt = now;
    bucket.granted++;
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      queueKey,
      flow: identity.flow,
      enqueuedAt: now,
      resolve,
      reject: (error: GateTimeoutError) => {
        const queue = bucket.queues.get(queueKey);
        if (queue) {
          const at = queue.indexOf(waiter);
          if (at >= 0) {
            queue.splice(at, 1);
          }
          if (queue.length === 0) {
            bucket.queues.delete(queueKey);
            const orderIndex = bucket.order.indexOf(queueKey);
            if (orderIndex >= 0) {
              bucket.order.splice(orderIndex, 1);
              bucket.cursor = bucket.order.length === 0 ? 0 : orderIndex % bucket.order.length;
            }
          }
        }
        bucket.timedOut++;
        reject(error);
      },
      timer: setTimeout(() => {
        waiter.reject(new GateTimeoutError(queueKey, Date.now() - waiter.enqueuedAt));
      }, options.maxWaitMs),
    };
    waiter.timer.unref?.();

    const queue = bucket.queues.get(queueKey);
    if (queue) {
      queue.push(waiter);
    } else {
      bucket.queues.set(queueKey, [waiter]);
      bucket.order.push(queueKey);
    }

    schedule(bucket);
  });
};

/**
 * 申请一次请求配额：依次通过 IP 层和 UID 层
 *
 * 由 HTTP 出口在「策略为 normal」时以显式身份调用；两层都 resolve 后才允许发请求。
 * 排队超过 {@link GateOptions.maxWaitMs} 会 reject，调用方应视为一次任务失败而非无限挂起。
 */
export const acquireRequestSlot = async (identity: GateIdentity): Promise<void> => {
  const queueKey = identity.queueKey?.trim() || identity.flow;

  // 第一层：出口 IP。所有请求都过，未指定 localAddress 时共享 ip:default
  const address = identity.localAddress?.trim() || 'default';
  await acquireBucket(getBucket(`ip:${address}`, 'ip'), identity, queueKey);

  // 第二层：账号闸门只约束「账号」。匿名请求没有账号身份，只过 IP 桶即可。
  const uid = identity.accountKey?.trim();
  if (!uid) return;
  await acquireBucket(getBucket(`uid:${uid}`, 'uid'), identity, queueKey);
};

/** 单个身份的排队统计 */
export interface GateTaskStats {
  queueKey: string;
  flow: GateFlow;
  pending: number;
  oldestWaitMs: number;
}

/** 单个桶的统计 */
export interface GateBucketStats {
  key: string;
  scope: GateScope;
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
    const tasks: GateTaskStats[] = bucket.order.map((queueKey) => {
      const queue = bucket.queues.get(queueKey) || [];
      const oldest = queue[0];
      return {
        queueKey,
        flow: oldest?.flow ?? 'manual',
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
      scope: bucket.scope,
      authenticated: bucket.scope === 'uid',
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
