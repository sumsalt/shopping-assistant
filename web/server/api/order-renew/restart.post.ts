import { restartTaskHandler } from '../../tasks/handlers'
import { renewDefinition, renewTasks } from '../../tasks/renew'

export default restartTaskHandler(renewDefinition, renewTasks)
