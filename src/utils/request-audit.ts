/**
 * 请求审计（事后告警）
 *
 * 与「事前限流」的闸门互补：闸门让异常请求排队变慢但不产生信号，审计专门发现
 * 代码层面的异常——循环失控、重试风暴、flow 归属错误（后台任务误挂 bypass）、
 * 闸门拥堵等。所有 record 调用都是同步、非阻塞、异常吞掉，绝不影响请求本身。
 *
 * 规则分两层（定义见 audit-policy.ts）：
 * - 确定性规则（每次请求判定，命中即告警）：闸门超时 / bypass 高频 / 同接口失败风暴
 * - 统计性规则（只在摘要定时器里判定，默认仅观测）：单 flow 增速突刺 / 全局速率超限
 *
 * 告警自发自收：收件人默认取 SMTP_USER（AUDIT_ALERT_TO 可覆盖）。
 * 未配置 SMTP_PASS 时优雅跳过，不改变任何业务行为。
 */

import { getAuditPolicy, type AuditPolicy } from './audit-policy';
import { getGateStats, type GateIdentity, type GateFlow } from './request-gate';
import { isGateBypassed } from './rate-policy';
import { ensureEmailServiceConfigured, sendEmail } from '../email';

/** 一条命中记录 */
export interface AuditEvent {
  /** 去重键（规则:维度），如 bypass:manual / fail:/api/foo / gate_timeout */
  key: string;
  /** 规则标题 */
  title: string;
  /** 详情（次数、阈值、时间等） */
  detail: string;
  /** 是否发邮件（统计性规则在观测模式下为 false） */
  email: boolean;
}

/** 审计快照（供摘要邮件与 /api/gate/stats 排障） */
export interface AuditSnapshot {
  enabled: boolean;
  /** 各 flow 最近窗口请求数 */
  flows: Record<string, number>;
  /** 各 bypass flow 最近窗口请求数 */
  bypass: Record<string, number>;
  /** 失败最多的接口（pathname -> 次数） */
  failures: Record<string, number>;
  /** 最近窗口闸门超时次数 */
  gateTimeouts: number;
  /** 最近窗口全局请求数 */
  total: number;
  /** 本次摘要判定的统计性观测（含未发邮件的） */
  observations: AuditEvent[];
}

/** 时间戳滑动窗口：只保留最近 historyMs 的事件时间 */
class EventWindow {
  private stamps: number[] = [];

  constructor(private readonly historyMs: number) {}

  add(now: number): void {
    this.stamps.push(now);
  }

  /** 裁剪过期时间戳（惰性调用，避免热路径每次 O(n)） */
  prune(now: number): void {
    const cutoff = now - this.historyMs;
    let i = 0;
    while (i < this.stamps.length && this.stamps[i] < cutoff) i++;
    if (i > 0) this.stamps.splice(0, i);
  }

  /** 最近 sinceMs 内的事件数 */
  countSince(now: number, sinceMs: number): number {
    const cutoff = now - sinceMs;
    let n = 0;
    for (let i = this.stamps.length - 1; i >= 0; i--) {
      if (this.stamps[i] < cutoff) break;
      n++;
    }
    return n;
  }

  /** 过去 windows 个窗口（不含最近一个）的平均事件数 */
  previousAverage(now: number, windowMs: number, windows: number): number {
    let sum = 0;
    for (let w = 1; w <= windows; w++) {
      const end = now - (w - 1) * windowMs;
      const start = end - windowMs;
      let n = 0;
      for (const t of this.stamps) {
        if (t >= start && t < end) n++;
      }
      sum += n;
    }
    return sum / windows;
  }
}

const windows = new Map<string, EventWindow>();
const lastAlertAt = new Map<string, number>();
let reporterTimer: ReturnType<typeof setInterval> | null = null;
let observations: AuditEvent[] = [];

const getWindow = (key: string, historyMs: number): EventWindow => {
  let w = windows.get(key);
  if (!w) {
    w = new EventWindow(historyMs);
    windows.set(key, w);
  }
  return w;
};

/** 从 URL 取 pathname 作为接口标识；解析失败时回退到原始串 */
const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
};

