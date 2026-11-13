import { statusTaskHandler } from '../../tasks/engine/handlers'
import { stockService } from '../../tasks/kinds'

export default statusTaskHandler(stockService)
