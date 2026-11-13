import { createTaskHandler } from '../../tasks/engine/handlers'
import { stockService } from '../../tasks/kinds'

export default createTaskHandler(stockService)
