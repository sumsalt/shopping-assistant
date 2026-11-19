import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { GateIdentity } from './request-gate';

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  ensureConfigured: vi.fn(),
  getGateStats: vi.fn(),
}));

vi.mock('../email', () => ({
  sendEmail: (...args: unknown[]) => mocks.sendEmail(...args),
  ensureEmailServiceConfigured: () => mocks.ensureConfigured(),
}));

vi.mock('./request-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./request-gate')>();
  return {
    ...actual,
    getGateStats: () => mocks.getGateStats(),
  };
});

import {
  recordOutbound,
  recordFailure,
  recordGateTimeout,
  getAuditSnapshot,
  runAuditSummary,
  resetAudit,
} from './request-audit';

const identity = (flow: string): GateIdentity => ({ flow: flow as GateIdentity['flow'], accountKey: 'u1' });

const resetEnv = () => {
  for (const k of [
    'AUDIT_ENABLED', 'AUDIT_ALERT_TO', 'AUDIT_SERVER_LABEL', 'AUDIT_WINDOW_MS',
    'AUDIT_COOLDOWN_MS', 'AUDIT_SUMMARY_INTERVAL_MS', 'AUDIT_STAT_ALERT_ENABLED',
    'AUDIT_BYPASS_MANUAL_LIMIT', 'AUDIT_BYPASS_ORDER_LIMIT', 'AUDIT_BYPASS_LOGIN_LIMIT',
    'AUDIT_BYPASS_DEFAULT_LIMIT', 'AUDIT_FAIL_STORM_LIMIT', 'AUDIT_SPIKE_FACTOR',
    'AUDIT_SPIKE_MIN_SAMPLES', 'AUDIT_GLOBAL_LIMIT', 'SMTP_USER',
  ]) {
    delete process.env[k];
  }
};

