/**
 * 全局请求闸门测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  acquireRequestSlot,
  configureRequestGate,
  getGateContext,
  getGateOptions,
  getGateStats,
  resetRequestGate,
  runWithGateContext,
} from './request-gate';

/** 推进假定时器并冲刷微任务 */
const advance = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('request-gate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRequestGate();
    configureRequestGate({ authIntervalMs: 30_000, anonIntervalMs: 1_000, maxWaitMs: 600_000 });
  });

  afterEach(() => {
    resetRequestGate();
    vi.useRealTimers();
  });

  it('同账号首次请求立即放行，第二次要等 30 秒', async () => {
    const first = acquireRequestSlot({ taskId: 't1', accountKey: 'u1' });
    await expect(first).resolves.toBeUndefined();

    let granted = false;
    const second = acquireRequestSlot({ taskId: 't1', accountKey: 'u1' }).then(() => {
      granted = true;
    });

    await advance(29_000);
    expect(granted).toBe(false);
    expect(getGateStats().pending).toBe(1);

    await advance(1_100);
    await second;
    expect(granted).toBe(true);
  });

  it('匿名桶走 1 秒间隔', async () => {
    await acquireRequestSlot({ taskId: 't1' });

    let granted = false;
    const second = acquireRequestSlot({ taskId: 't1' }).then(() => {
      granted = true;
    });

    await advance(900);
    expect(granted).toBe(false);

    await advance(200);
    await second;
    expect(granted).toBe(true);
  });

  it('不同账号的桶互不影响', async () => {
    await acquireRequestSlot({ taskId: 't1', accountKey: 'u1' });

    // u2 是另一个桶，不应排队
    await expect(
      acquireRequestSlot({ taskId: 't2', accountKey: 'u2' })
    ).resolves.toBeUndefined();
  });

  it('任务级轮转：大任务不会饿死小任务', async () => {
    // 先占满首令牌
    await acquireRequestSlot({ taskId: 'big', accountKey: 'u1' });

    const order: string[] = [];
    // 大任务排 3 个，小任务排 1 个
    const big = Promise.all(
      [1, 2, 3].map(() =>
        acquireRequestSlot({ taskId: 'big', accountKey: 'u1' }).then(() => order.push('big'))
      )
    );
    const small = acquireRequestSlot({ taskId: 'small', accountKey: 'u1' }).then(() =>
      order.push('small')
    );

    for (let i = 0; i < 5; i++) {
      await advance(30_000);
    }
    await Promise.all([big, small]);

    // 小任务应该在第 2 个令牌就拿到，而不是排在大任务 3 个请求之后
    expect(order.slice(0, 2)).toEqual(['big', 'small']);
    expect(order).toHaveLength(4);
  });

  it('任务上下文在异步链中传递，作用域外自动失效', async () => {
    vi.useRealTimers();

    const seen: Array<string | undefined> = [];
    await runWithGateContext({ taskId: 't1', accountKey: 'u1' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.push(getGateContext()?.taskId);
    });

    expect(seen).toEqual(['t1']);
    // 用户请求不在任务上下文里，因此不会被限流
    expect(getGateContext()).toBeUndefined();
  });

  it('排队超时抛错并清理队列', async () => {
    configureRequestGate({ maxWaitMs: 5_000 });
    await acquireRequestSlot({ taskId: 't1', accountKey: 'u1' });

    const pending = acquireRequestSlot({ taskId: 't1', accountKey: 'u1' });
    const assertion = expect(pending).rejects.toThrow(/排队超时/);

    await advance(5_100);
    await assertion;
    expect(getGateStats().pending).toBe(0);
    expect(getGateStats().timedOut).toBe(1);
  });

  it('统计信息包含桶与任务等待数', async () => {    await acquireRequestSlot({ taskId: 't1', accountKey: 'u1' });
    void acquireRequestSlot({ taskId: 't1', accountKey: 'u1' });
    void acquireRequestSlot({ taskId: 't2', accountKey: 'u1' });

    const stats = getGateStats();
    const bucket = stats.buckets.find((item) => item.key === 'auth:u1');

    expect(bucket).toBeDefined();
    expect(bucket?.authenticated).toBe(true);
    expect(bucket?.intervalMs).toBe(30_000);
    expect(bucket?.pending).toBe(2);
    expect(bucket?.tasks).toHaveLength(2);
    expect(getGateOptions().authIntervalMs).toBe(30_000);
  });
});
