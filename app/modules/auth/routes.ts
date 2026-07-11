import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const RegistrationController = () => import('#modules/auth/controllers/registration_controller')

const SessionController = () => import('#modules/auth/controllers/session_controller')

router
  .group(() => {
    router.get('signup', [RegistrationController, 'create'])

    router.get('login', [SessionController, 'create'])
  })
  .as('ui.auth')
  .prefix('auth')
  .use(middleware.guest())

router
  .group(() => {
    router.post('signup', [RegistrationController, 'store'])

    router.post('login', [SessionController, 'store'])
  })
  .as('api.auth')
  .prefix('api/v1')
  .use(middleware.guest())

router
  .post('logout', [SessionController, 'destroy'])
  .as('api.auth.logout')
  .prefix('api/v1')
  .use(middleware.auth())
