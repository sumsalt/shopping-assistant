/**
 * 双层全局请求闸门测试
 *
 * 闸门是 HTTP 出口的默认属性：请求自带显式身份，依次申请两层令牌：
 * - IP 桶 `ip:<出口IP>`：同一出口 IP 串行放行（默认 1s）
 * - UID 桶 `uid:<账号>`：同一账号串行放行（默认 1s）
 * 一次请求必须依次拿到两层令牌才放行；匿名请求（无 accountKey）只过 IP 桶。
 *
 * 不再有 AsyncLocalStorage 隐式上下文——身份由请求显式传入。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  acquireRequestSlot,
  configureRequestGate,
  getGateOptions,
  getGateStats,
  resetRequestGate,
  type GateIdentity,
} from './request-gate';

/** 推进假定时器并冲刷微任务 */
const advance = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

const identity = (over: Partial<GateIdentity> = {}): GateIdentity => ({
  flow: 'monitor.stock',
  queueKey: 't1',
  ...over,
});

describe('request-gate 双层闸门（显式身份）', () => {
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
    const id = identity({ accountKey: 'u1', localAddress: '10.0.0.2' });
    await expect(acquireRequestSlot(id)).resolves.toBeUndefined();

    let granted = false;
    const second = acquireRequestSlot(id).then(() => {
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
    await acquireRequestSlot(identity());

    let granted = false;
    // 不同 queueKey 的匿名请求：没有 UID 桶串联，只共享 ip:default
    const second = acquireRequestSlot(identity({ queueKey: 't2' })).then(() => {
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
    await acquireRequestSlot(identity());

    // 匿名 + 不同出口 IP：IP 桶独立，无 UID 桶，立即放行
    await expect(
      acquireRequestSlot(identity({ queueKey: 't2', localAddress: '10.0.0.9' }))
    ).resolves.toBeUndefined();
  });

  it('不同出口 IP 且不同账号：两层都独立，互不排队', async () => {
    await acquireRequestSlot(identity({ accountKey: 'u1', localAddress: '10.0.0.2' }));

    await expect(
      acquireRequestSlot(identity({ queueKey: 't2', accountKey: 'u2', localAddress: '10.0.0.3' }))
    ).resolves.toBeUndefined();
  });

  it('IP 层是硬约束：换了账号但同出口 IP，仍要等 IP 桶', async () => {
    await acquireRequestSlot(identity({ accountKey: 'u1', localAddress: '10.0.0.2' }));

    let granted = false;
    // u2 是不同账号（UID 桶独立），但同一个出口 IP
    const second = acquireRequestSlot(
      identity({ queueKey: 't2', accountKey: 'u2', localAddress: '10.0.0.2' })
    ).then(() => {
      granted = true;
    });

    await advance(900);
    expect(granted).toBe(false);
    await advance(200);
    await second;
    expect(granted).toBe(true);
  });

  it('身份级轮转：同一桶里大任务不会饿死小任务', async () => {
    await acquireRequestSlot(identity({ queueKey: 'big', accountKey: 'u1', localAddress: '10.0.0.2' }));

    const order: string[] = [];
    const big = Promise.all(
      [1, 2, 3].map(() =>
        acquireRequestSlot(
          identity({ queueKey: 'big', accountKey: 'u1', localAddress: '10.0.0.2' })
        ).then(() => order.push('big'))
      )
    );
    const small = acquireRequestSlot(
      identity({ queueKey: 'small', accountKey: 'u1', localAddress: '10.0.0.2' })
    ).then(() => order.push('small'));

    for (let i = 0; i < 8; i++) {
      await advance(2_000);
    }
    await Promise.all([big, small]);

    expect(order.slice(0, 2)).toEqual(['big', 'small']);
    expect(order).toHaveLength(4);
  });

  it('queueKey 缺省时回退到 flow（同业务流共用子队列）', async () => {
    await acquireRequestSlot(identity({ flow: 'collection.write', queueKey: undefined, accountKey: 'u1', localAddress: '10.0.0.2' }));

    let granted = false;
    const second = acquireRequestSlot(
      identity({ flow: 'collection.write', queueKey: undefined, accountKey: 'u1', localAddress: '10.0.0.2' })
    ).then(() => {
      granted = true;
    });

    // 第二个请求卡在 IP 桶排队时，其身份的 queueKey 缺省回退成了 flow
    await advance(900);
    const ipBucket = getGateStats().buckets.find((b) => b.key === 'ip:10.0.0.2');
    expect(ipBucket?.tasks[0]).toMatchObject({ queueKey: 'collection.write', flow: 'collection.write' });

    await advance(1_300);
    await second;
    expect(granted).toBe(true);
  });

  it('排队超时抛错并清理队列', async () => {
    configureRequestGate({ maxWaitMs: 500 });
    await acquireRequestSlot(identity({ accountKey: 'u1', localAddress: '10.0.0.2' }));

    const pending = acquireRequestSlot(identity({ accountKey: 'u1', localAddress: '10.0.0.2' }));
    const assertion = expect(pending).rejects.toThrow(/排队超时/);

    await advance(600);
    await assertion;
    expect(getGateStats().pending).toBe(0);
    expect(getGateStats().timedOut).toBeGreaterThanOrEqual(1);
  });

  it('统计信息同时包含 ip 层和 uid 层桶，且带业务流标识', async () => {
    await acquireRequestSlot(identity({ flow: 'monitor.price', accountKey: 'u1', localAddress: '10.0.0.2' }));
    void acquireRequestSlot(identity({ flow: 'monitor.price', accountKey: 'u1', localAddress: '10.0.0.2' }));

    const stats = getGateStats();
    const ipBucket = stats.buckets.find((item) => item.key === 'ip:10.0.0.2');
    const uidBucket = stats.buckets.find((item) => item.key === 'uid:u1');

    expect(ipBucket).toMatchObject({ scope: 'ip', intervalMs: 1_000, pending: 1 });
    expect(uidBucket).toMatchObject({ scope: 'uid', intervalMs: 2_000 });
    // 排队中的第二个请求带业务流标识
    expect(ipBucket?.tasks[0]?.flow).toBe('monitor.price');
    expect(getGateOptions().ipIntervalMs).toBe(1_000);
    expect(getGateOptions().uidIntervalMs).toBe(2_000);
  });
});
