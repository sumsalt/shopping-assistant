import { createTaskHandler } from '../../tasks/handlers'
import { priceDefinition, priceTasks } from '../../tasks/price'

export default createTaskHandler(priceDefinition, priceTasks)
