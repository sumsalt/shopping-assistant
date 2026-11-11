import { deleteTaskHandler } from '../../tasks/handlers'
import { stockDefinition, stockTasks } from '../../tasks/stock'

export default deleteTaskHandler(stockDefinition, stockTasks)
