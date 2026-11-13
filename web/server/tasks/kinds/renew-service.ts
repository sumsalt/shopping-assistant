/**
 * 续期任务的服务实例
 *
 * 单独一个文件，避免 auto-renew → kinds/index → price → auto-renew 的循环依赖。
 */

import { TaskRegistry } from '../engine/registry'
import { TaskService } from '../engine/service'
import { renewDefinition } from './renew'
import type { RenewTaskState } from './state'

export const renewRegistry = new TaskRegistry<RenewTaskState>('renew')
export const renewService = new TaskService(renewDefinition, renewRegistry)
