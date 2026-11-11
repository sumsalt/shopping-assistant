import { statusTaskHandler } from '../../tasks/handlers'
import { tabDefinition, tabTasks } from '../../tasks/tab'

export default statusTaskHandler(tabDefinition, tabTasks)
