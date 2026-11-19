/**
 * 中央限频策略表
 *
 * 所有「要不要过闸门 / 额外延迟多久 / 缓存多久」的节奏参数集中在这一张表，
 * 回答「哪些请求限流、哪里绕过、哪里额外延迟、缓存多久」只看这里一处。
 *
 * 约定：
 * - gate='normal'：请求经 HTTP 出口时按出口 IP + 账号 UID 两级令牌排队；
 * - gate='bypass'：豁免——下单（抢库存时效）、登录（获取身份的前置步骤）、
 *   手动操作（查看详情/订单是低频用户交互，排队 1 秒体感明显；风控压力来自后台高频流量）。
 * - gapMs / writeGapMs：闸门之外的额外节流，用于写操作密集的写接口（加收藏、订单续期）；
 *   它们是「进一步克制」而非「替代闸门」，与闸门叠加生效。
 * - cacheTtlMs：全量索引类缓存的有效期。
 *
 * 数值全部沿用重构前的历史值，本次重构只收敛定义、不改行为。
 */

import type { GateFlow, GatePolicy } from './request-gate';

/** 单个业务流的完整节奏策略 */
export interface FlowRatePolicy {
  /** 闸门策略：默认 normal，下单 / 登录 / 手动操作 bypass */
  gate: GatePolicy;
  /** 相邻两次请求的额外最小间隔（毫秒）；闸门之外的克制，默认 0 */
  gapMs?: number;
  /** 写操作（reload / add）之间比 gapMs 更长的间隔（毫秒），默认等于 gapMs */
  writeGapMs?: number;
  /** 全量索引缓存有效期（毫秒），仅索引类流使用 */
  cacheTtlMs?: number;
}

/** 所有业务流的节奏策略——唯一的真相来源 */
export const RATE_POLICIES: Record<GateFlow, FlowRatePolicy> = {
  // 后台监控扫描：只走闸门，不叠加额外延迟
  'monitor.stock': { gate: 'normal' },
  'monitor.price': { gate: 'normal' },
  'monitor.tab': { gate: 'normal' },

  // 收藏夹扫描 / 全量索引：走闸门；全量索引缓存 10s（重启时 N 个商品合并成一次翻页）
  'collection.sync': { gate: 'normal' },
  'collection.index': { gate: 'normal', cacheTtlMs: 10_000 },

  // 收藏写入：走闸门 + 全局串行 + 300ms 额外间隔（一手写接口对并发敏感）
  'collection.write': { gate: 'normal', gapMs: 300 },

  // 订单续期：走闸门 + 300ms 读间隔 + 5s 写间隔
  'order.renew': { gate: 'normal', gapMs: 300, writeGapMs: 5_000 },

  // 豁免：下单抢库存（排队即失去意义）、登录（还没有身份可分桶）
  'order.checkout': { gate: 'bypass' },
  'auth.login': { gate: 'bypass' },

  // 手动查看详情 / 订单：低频用户交互，手动点一次排队 1s 体感明显；
  // 风控压力来自后台高频监控，手动流量豁免不会被闸门拖慢。
  manual: { gate: 'bypass' },
};

/** 取某业务流的策略 */
export const getRatePolicy = (flow: GateFlow): FlowRatePolicy => RATE_POLICIES[flow] ?? { gate: 'normal' };

/** 某业务流是否绕过闸门 */
export const isGateBypassed = (flow: GateFlow): boolean => getRatePolicy(flow).gate === 'bypass';

// ==================== 兼容导出：历史常量名改为从策略表派生 ====================
// 保留这些命名导出，避免调用方 / 测试断言硬编码数值；真相只在 RATE_POLICIES。

/** 收藏写入额外间隔（对应 collection.write.gapMs） */
export const COLLECTION_WRITE_GAP_MS = getRatePolicy('collection.write').gapMs ?? 0;
/** 收藏全量索引 TTL（对应 collection.index.cacheTtlMs） */
export const COLLECTION_INDEX_TTL_MS = getRatePolicy('collection.index').cacheTtlMs ?? 10_000;
/** 订单续期读请求间隔 / 写请求间隔 */
export const RENEW_REQUEST_GAP_MS = getRatePolicy('order.renew').gapMs ?? 300;
export const RENEW_WRITE_GAP_MS = getRatePolicy('order.renew').writeGapMs ?? 5_000;
