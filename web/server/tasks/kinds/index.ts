/**
 * 任务种类注册表
 *
 * 新增一类任务只改这里 + 新增一个 definition 文件，路由与引擎不动。
 */

import { TaskRegistry } from '../engine/registry'
import { TaskService } from '../engine/service'
import { priceDefinition } from './price'
import { stockDefinition } from './stock'
import { tabDefinition } from './tab'
import { renewService } from './renew-service'
import type { PriceTaskState, StockTaskState, TabTaskState } from './state'

export { renewService } from './renew-service'

export const priceRegistry = new TaskRegistry<PriceTaskState>('price')
export const priceService = new TaskService(priceDefinition, priceRegistry)

export const stockRegistry = new TaskRegistry<StockTaskState>('stock')
export const stockService = new TaskService(stockDefinition, stockRegistry)

export const tabRegistry = new TaskRegistry<TabTaskState>('tab')
export const tabService = new TaskService(tabDefinition, tabRegistry)

/** 已迁移到新引擎的任务类型；restore 插件按这个数组恢复 */
export const taskServices = [stockService, priceService, tabService, renewService]
