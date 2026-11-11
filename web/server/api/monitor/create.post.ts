import { createTaskHandler } from '../../tasks/handlers'
import { stockDefinition, stockTasks } from '../../tasks/stock'

export default createTaskHandler(stockDefinition, stockTasks)
