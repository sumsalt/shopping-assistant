import { createTaskHandler } from '../../tasks/engine/handlers'
import { priceService } from '../../tasks/kinds'

export default createTaskHandler(priceService)
