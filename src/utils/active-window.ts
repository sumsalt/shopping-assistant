/**
 * 每日生效时段
 *
 * 只处理「每天固定时段」：如 09:00-23:00，每天重复；start > end 表示跨天（22:00-02:00）。
 * 时间按服务器本地时区解释（线上为 Asia/Shanghai），中国无夏令时，按 24 小时固定偏移计算。
 */

/** 生效时段配置 */
export interface ActiveWindow {
  /** 每天生效起始时间，HH:mm */
  start: string;
  /** 每天生效结束时间，HH:mm；早于 start 表示跨天 */
  end: string;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 解析 HH:mm 为「当日第几秒」，非法返回 null */
export const parseTimeOfDay = (value: string): number | null => {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60;
};

/** 把 Date 转成「当日第几秒」 */
const secondsOfDay = (date: Date): number =>
  date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();

/**
 * 校验并归一化生效时段
 *
 * @returns 合法时返回 { start, end }；未设置或非法返回 null
 */
export const normalizeActiveWindow = (
  value?: Partial<ActiveWindow> | null
): ActiveWindow | null => {
  if (!value || typeof value.start !== 'string' || typeof value.end !== 'string') {
    return null;
  }

  const start = parseTimeOfDay(value.start);
  const end = parseTimeOfDay(value.end);

  // start === end 没有意义（等于全天或完全不生效），按未设置处理
  if (start === null || end === null || start === end) {
    return null;
  }

  return { start: value.start, end: value.end };
};

/**
 * 判断某一时刻是否落在生效时段内
 *
 * 区间为左闭右开：start 那一秒算在时段内，end 那一秒不算。
 */
export const isWithinActiveWindow = (date: Date, window: ActiveWindow): boolean => {
  const start = parseTimeOfDay(window.start);
  const end = parseTimeOfDay(window.end);
  if (start === null || end === null || start === end) {
    return true;
  }

  const current = secondsOfDay(date);

  if (start < end) {
    return current >= start && current < end;
  }

  // 跨天：如 22:00-02:00
  return current >= start || current < end;
};

/** 构造某个自然日的时段区间（毫秒），跨天时拆成两段 */
const buildDaySegments = (dayStartMs: number, start: number, end: number): Array<[number, number]> => {
  if (start < end) {
    return [[dayStartMs + start * 1000, dayStartMs + end * 1000]];
  }

  // 跨天：当天 start 到次日 0 点，以及 0 点到当天 end
  return [
    [dayStartMs + start * 1000, dayStartMs + DAY_MS],
    [dayStartMs, dayStartMs + end * 1000],
  ];
};

/**
 * 计算 [from, to] 区间内落在生效时段中的秒数
 *
 * 用于「监控时长只算运行时间」：休眠（时段外）不消耗时长。
 */
export const activeSecondsBetween = (from: Date, to: Date, window: ActiveWindow): number => {
  const start = parseTimeOfDay(window.start);
  const end = parseTimeOfDay(window.end);
  if (start === null || end === null || start === end) {
    return Math.max(0, (to.getTime() - from.getTime()) / 1000);
  }

  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (toMs <= fromMs) {
    return 0;
  }

  let totalMs = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const lastDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  while (cursor.getTime() <= lastDay.getTime()) {
    const dayStart = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate()
    ).getTime();

    for (const [segStart, segEnd] of buildDaySegments(dayStart, start, end)) {
      const overlap = Math.min(segEnd, toMs) - Math.max(segStart, fromMs);
      if (overlap > 0) {
        totalMs += overlap;
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return totalMs / 1000;
};

/**
 * 距离下一次生效时段开始还有多少毫秒
 *
 * 仅在当前不在时段内时有意义；已在时段内调用会返回下一次（明天）的间隔。
 */
export const msUntilActiveWindowStart = (now: Date, window: ActiveWindow): number => {
  const start = parseTimeOfDay(window.start);
  if (start === null) {
    return 0;
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    + start * 1000;

  let next = todayStart;
  while (next <= now.getTime()) {
    next += DAY_MS;
  }

  return next - now.getTime();
};
