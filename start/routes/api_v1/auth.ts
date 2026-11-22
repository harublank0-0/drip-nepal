import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const RegistrationController = () =>
  import('#controllers/api/v1/auth/identity/registration_controller')

/*
 * Auth and self JSON operations (docs/06 §13.3), built from M1 part 2a.
 * Route names are the operationIds (docs/09 §3.3). `signUp` and
 * `confirmEmail` are open to anyone, signed in or not: the `guest`
 * middleware is kept for the sign-in, sign-up and reset pages and `logIn`
 * (docs/09 §3.4 row 3, T-UI-025). CSRF applies to every route here.
 */
router
  .group(() => {
    router.post('/auth/signup', [RegistrationController, 'signUp']).as('signUp')
    router
      .post('/auth/email-verification', [RegistrationController, 'resendEmailVerification'])
      .as('resendEmailVerification')
      .use(middleware.auth())
    router
      .post('/auth/email-verification/confirm', [RegistrationController, 'confirmEmail'])
      .as('confirmEmail')
  })
  .prefix('/api/v1')
