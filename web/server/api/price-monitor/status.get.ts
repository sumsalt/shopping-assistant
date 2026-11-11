import { statusTaskHandler } from '../../tasks/handlers'
import { priceDefinition, priceTasks } from '../../tasks/price'

export default statusTaskHandler(priceDefinition, priceTasks)
