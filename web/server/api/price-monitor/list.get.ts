import { listTaskHandler } from '../../tasks/handlers'
import { priceDefinition, priceTasks } from '../../tasks/price'

export default listTaskHandler(priceDefinition, priceTasks)
