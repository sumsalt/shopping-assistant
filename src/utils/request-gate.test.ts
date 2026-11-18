/**
 * 双层全局请求闸门测试
 *
 * 每层都是独立的令牌桶：
 * - IP 桶 `ip:<出口IP>`：同一出口 IP 串行放行（默认 1s）
 * - UID 桶 `uid:<账号>`：同一账号串行放行（默认 1s）
 * 一次请求必须依次拿到两层令牌才放行。
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

describe('request-gate 双层闸门', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRequestGate();
    configureRequestGate({ ipIntervalMs: 1_000, uidIntervalMs: 2_000, maxWaitMs: 600_000 });
  });

  afterEach(() => {
    resetRequestGate();
    vi.useRealTimers();
  });

  it('同账号同出口：首次立即放行，第二次要等两层里较长的 UID 间隔', async () => {
    await expect(
      acquireRequestSlot({ taskId: 't1', accountKey: 'u1', localAddress: '10.0.0.2' })
    ).resolves.toBeUndefined();

    let granted = false;
    const second = acquireRequestSlot({ taskId: 't1', accountKey: 'u1', localAddress: '10.0.0.2' }).then(() => {
      granted = true;
    });

    await advance(1_100);
    // IP 桶 1s 已过，但 UID 桶 2s 未到
    expect(granted).toBe(false);
    expect(getGateStats().pending).toBeGreaterThanOrEqual(1);

    await advance(1_000);
    await second;
    expect(granted).toBe(true);
  });

  it('匿名请求只过 IP 桶：跳过 uid:anon，同出口的匿名请求仍按 IP 间隔排队', async () => {
    await acquireRequestSlot({ taskId: 't1' });

    let granted = false;
    // 不同 taskId 的匿名请求：没有 UID 桶串联，只共享 ip:default
    const second = acquireRequestSlot({ taskId: 't2' }).then(() => {
      granted = true;
    });

    await advance(900);
    expect(granted).toBe(false);

    // 只等 IP 桶 1s 就放行，不再需要等 2s 的 UID 桶
    await advance(200);
    await second;
    expect(granted).toBe(true);

    // 统计里只生成 IP 桶，不再有 uid:anon 桶
    const stats = getGateStats();
    expect(stats.buckets.some((item) => item.key === 'ip:default')).toBe(true);
    expect(stats.buckets.some((item) => item.key === 'uid:anon')).toBe(false);
  });

  it('不同出口 IP 的匿名请求互不排队（仅 IP 桶生效）', async () => {
    await acquireRequestSlot({ taskId: 't1' });

    // 匿名 + 不同出口 IP：IP 桶独立，无 UID 桶，立即放行
    await expect(
      acquireRequestSlot({ taskId: 't2', localAddress: '10.0.0.9' })
    ).resolves.toBeUndefined();
  });

  it('不同出口 IP 且不同账号：两层都独立，互不排队', async () => {
    await acquireRequestSlot({ taskId: 't1', accountKey: 'u1', localAddress: '10.0.0.2' });

    // 换 IP 又换账号，两个桶都是全新的
    await expect(
      acquireRequestSlot({ taskId: 't2', accountKey: 'u2', localAddress: '10.0.0.3' })
    ).resolves.toBeUndefined();
  });

  it('IP 层是硬约束：换了账号但同出口 IP，仍要等 IP 桶', async () => {
    await acquireRequestSlot({ taskId: 't1', accountKey: 'u1', localAddress: '10.0.0.2' });

    let granted = false;
    // u2 是不同账号（UID 桶独立），但同一个出口 IP
    const second = acquireRequestSlot({ taskId: 't2', accountKey: 'u2', localAddress: '10.0.0.2' }).then(() => {
      granted = true;
    });

    await advance(900);
    expect(granted).toBe(false);
    await advance(200);
    await second;
    // 只等了 IP 桶 1s；UID 桶 u2 是全新的，立即放行
    expect(granted).toBe(true);
  });

  it('任务级轮转：同一桶里大任务不会饿死小任务', async () => {
    await acquireRequestSlot({ taskId: 'big', accountKey: 'u1', localAddress: '10.0.0.2' });

    const order: string[] = [];
    const big = Promise.all(
      [1, 2, 3].map(() =>
        acquireRequestSlot({ taskId: 'big', accountKey: 'u1', localAddress: '10.0.0.2' }).then(() => order.push('big'))
      )
    );
    const small = acquireRequestSlot({ taskId: 'small', accountKey: 'u1', localAddress: '10.0.0.2' }).then(() =>
      order.push('small')
    );

    for (let i = 0; i < 8; i++) {
      await advance(2_000);
    }
    await Promise.all([big, small]);

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
    expect(getGateContext()).toBeUndefined();
  });

  it('排队超时抛错并清理队列', async () => {
    // 超时阈值小于 IP 桶间隔(1s)，让第二次请求卡在 IP 层就超时
    configureRequestGate({ maxWaitMs: 500 });
    await acquireRequestSlot({ taskId: 't1', accountKey: 'u1', localAddress: '10.0.0.2' });

    const pending = acquireRequestSlot({ taskId: 't1', accountKey: 'u1', localAddress: '10.0.0.2' });
    const assertion = expect(pending).rejects.toThrow(/排队超时/);

    await advance(600);
    await assertion;
    expect(getGateStats().pending).toBe(0);
    expect(getGateStats().timedOut).toBeGreaterThanOrEqual(1);
  });

  it('统计信息同时包含 ip 层和 uid 层桶', async () => {
    await acquireRequestSlot({ taskId: 't1', accountKey: 'u1', localAddress: '10.0.0.2' });
    void acquireRequestSlot({ taskId: 't1', accountKey: 'u1', localAddress: '10.0.0.2' });

    const stats = getGateStats();
    const ipBucket = stats.buckets.find((item) => item.key === 'ip:10.0.0.2');
    const uidBucket = stats.buckets.find((item) => item.key === 'uid:u1');

    // 第二个请求两层串行申请：先卡在 IP 桶，UID 桶尚未入队
    expect(ipBucket).toMatchObject({ scope: 'ip', intervalMs: 1_000, pending: 1 });
    expect(uidBucket).toMatchObject({ scope: 'uid', intervalMs: 2_000 });
    expect(getGateOptions().ipIntervalMs).toBe(1_000);
    expect(getGateOptions().uidIntervalMs).toBe(2_000);
  });
});
