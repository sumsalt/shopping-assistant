import { restartTaskHandler } from '../../tasks/engine/handlers'
import { stockService } from '../../tasks/kinds'

export default restartTaskHandler(stockService)
