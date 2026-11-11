import { statusTaskHandler } from '../../tasks/handlers'
import { stockDefinition, stockTasks } from '../../tasks/stock'

export default statusTaskHandler(stockDefinition, stockTasks)
