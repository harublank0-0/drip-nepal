import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const UserRegistrationController = () => import('#modules/auth/controllers/registration_controller')

const UserSessionController = () => import('#modules/auth/controllers/session_controller')

router
  .group(() => {
    router.get('signup', [UserRegistrationController, 'create'])

    router.get('login', [UserSessionController, 'create'])
  })
  .as('ui.auth')
  .prefix('auth')
  .use(middleware.guest())

router
  .group(() => {
    router.post('signup', [UserRegistrationController, 'store'])

    router.post('login', [UserSessionController, 'store'])
  })
  .as('api.auth')
  .prefix('api/v1')
  .use(middleware.guest())

router
  .post('logout', [UserSessionController, 'destroy'])
  .as('api.auth.logout')
  .prefix('api/v1')
  .use(middleware.auth())
