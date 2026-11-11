import { restartTaskHandler } from '../../tasks/handlers'
import { tabDefinition, tabTasks } from '../../tasks/tab'

export default restartTaskHandler(tabDefinition, tabTasks)
