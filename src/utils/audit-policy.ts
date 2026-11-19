/**
 * 请求审计策略表
 *
 * 与「事前限流」的闸门（rate-policy）互补：这里定义「事后告警」的规则。
 * 目标是发现代码层面的异常——循环失控、重试风暴、flow 归属错误（后台任务误挂 bypass）、
 * 闸门拥堵等，而不是替代闸门限流。告警自发自收（收件人默认=发件账号），仅用于自查。
 *
 * 规则分两层，命中即发告警邮件（自发自收，仅用于自查）：
 * - 确定性规则：命中几乎必然是 bug。
 *   ① 闸门排队超时（任何一次）  ② bypass 流高频  ③ 同接口失败风暴
 * - 统计性规则：相对基线判突变。
 *   ④ 单 flow 增速突刺  ⑤ 全局速率超限
 *
 * 只有「异常」才发邮件；周期性的流量摘要只写日志、不发邮件。
 * 所有开关 / 阈值都可用环境变量覆盖，便于线上不改代码调参。
 */

import type { GateFlow } from './request-gate';

const readInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const readBool = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw !== '0' && raw !== 'false' && raw !== 'no';
};

/** 审计配置（每次读取，环境变量在进程启动时确定） */
export interface AuditPolicy {
  /** 审计总开关，false 时 record 变成空操作、不启动定时器 */
  enabled: boolean;
  /** 告警收件人；留空则在发信时回退到 SMTP_USER（自发自收） */
  alertTo: string;
  /** 服务器标识（如 main / test / IP），写进邮件标题便于区分来源 */
  serverLabel: string;
  /** 统计滑动窗口长度（毫秒），用于「每窗口请求数」计数 */
  windowMs: number;
  /** 同一类告警的冷却时间（毫秒），避免邮件风暴 */
  cooldownMs: number;
  /** 流量摘要的发送间隔（毫秒），0 表示不发摘要 */
  summaryIntervalMs: number;
  /** 统计性规则是否发告警（默认 true；设 false 可退化为只写日志观测） */
  statAlertEnabled: boolean;
  /** 确定性规则阈值 */
  thresholds: AuditThresholds;
}

/** 规则阈值 */
export interface AuditThresholds {
  /** bypass 流每窗口请求数上限：超过即告警。未列出的 bypass flow 用 default */
  bypassPerWindow: Partial<Record<GateFlow, number>> & { default: number };
  /** 同一接口（URL）每窗口失败次数上限 */
  failStormPerWindow: number;
  /** 单 flow 增速突刺：当前窗口 > 过去基线均值 × factor 且当前 > minSamples 才命中 */
  spikeFactor: number;
  spikeMinSamples: number;
  /** 全局速率超限：所有 flow 每窗口总请求数上限 */
  globalPerWindow: number;
}

/**
 * 读取审计策略。
 *
 * 默认值取向「宁可漏报、不可误报」：bypass 阈值放大到正常手动操作难以触及的量级，
 * 失败风暴要求短时间同接口连续失败，统计性规则默认只观测。
 */
export const getAuditPolicy = (): AuditPolicy => ({
  enabled: readBool('AUDIT_ENABLED', true),
  alertTo: (process.env.AUDIT_ALERT_TO || '').trim(),
  serverLabel: (process.env.AUDIT_SERVER_LABEL || '').trim(),
  windowMs: readInt('AUDIT_WINDOW_MS', 60_000),
  cooldownMs: readInt('AUDIT_COOLDOWN_MS', 10 * 60_000),
  summaryIntervalMs: readInt('AUDIT_SUMMARY_INTERVAL_MS', 10 * 60_000),
  statAlertEnabled: readBool('AUDIT_STAT_ALERT_ENABLED', true),
  thresholds: {
    bypassPerWindow: {
      // 手动查看详情/订单：用户狂点也很难 1 分钟 300 次；后台误挂 manual 会瞬间超过
      manual: readInt('AUDIT_BYPASS_MANUAL_LIMIT', 300),
      // 下单/登录是极低频事件，短时间高频几乎必然是循环 bug
      'order.checkout': readInt('AUDIT_BYPASS_ORDER_LIMIT', 40),
      'auth.login': readInt('AUDIT_BYPASS_LOGIN_LIMIT', 40),
      default: readInt('AUDIT_BYPASS_DEFAULT_LIMIT', 60),
    },
    failStormPerWindow: readInt('AUDIT_FAIL_STORM_LIMIT', 30),
    // 突刺：当前窗口 > 过去 9 个窗口均值 × 4，且当前 > 50 次
    spikeFactor: readInt('AUDIT_SPIKE_FACTOR', 4),
    spikeMinSamples: readInt('AUDIT_SPIKE_MIN_SAMPLES', 50),
    globalPerWindow: readInt('AUDIT_GLOBAL_LIMIT', 3_000),
  },
});