beforeEach(() => {
  resetEnv();
  resetAudit();
  mocks.sendEmail.mockReset().mockResolvedValue({ success: true });
  mocks.ensureConfigured.mockReset().mockReturnValue(true);
  mocks.getGateStats.mockReset().mockReturnValue({
    options: { ipIntervalMs: 1000, uidIntervalMs: 1000, maxWaitMs: 600000 },
    pending: 0, granted: 0, timedOut: 0, buckets: [],
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  resetAudit();
  resetEnv();
});

describe('request-audit 窗口计数', () => {
  it('统计各 flow / bypass / 全局请求数', () => {
    recordOutbound(identity('monitor.stock'), 'https://x/a');
    recordOutbound(identity('monitor.stock'), 'https://x/b');
    recordOutbound(identity('manual'), 'https://x/c');
    recordOutbound(undefined, 'https://x/d'); // 无身份：只进全局

    const snap = getAuditSnapshot();
    expect(snap.flows['monitor.stock']).toBe(2);
    expect(snap.flows['manual']).toBe(1);
    expect(snap.bypass['manual']).toBe(1);
    expect(snap.bypass['monitor.stock']).toBeUndefined();
    expect(snap.total).toBe(4);
  });

  it('AUDIT_ENABLED=false 时 record 为空操作', () => {
    process.env.AUDIT_ENABLED = 'false';
    recordOutbound(identity('monitor.stock'), 'https://x/a');
    recordFailure(identity('monitor.stock'), 'https://x/a');
    expect(getAuditSnapshot().total).toBe(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

describe('确定性规则（命中即告警）', () => {
  it('闸门排队超时：一次即告警，冷却期内不重复', () => {
    process.env.AUDIT_COOLDOWN_MS = '600000';
    recordGateTimeout(identity('monitor.stock'));
    recordGateTimeout(identity('monitor.stock')); // 立刻第二次
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(getAuditSnapshot().gateTimeouts).toBe(2);

    // 推进到冷却期外，再触发一次应重新告警
    vi.setSystemTime(Date.now() + 601_000);
    recordGateTimeout(identity('monitor.stock'));
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('bypass 流高频：manual 超过阈值即告警', () => {
    process.env.AUDIT_BYPASS_MANUAL_LIMIT = '2';
    process.env.AUDIT_WINDOW_MS = '60000';
    for (let i = 0; i < 3; i++) {
      recordOutbound(identity('manual'), 'https://x/detail');
      vi.setSystemTime(Date.now() + 1000); // 跨过去重节流间隔
    }
    expect(mocks.sendEmail).toHaveBeenCalled();
    const subject = mocks.sendEmail.mock.calls[0][0].subject as string;
    expect(subject).toContain('bypass');
    expect(subject).toContain('manual');
  });

  it('同接口失败风暴：超过阈值即告警', () => {
    process.env.AUDIT_FAIL_STORM_LIMIT = '3';
    for (let i = 0; i < 4; i++) {
      recordFailure(identity('monitor.stock'), 'https://x/api/fail');
    }
    expect(mocks.sendEmail).toHaveBeenCalled();
    const subject = mocks.sendEmail.mock.calls[0][0].subject as string;
    expect(subject).toContain('失败风暴');
    expect(getAuditSnapshot().failures['/api/fail']).toBe(4);
  });
});

describe('统计性规则（默认仅观测）', () => {
  it('默认 statAlertEnabled=false：突刺只进观测，不发单独告警', () => {
    process.env.AUDIT_SPIKE_MIN_SAMPLES = '5';
    process.env.AUDIT_SPIKE_FACTOR = '4';
    process.env.AUDIT_FAIL_STORM_LIMIT = '100000'; // 关掉确定性规则干扰

    // 过去 9 个窗口保持低基线
    vi.setSystemTime(Date.now() - 9 * 60_000);
    for (let w = 0; w < 9; w++) {
      for (let i = 0; i < 2; i++) recordOutbound(identity('monitor.stock'), 'https://x/a');
      vi.setSystemTime(Date.now() + 60_000);
    }
    // 当前窗口突增
    for (let i = 0; i < 40; i++) recordOutbound(identity('monitor.stock'), 'https://x/a');

    mocks.sendEmail.mockClear(); // 清掉过程中可能触发的告警，只关注摘要判定
    runAuditSummary();
    const snap = getAuditSnapshot();
    expect(snap.observations.some((e) => e.key === 'spike:monitor.stock')).toBe(true);
    // 观测模式下没有「突刺」单独告警（bypass/失败风暴已关闭，闸门超时无）
    const alertSubjects = mocks.sendEmail.mock.calls.map((c) => c[0].subject as string);
    expect(alertSubjects.some((s) => s.includes('流量突刺'))).toBe(false);
  });

  it('statAlertEnabled=true：突刺会发单独告警', () => {
    process.env.AUDIT_STAT_ALERT_ENABLED = 'true';
    process.env.AUDIT_SPIKE_MIN_SAMPLES = '5';
    process.env.AUDIT_SPIKE_FACTOR = '4';
    process.env.AUDIT_FAIL_STORM_LIMIT = '100000';
    process.env.AUDIT_GLOBAL_LIMIT = '100000';

    vi.setSystemTime(Date.now() - 9 * 60_000);
    for (let w = 0; w < 9; w++) {
      for (let i = 0; i < 2; i++) recordOutbound(identity('monitor.price'), 'https://x/p');
      vi.setSystemTime(Date.now() + 60_000);
    }
    for (let i = 0; i < 40; i++) recordOutbound(identity('monitor.price'), 'https://x/p');

    mocks.sendEmail.mockClear();
    runAuditSummary();
    const subjects = mocks.sendEmail.mock.calls.map((c) => c[0].subject as string);
    expect(subjects.some((s) => s.includes('流量突刺'))).toBe(true);
  });
});

describe('发信与健壮性', () => {
  it('未配置 SMTP（ensureConfigured=false）时不发信、不抛错', () => {
    mocks.ensureConfigured.mockReturnValue(false);
    expect(() => recordGateTimeout(identity('monitor.stock'))).not.toThrow();
    expect(() => runAuditSummary()).not.toThrow();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('收件人默认自发自收，可用 AUDIT_ALERT_TO 覆盖', () => {
    process.env.SMTP_USER = 'me@example.com';
    recordGateTimeout(identity('monitor.stock'));
    expect((mocks.sendEmail.mock.calls[0][0] as { to: string }).to).toBe('me@example.com');
  });

  it('AUDIT_ALERT_TO 覆盖收件人', () => {
    process.env.AUDIT_ALERT_TO = 'ops@example.com';
    recordGateTimeout(identity('monitor.stock'));
    expect((mocks.sendEmail.mock.calls[0][0] as { to: string }).to).toBe('ops@example.com');
  });

  it('摘要邮件标题带服务器标签', () => {
    process.env.AUDIT_SERVER_LABEL = 'main';
    process.env.AUDIT_SUMMARY_INTERVAL_MS = '600000';
    recordOutbound(identity('monitor.stock'), 'https://x/a');
    mocks.sendEmail.mockClear();
    runAuditSummary();
    expect(mocks.sendEmail).toHaveBeenCalled();
    const subject = mocks.sendEmail.mock.calls[0][0].subject as string;
    expect(subject).toContain('请求审计摘要');
    expect(subject).toContain('main');
  });
});
