import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const RegistrationController = () =>
  import('#controllers/api/v1/auth/identity/registration_controller')
const SessionController = () => import('#controllers/api/v1/auth/identity/session_controller')
const MeController = () => import('#controllers/api/v1/auth/identity/me_controller')
const PasswordController = () => import('#controllers/api/v1/auth/identity/password_controller')
const MfaController = () => import('#controllers/api/v1/auth/identity/mfa_controller')

/*
 * Auth and self JSON operations (docs/06 §13.3), built from M1 part 2a.
 * Route names are the operationIds (docs/09 §3.3). `signUp`,
 * `confirmEmail`, `requestPasswordReset` and `resetPassword` are open to
 * anyone, signed in or not: the `guest` middleware is kept for the sign-in
 * and sign-up pages and `logIn` (docs/09 §3.4 row 3, T-UI-025), where it
 * answers 409 `CONFLICT`. `logOut`, `getMe`, `resendEmailVerification`,
 * `changePassword`, `revokeAllSessions`, the staff MFA operations
 * (`verifyMfaChallenge`, `startTotpEnrollment`, `confirmTotpEnrollment`,
 * M1 part 5), `updateMe` and `requestAccountDeletion` (M1 part 6a) need a
 * session (`auth`). CSRF applies to every unsafe route here.
 */
router
  .group(() => {
    router.post('/auth/signup', [RegistrationController, 'signUp']).as('signUp')
    router.post('/auth/session', [SessionController, 'logIn']).as('logIn').use(middleware.guest())
    router
      .delete('/auth/session', [SessionController, 'logOut'])
      .as('logOut')
      .use(middleware.auth())
    router
      .post('/auth/mfa/challenge', [MfaController, 'verifyMfaChallenge'])
      .as('verifyMfaChallenge')
      .use(middleware.auth())
    router
      .post('/auth/email-verification', [RegistrationController, 'resendEmailVerification'])
      .as('resendEmailVerification')
      .use(middleware.auth())
    router
      .post('/auth/email-verification/confirm', [RegistrationController, 'confirmEmail'])
      .as('confirmEmail')
    router
      .post('/auth/password-reset', [PasswordController, 'requestPasswordReset'])
      .as('requestPasswordReset')
    router
      .post('/auth/password-reset/confirm', [PasswordController, 'resetPassword'])
      .as('resetPassword')
    router.get('/me', [MeController, 'getMe']).as('getMe').use(middleware.auth())
    router.patch('/me', [MeController, 'updateMe']).as('updateMe').use(middleware.auth())
    router
      .post('/me/deletion-request', [MeController, 'requestAccountDeletion'])
      .as('requestAccountDeletion')
      .use(middleware.auth())
    router
      .post('/me/password', [PasswordController, 'changePassword'])
      .as('changePassword')
      .use(middleware.auth())
    router
      .post('/me/sessions/revoke-all', [SessionController, 'revokeAllSessions'])
      .as('revokeAllSessions')
      .use(middleware.auth())
    router
      .post('/me/mfa/totp', [MfaController, 'startTotpEnrollment'])
      .as('startTotpEnrollment')
      .use(middleware.auth())
    router
      .post('/me/mfa/totp/confirm', [MfaController, 'confirmTotpEnrollment'])
      .as('confirmTotpEnrollment')
      .use(middleware.auth())
  })
  .prefix('/api/v1')
