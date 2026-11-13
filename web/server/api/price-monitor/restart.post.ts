import { restartTaskHandler } from '../../tasks/engine/handlers'
import { priceService } from '../../tasks/kinds'

export default restartTaskHandler(priceService)
