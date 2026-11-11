import { restartTaskHandler } from '../../tasks/handlers'
import { priceDefinition, priceTasks } from '../../tasks/price'

export default restartTaskHandler(priceDefinition, priceTasks)
