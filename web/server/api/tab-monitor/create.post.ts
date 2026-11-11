import { createTaskHandler } from '../../tasks/handlers'
import { tabDefinition, tabTasks } from '../../tasks/tab'

export default createTaskHandler(tabDefinition, tabTasks)
