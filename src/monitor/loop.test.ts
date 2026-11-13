import { describe, expect, it, vi } from 'vitest';
import { runMonitorLoop } from './loop';

/** 构造一个可控时钟：每次 sleep 前进 interval 毫秒 */
const fakeClock = (stepMs: number) => {
  let current = 0;
  return {
    now: () => current,
    sleep: async () => {
      current += stepMs;
    },
  };
};

describe('runMonitorLoop', () => {
  it('按间隔执行，达到总时长后停止', async () => {
    const clock = fakeClock(10_000);
    const rounds: number[] = [];
    const result = await runMonitorLoop({
      signal: new AbortController().signal,
      intervalSeconds: 10,
      durationSeconds: 30,
      runRound: round => {
        rounds.push(round);
      },
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(rounds).toEqual([1, 2, 3]);
    expect(result).toEqual({ rounds: 3, stoppedBy: 'duration' });
  });

  it('shouldStop 命中后不再执行下一轮', async () => {
    const clock = fakeClock(1000);
    let done = false;
    const rounds: number[] = [];
    const result = await runMonitorLoop({
      signal: new AbortController().signal,
      intervalSeconds: 1,
      runRound: round => {
        rounds.push(round);
        if (round === 2) done = true;
      },
      shouldStop: () => done,
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(rounds).toEqual([1, 2]);
    expect(result.stoppedBy).toBe('done');
  });

  it('abort 后中断等待', async () => {
    const controller = new AbortController();
    let rounds = 0;
    const result = await runMonitorLoop({
      signal: controller.signal,
      intervalSeconds: 1,
      runRound: () => {
        rounds++;
        controller.abort();
      },
      sleep: async () => {
        throw new Error('不应进入等待');
      },
    });

    expect(rounds).toBe(1);
    expect(result.stoppedBy).toBe('abort');
  });

  it('普通异常继续，fatal 向上抛', async () => {
    const clock = fakeClock(1000);
    const handled: unknown[] = [];
    const result = await runMonitorLoop({
      signal: new AbortController().signal,
      intervalSeconds: 1,
      durationSeconds: 3,
      runRound: () => {
        throw new Error('boom');
      },
      onError: error => {
        handled.push(error);
      },
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(handled).toHaveLength(3);
    expect(result.rounds).toBe(3);

    await expect(
      runMonitorLoop({
        signal: new AbortController().signal,
        intervalSeconds: 1,
        runRound: () => {
          throw new Error('auth');
        },
        onError: () => 'fatal',
      })
    ).rejects.toThrow('auth');
  });

  it('低于最小间隔时按最小间隔执行', async () => {
    const clock = fakeClock(500);
    const waits: number[] = [];
    await runMonitorLoop({
      signal: new AbortController().signal,
      intervalSeconds: 0.5,
      minIntervalSeconds: 5,
      durationSeconds: 6,
      runRound: () => {},
      now: clock.now,
      sleep: async ms => {
        waits.push(ms);
        clock.sleep();
      },
    });
    expect(waits[0]).toBeGreaterThanOrEqual(5000);
  });

  it('非法间隔直接报错', async () => {
    await expect(
      runMonitorLoop({
        signal: new AbortController().signal,
        intervalSeconds: 0,
        runRound: () => {},
      })
    ).rejects.toThrow('循环间隔');
    vi.restoreAllMocks();
  });
});
