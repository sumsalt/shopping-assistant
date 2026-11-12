import { deleteTaskHandler } from '../../tasks/handlers'
import { renewDefinition, renewTasks } from '../../tasks/renew'

export default deleteTaskHandler(renewDefinition, renewTasks)
