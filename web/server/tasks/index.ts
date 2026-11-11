/**
 * 任务种类汇总
 *
 * 恢复流程、路由声明都从这里取，新增一类监控只需在这里注册一次。
 */

import { priceDefinition, priceTasks } from './price'
import { stockDefinition, stockTasks } from './stock'
import { tabDefinition, tabTasks } from './tab'

export const taskKinds = {
  stock: { definition: stockDefinition, registry: stockTasks },
  tab: { definition: tabDefinition, registry: tabTasks },
  price: { definition: priceDefinition, registry: priceTasks },
} as const

export type TaskKindName = keyof typeof taskKinds

export { stockTasks, tabTasks, priceTasks }
export { stockDefinition, tabDefinition, priceDefinition }
