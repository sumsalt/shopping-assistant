import { listTaskHandler } from '../../tasks/handlers'
import { stockDefinition, stockTasks } from '../../tasks/stock'

export default listTaskHandler(stockDefinition, stockTasks)
