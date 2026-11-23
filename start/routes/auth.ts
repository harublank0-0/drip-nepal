import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const RegistrationController = () => import('#controllers/auth/identity/registration_controller')
const SessionController = () => import('#controllers/auth/identity/session_controller')
const PasswordResetController = () => import('#controllers/auth/identity/password_reset_controller')
const MfaController = () => import('#controllers/auth/identity/mfa_controller')

/*
 * Auth pages (docs/08 §2.3), GET only (ADR-0004 decision 6), server-rendered
 * (config/inertia.ts). `/login` and `/signup` are for guests (02 J-04
 * "Permissions"; `guest` is allowed on the sign-in, sign-up and reset pages
 * only, T-UI-025; it sends a signed-in user to `/account`, since M1 part
 * 6a); `/verify-email`,
 * `/forgot-password` and `/reset-password` open signed in or not, because
 * the emailed link may be opened on any device (M1 part 4,
 * password_reset_controller.ts). `/mfa` (M1 part 5) opens signed in or not
 * too: the enrolment email links it with a token, and a guest signs in on
 * the page itself (mfa_controller.ts).
 */
router.get('/login', [SessionController, 'logIn']).as('login').use(middleware.guest())
router.get('/signup', [RegistrationController, 'signUp']).as('signup').use(middleware.guest())
router.get('/verify-email', [RegistrationController, 'verifyEmail']).as('verify_email')
router.get('/forgot-password', [PasswordResetController, 'forgotPassword']).as('forgot_password')
router.get('/reset-password', [PasswordResetController, 'resetPassword']).as('reset_password')
router.get('/mfa', [MfaController, 'show']).as('mfa')
