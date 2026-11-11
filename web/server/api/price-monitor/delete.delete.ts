import { deleteTaskHandler } from '../../tasks/handlers'
import { priceDefinition, priceTasks } from '../../tasks/price'

export default deleteTaskHandler(priceDefinition, priceTasks)
