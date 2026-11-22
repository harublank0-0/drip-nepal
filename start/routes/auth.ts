import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const RegistrationController = () => import('#controllers/auth/identity/registration_controller')
const SessionController = () => import('#controllers/auth/identity/session_controller')

/*
 * Auth pages (docs/08 §2.3), GET only (ADR-0004 decision 6), server-rendered
 * (config/inertia.ts). `/login` and `/signup` are for guests (02 J-04
 * "Permissions"; `guest` is allowed on the sign-in, sign-up and reset pages
 * only, T-UI-025; it sends a signed-in user to `/`, the interim home page
 * until M4's, and 02 J-04 asks for `/account`, M1 part 6); `/verify-email` opens signed in or not, because the emailed link
 * may be opened on any device. `/forgot-password`, `/reset-password` and
 * `/mfa` join with M1 parts 4 and 5 (docs/12 §5.1).
 */
router.get('/login', [SessionController, 'logIn']).as('login').use(middleware.guest())
router.get('/signup', [RegistrationController, 'signUp']).as('signup').use(middleware.guest())
router.get('/verify-email', [RegistrationController, 'verifyEmail']).as('verify_email')