/** 是否需要发信（未配 SMTP_PASS 时静默跳过） */
const canSend = (): boolean => {
  try {
    return ensureEmailServiceConfigured();
  } catch {
    return false;
  }
};

/** 告警收件人：优先 AUDIT_ALERT_TO，否则自发自收（SMTP_USER） */
const recipientOf = (policy: AuditPolicy): string =>
  policy.alertTo || process.env.SMTP_USER?.trim() || 'sumsalt@qq.com';

/** 异步发信，异常吞掉 */
const deliver = (policy: AuditPolicy, subject: string, text: string): void => {
  if (!policy.enabled || !canSend()) return;
  try {
    void sendEmail({ to: recipientOf(policy), subject, text })
      .then((result) => {
        if (!result.success) {
          console.warn(`[审计] 告警邮件发送失败: ${result.error}`);
        }
      })
      .catch(() => {
        // 发信失败绝不影响业务
      });
  } catch {
    // 同步异常也吞掉
  }
};

const labelOf = (policy: AuditPolicy): string => policy.serverLabel || 'default';

/** 判定是否需要告警（冷却去重），返回事件列表 */
const decide = (
  policy: AuditPolicy,
  candidates: Omit<AuditEvent, 'email'>[],
  now: number
): AuditEvent[] => {
  const out: AuditEvent[] = [];
  for (const c of candidates) {
    const last = lastAlertAt.get(c.key) ?? 0;
    if (now - last < policy.cooldownMs) continue;
    lastAlertAt.set(c.key, now);
    out.push({ ...c, email: true });
  }
  return out;
};

/** 发送一条告警邮件 */
const alertMail = (policy: AuditPolicy, event: AuditEvent, now: number): void => {
  const time = new Date(now).toISOString();
  const subject = `[请求审计][${labelOf(policy)}] ${event.title}`;
  const gate = getGateStats();
  const text = [
    `服务器: ${labelOf(policy)}`,
    `触发时间: ${time}`,
    `规则: ${event.key}`,
    '',
    event.detail,
    '',
    '--- 闸门快照 ---',
    `排队中: ${gate.pending}  累计放行: ${gate.granted}  排队超时: ${gate.timedOut}`,
    `IP 间隔: ${gate.options.ipIntervalMs}ms  UID 间隔: ${gate.options.uidIntervalMs}ms`,
    '',
    '（本邮件由请求审计自动发出，自发自收，用于发现代码问题）',
  ].join('\n');
  deliver(policy, subject, text);
};

// ==================== 确定性规则（请求热路径） ====================

/**
 * 记录一次正常发出的请求。同步、非阻塞。
 * @param identity 闸门身份（无身份的非平台请求只计入全局）
 * @param url 请求 URL（仅用于失败归类，这里不记录 path 以省内存）
 */
export const recordOutbound = (identity: GateIdentity | undefined, url: string): void => {
  const policy = getAuditPolicy();
  if (!policy.enabled) return;
  const now = Date.now();
  const history = policy.windowMs * 10;

  getWindow('global', history).add(now);
  if (identity) {
    getWindow(`flow:${identity.flow}`, history).add(now);
    if (isGateBypassed(identity.flow)) {
      getWindow(`bypass:${identity.flow}`, history).add(now);
    }
  }

  // 确定性判定：闸门超时 + bypass 高频 + 失败风暴。每隔一段才判定一次，减轻热路径负担。
  if (now - (lastDeterministicAt ?? 0) >= Math.min(1_000, policy.windowMs)) {
    lastDeterministicAt = now;
    evaluateDeterministic(policy, now);
  }
  void url; // url 仅 recordFailure 使用，保留参数以统一签名
};

/** 记录一次失败请求（网络 / API 错误） */
export const recordFailure = (identity: GateIdentity | undefined, url: string): void => {
  const policy = getAuditPolicy();
  if (!policy.enabled) return;
  const now = Date.now();
  const history = policy.windowMs * 10;
  getWindow(`fail:${pathOf(url)}`, history).add(now);
  evaluateDeterministic(policy, now);
};

