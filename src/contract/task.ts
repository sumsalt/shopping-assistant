/**
 * 任务的共享契约
 *
 * 任务在服务端只有一种对外形状：TaskSummary。
 * 列表与详情都用 project() 产出同一份结构，前端只按这份结构渲染，
 * 不允许再手写一份 DTO。
 */

import type { AutoOrderView, OrderBrief } from './order'
import type { TaskTarget } from './platform'

/** 任务种类 */
export type TaskKind = 'stock' | 'price' | 'tab' | 'renew'

/** 任务状态 */
export type TaskStatus = 'running' | 'stopped' | 'completed'

/** 语义色：价格涨 red / 跌 green，符合国内习惯 */
export type Tone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'up'
  | 'down'

/** 卡片上的小标签：自动下单、限定规格、逐轮对比…… */
export interface TaskBadge {
  text: string
  tone: Tone
}

/** 卡片上的统计胶囊 */
export interface TaskStat {
  key: string
  label: string
  value: string | number
  tone?: Tone
}

/** 任务事件的统一类型 */
export type TaskEventType =
  | 'price.changed'
  | 'coupon.changed'
  | 'stock.arrived'
  | 'stock.sku_waiting'
  | 'tab.new_items'
  | 'order.created'
  | 'order.failed'
  | 'renew.succeeded'
  | 'renew.finished'
  | 'error'

/**
 * 任务事件
 *
 * 所有「历史记录」都收敛成这一种结构：价格变化、优惠券变化、到货、新商品、
 * 下单成功/失败、续期成功/结束。前端只有一个事件列表组件。
 */
export interface TaskEvent {
  id: string
  type: TaskEventType
  /** 发生时间（毫秒时间戳） */
  at: number
  title: string
  detail?: string
  tone: Tone
  /** 邮件是否发送成功；未发邮件为 undefined */
  emailSent?: boolean
  orderSn?: string
  amount?: number
  /** 价格变化 */
  previousPrice?: number
  currentPrice?: number
  delta?: number
  deltaPercent?: number
  direction?: 'up' | 'down'
  /** 优惠券变化 */
  added?: Array<{ kind: string; label: string }>
  removed?: Array<{ kind: string; label: string }>
  /** Tab 新商品 */
  count?: number
  items?: Array<{ productId: string; productName: string; price?: number; productNo?: string }>
  /** 续期 */
  remainingBefore?: number
  expireAfter?: number
  verified?: boolean
}

/** 需要单独强调的提示（不进入事件流） */
export interface TaskNotice {
  type: 'sku_waiting' | 'no_stock' | 'order_failed' | 'uncertain'
  title: string
  detail?: string
  tone: Tone
}

/** 任务配置的只读投影 */
export interface TaskConfigView {
  /** 检测间隔（秒） */
  interval?: number
  /** 持续时长（秒） */
  duration?: number
  /** 价格通知条件 */
  notifyOn?: 'any' | 'drop' | 'rise'
  /** 最小变动金额 */
  minPriceDelta?: number
  /** 限定规格（到货任务） */
  skus?: string[] | null
  /** 自动下单配置 */
  autoOrder?: AutoOrderView | null
  /** Tab 生效时段 */
  activeWindow?: { start: string; end: string } | null
  /** Tab 模式 */
  mode?: 'accumulate' | 'diff'
  /** 续期任务来源 */
  source?: 'manual' | 'auto'
}

/**
 * 任务列表/详情统一视图
 */
export interface TaskSummary {
  id: string
  kind: TaskKind
  status: TaskStatus
  /** ISO 时间字符串 */
  createdAt: string
  updatedAt?: string
  target: TaskTarget
  badges: TaskBadge[]
  stats: TaskStat[]
  config: TaskConfigView
  /** 最近事件（列表默认 5 条，详情返回全部） */
  events: TaskEvent[]
  order?: OrderBrief | null
  notice?: TaskNotice | null
  lastError?: string
}

/** 列表接口响应体 */
export interface TaskListPayload {
  tasks: TaskSummary[]
  total: number
}

/** 创建/重启接口响应体 */
export interface TaskCreatedPayload {
  taskId: string
  task: TaskSummary
  message: string
}

/** 详情接口响应体 */
export interface TaskDetailPayload {
  task: TaskSummary
}

/** 事件类型 → 中文标签（前端与邮件共用） */
export const TASK_EVENT_LABELS: Record<TaskEventType, string> = {
  'price.changed': '价格变化',
  'coupon.changed': '优惠券变化',
  'stock.arrived': '到货',
  'stock.sku_waiting': '等待规格',
  'tab.new_items': '新商品',
  'order.created': '已下单',
  'order.failed': '下单失败',
  'renew.succeeded': '已续期',
  'renew.finished': '已结束',
  error: '异常',
}
