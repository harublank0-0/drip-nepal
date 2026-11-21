import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const CourierCallbacksController = () =>
  import('#controllers/webhooks/courier_callbacks_controller')

/*
 * Webhooks (docs/06 §12): no session user, CSRF-exempt by their exact route
 * pattern (config/shield.ts). The courier callback receiver of §12.6 (M6)
 * runs `webhook_ip` and the 64 KB cap before its controller.
 */
export const COURIER_CALLBACK_PATTERN = '/api/v1/webhooks/couriers/:providerCode/:accountId'

router
  .post(COURIER_CALLBACK_PATTERN, [CourierCallbacksController, 'receive'])
  .as('receiveCourierCallback')
  .where('providerCode', /^[a-z][a-z0-9_]{1,31}$/)
  .use(middleware.courierCallbackBody())
