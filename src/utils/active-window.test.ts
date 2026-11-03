import { describe, expect, it } from 'vitest';
import {
  activeSecondsBetween,
  isWithinActiveWindow,
  msUntilActiveWindowStart,
  normalizeActiveWindow,
} from './active-window';

describe('normalizeActiveWindow - 生效时段校验', () => {
  it('合法的 HH:mm 原样返回', () => {
    expect(normalizeActiveWindow({ start: '09:00', end: '18:30' })).toEqual({
      start: '09:00',
      end: '18:30',
    });
  });

  it('未设置或格式非法时返回 null', () => {
    expect(normalizeActiveWindow(undefined)).toBeNull();
    expect(normalizeActiveWindow(null)).toBeNull();
    expect(normalizeActiveWindow({ start: '9:00', end: '18:00' })).toBeNull();
    expect(normalizeActiveWindow({ start: '24:00', end: '18:00' })).toBeNull();
    expect(normalizeActiveWindow({ start: '09:00', end: '09:00' })).toBeNull();
  });
});

describe('isWithinActiveWindow - 是否在时段内', () => {
  const day = { start: '09:00', end: '18:00' };

  it('普通时段左闭右开', () => {
    expect(isWithinActiveWindow(new Date(2026, 0, 1, 8, 59), day)).toBe(false);
    expect(isWithinActiveWindow(new Date(2026, 0, 1, 9, 0), day)).toBe(true);
    expect(isWithinActiveWindow(new Date(2026, 0, 1, 17, 59), day)).toBe(true);
    expect(isWithinActiveWindow(new Date(2026, 0, 1, 18, 0), day)).toBe(false);
  });

  it('跨天时段（22:00-02:00）', () => {
    const night = { start: '22:00', end: '02:00' };
    expect(isWithinActiveWindow(new Date(2026, 0, 1, 23, 30), night)).toBe(true);
    expect(isWithinActiveWindow(new Date(2026, 0, 2, 1, 59), night)).toBe(true);
    expect(isWithinActiveWindow(new Date(2026, 0, 2, 2, 0), night)).toBe(false);
    expect(isWithinActiveWindow(new Date(2026, 0, 2, 12, 0), night)).toBe(false);
  });
});

describe('activeSecondsBetween - 只累计时段内的秒数', () => {
  it('跨两个自然日只算时段内的部分', () => {
    const window = { start: '09:00', end: '18:00' };
    const from = new Date(2026, 0, 1, 8, 0);
    const to = new Date(2026, 0, 2, 10, 0);

    // 1 号 9:00-18:00 共 9 小时 + 2 号 9:00-10:00 共 1 小时
    expect(activeSecondsBetween(from, to, window)).toBe(10 * 3600);
  });

  it('跨天时段按两段计算', () => {
    const window = { start: '22:00', end: '02:00' };
    const from = new Date(2026, 0, 1, 21, 0);
    const to = new Date(2026, 0, 2, 3, 0);

    // 1 号 22:00-24:00 两小时 + 2 号 0:00-2:00 两小时
    expect(activeSecondsBetween(from, to, window)).toBe(4 * 3600);
  });

  it('完全在时段外时返回 0', () => {
    const window = { start: '09:00', end: '18:00' };
    expect(
      activeSecondsBetween(new Date(2026, 0, 1, 20, 0), new Date(2026, 0, 1, 23, 0), window)
    ).toBe(0);
  });
});

describe('msUntilActiveWindowStart - 距离下次开始', () => {
  const window = { start: '09:00', end: '18:00' };

  it('当天还没开始时返回当天剩余时间', () => {
    const now = new Date(2026, 0, 1, 8, 0);
    expect(msUntilActiveWindowStart(now, window)).toBe(3600 * 1000);
  });

  it('当天已结束后返回次日间隔', () => {
    const now = new Date(2026, 0, 1, 20, 0);
    expect(msUntilActiveWindowStart(now, window)).toBe(13 * 3600 * 1000);
  });
});
