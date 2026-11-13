/**
 * 任务接口地址表
 *
 * 四类任务的路由形状完全一致（list / status / delete / restart），
 * 只有前缀不同。把「kind → 前缀」固定在这一处，页面从这里取，
 * 避免每个页面各写一份字符串。
 */

import type { TaskKind } from '@core/contract'

export const TASK_ENDPOINTS: Record<TaskKind, string> = {
  stock: '/api/monitor',
  price: '/api/price-monitor',
  tab: '/api/tab-monitor',
  renew: '/api/order-renew',
}

export const taskEndpoint = (kind: TaskKind): string => TASK_ENDPOINTS[kind]
