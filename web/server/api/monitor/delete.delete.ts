import { deleteTaskHandler } from '../../tasks/engine/handlers'
import { stockService } from '../../tasks/kinds'

export default deleteTaskHandler(stockService)