/** 记录一次闸门排队超时 */
export const recordGateTimeout = (identity: GateIdentity | undefined): void => {
  const policy = getAuditPolicy();
  if (!policy.enabled) return;
  const now = Date.now();
  getWindow('gate_timeout', policy.windowMs * 10).add(now);
  evaluateDeterministic(policy, now);
  void identity;
};

let lastDeterministicAt: number | undefined;

/** 确定性规则判定并发告警（轻量，遍历维度很少） */
const evaluateDeterministic = (policy: AuditPolicy, now: number): void => {
  const { windowMs, thresholds } = policy;
  const candidates: Omit<AuditEvent, 'email'>[] = [];

  // ① 闸门排队超时：最近窗口出现任意一次即告警
  const timeouts = getWindow('gate_timeout', windowMs * 10).countSince(now, windowMs);
  if (timeouts >= 1) {
    candidates.push({
      key: 'gate_timeout',
      title: '闸门排队超时',
      detail: `最近 ${windowMs / 1000}s 内有 ${timeouts} 次请求排队超时（maxWait 已满，请求被丢弃）。通常是请求生产速度远超闸门消费速度，或某任务循环失控。`,
    });
  }

  // ② bypass 流高频：后台任务误挂 bypass 会瞬间突破
  for (const [flow, configured] of Object.entries(thresholds.bypassPerWindow)) {
    const limit = configured ?? thresholds.bypassPerWindow.default;
    const count = getWindow(`bypass:${flow}`, windowMs * 10).countSince(now, windowMs);
    if (count > limit) {
      candidates.push({
        key: `bypass:${flow}`,
        title: `bypass 流高频: ${flow}`,
        detail: `最近 ${windowMs / 1000}s 内 bypass 请求 ${count} 次，超过阈值 ${limit}。bypass 仅用于下单/登录/手动操作，高频通常意味着某后台任务误用了 bypass flow。`,
      });
    }
  }

  // ③ 同接口失败风暴
  for (const [key, w] of windows) {
    if (!key.startsWith('fail:')) continue;
    const count = w.countSince(now, windowMs);
    if (count > thresholds.failStormPerWindow) {
      candidates.push({
        key,
        title: `接口失败风暴: ${key.slice(5)}`,
        detail: `最近 ${windowMs / 1000}s 内接口 ${key.slice(5)} 失败 ${count} 次，超过阈值 ${thresholds.failStormPerWindow}。通常是接口变更、凭证失效或重试循环失控。`,
      });
    }
  }

  if (candidates.length === 0) return;
  for (const event of decide(policy, candidates, now)) {
    alertMail(policy, event, now);
  }
};

// ==================== 统计性规则（摘要定时器） ====================

/** 统计性规则判定，返回观测事件（是否发信由 statAlertEnabled 决定） */
const evaluateStatistical = (policy: AuditPolicy, now: number): AuditEvent[] => {
  const { windowMs, thresholds } = policy;
  const out: AuditEvent[] = [];

  // ④ 单 flow 增速突刺
  for (const [key, w] of windows) {
    if (!key.startsWith('flow:')) continue;
    const flow = key.slice(5) as GateFlow;
    const current = w.countSince(now, windowMs);
    if (current < thresholds.spikeMinSamples) continue;
    const baseline = w.previousAverage(now, windowMs, 9);
    // 基线极低时跳过（避免从 0 起步的冷启动误报）
    if (baseline < 1) continue;
    if (current > baseline * thresholds.spikeFactor) {
      out.push({
        key: `spike:${flow}`,
        title: `流量突刺: ${flow}`,
        detail: `最近 ${windowMs / 1000}s 请求 ${current} 次，过去 9 个窗口均值 ${baseline.toFixed(1)} 次，放大 ${(current / baseline).toFixed(1)}×（阈值 ${thresholds.spikeFactor}×）。`,
        email: false,
      });
    }
  }

  // ⑤ 全局速率超限
  const total = getWindow('global', windowMs * 10).countSince(now, windowMs);
  if (total > thresholds.globalPerWindow) {
    out.push({
      key: 'global',
      title: '全局请求速率超限',
      detail: `最近 ${windowMs / 1000}s 全流请求 ${total} 次，超过阈值 ${thresholds.globalPerWindow}。`,
      email: false,
    });
  }

  return out;
};

