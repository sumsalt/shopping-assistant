import { statusTaskHandler } from '../../tasks/handlers'
import { renewDefinition, renewTasks } from '../../tasks/renew'

export default statusTaskHandler(renewDefinition, renewTasks)
