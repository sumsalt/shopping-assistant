import { restartTaskHandler } from '../../tasks/handlers'
import { stockDefinition, stockTasks } from '../../tasks/stock'

export default restartTaskHandler(stockDefinition, stockTasks)
