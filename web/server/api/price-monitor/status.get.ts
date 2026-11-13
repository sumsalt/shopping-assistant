import { statusTaskHandler } from '../../tasks/engine/handlers'
import { priceService } from '../../tasks/kinds'

export default statusTaskHandler(priceService)