/** 当前审计快照 */
export const getAuditSnapshot = (): AuditSnapshot => {
  const policy = getAuditPolicy();
  const now = Date.now();
  const { windowMs } = policy;
  const flows: Record<string, number> = {};
  const bypass: Record<string, number> = {};
  const failures: Record<string, number> = {};
  let gateTimeouts = 0;

  for (const [key, w] of windows) {
    if (key.startsWith('flow:')) flows[key.slice(5)] = w.countSince(now, windowMs);
    else if (key.startsWith('bypass:')) bypass[key.slice(7)] = w.countSince(now, windowMs);
    else if (key.startsWith('fail:')) failures[key.slice(5)] = w.countSince(now, windowMs);
    else if (key === 'gate_timeout') gateTimeouts = w.countSince(now, windowMs);
  }

  const failureEntries = Object.entries(failures).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    enabled: policy.enabled,
    flows,
    bypass,
    failures: Object.fromEntries(failureEntries),
    gateTimeouts,
    total: getWindow('global', windowMs * 10).countSince(now, windowMs),
    observations: observations.slice(),
  };
};

/** 手动触发一次流量摘要（同时判定统计性规则）；定时器也调用它 */
export const runAuditSummary = (): void => {
  const policy = getAuditPolicy();
  if (!policy.enabled || policy.summaryIntervalMs <= 0) return;
  const now = Date.now();
  for (const w of windows.values()) w.prune(now);

  const stats = evaluateStatistical(policy, now);
  observations = stats;

  if (policy.statAlertEnabled) {
    for (const event of decide(policy, stats, now)) {
      alertMail(policy, event, now);
    }
  }

  if (!canSend()) return;
  const snap = getAuditSnapshot();
  const gate = getGateStats();
  const fmt = (obj: Record<string, number>): string =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `    ${k}: ${v}`).join('\n') || '    （无）';
  const text = [
    `服务器: ${labelOf(policy)}`,
    `统计窗口: ${policy.windowMs / 1000}s  生成时间: ${new Date(now).toISOString()}`,
    '',
    `最近窗口请求总数: ${snap.total}`,
    `闸门超时: ${snap.gateTimeouts}  排队中: ${gate.pending}  累计超时: ${gate.timedOut}`,
    '',
    '--- 各业务流请求数 ---',
    fmt(snap.flows),
    '',
    '--- bypass 流请求数（正常应极低）---',
    fmt(snap.bypass),
    '',
    '--- 失败最多的接口 ---',
    fmt(snap.failures),
    '',
    '--- 统计性观测 ---',
    stats.length ? stats.map((e) => `    [${e.key}] ${e.detail}`).join('\n') : '    无异常',
    '',
    `提示: 统计性规则当前${policy.statAlertEnabled ? '会' : '不会'}单独发告警邮件（AUDIT_STAT_ALERT_ENABLED=${policy.statAlertEnabled}）`,
    '（本邮件由请求审计自动发出，自发自收，用于发现代码问题）',
  ].join('\n');

  deliver(policy, `[请求审计摘要][${labelOf(policy)}] 流量与异常观测`, text);
};

/** 启动摘要定时器（幂等，unref 不阻止进程退出） */
export const startAuditReporter = (): void => {
  const policy = getAuditPolicy();
  if (!policy.enabled || reporterTimer) return;
  if (policy.summaryIntervalMs <= 0) return;
  reporterTimer = setInterval(() => {
    try {
      runAuditSummary();
    } catch {
      // 摘要失败不影响业务
    }
  }, policy.summaryIntervalMs);
  reporterTimer.unref?.();
};

/** 停止摘要定时器（测试用） */
export const stopAuditReporter = (): void => {
  if (reporterTimer) {
    clearInterval(reporterTimer);
    reporterTimer = null;
  }
};

/** 清空审计状态（测试用） */
export const resetAudit = (): void => {
  stopAuditReporter();
  windows.clear();
  lastAlertAt.clear();
  observations = [];
  lastDeterministicAt = undefined;
};
