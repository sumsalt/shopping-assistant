import { listTaskHandler } from '../../tasks/handlers'
import { renewDefinition, renewTasks } from '../../tasks/renew'

export default listTaskHandler(renewDefinition, renewTasks)
