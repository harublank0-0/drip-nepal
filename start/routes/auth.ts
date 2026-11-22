import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const RegistrationController = () => import('#controllers/auth/identity/registration_controller')

/*
 * Auth pages (docs/08 §2.3), GET only (ADR-0004 decision 6), server-rendered
 * (config/inertia.ts). `/signup` is for guests (02 J-04 "Permissions";
 * `guest` is allowed on the sign-in, sign-up and reset pages only, T-UI-025);
 * `/verify-email` opens signed in or not, because the emailed link may be
 * opened on any device. `/login`, `/forgot-password`, `/reset-password` and
 * `/mfa` join with M1 parts 3 to 5 (docs/12 §5.1).
 */
router.get('/signup', [RegistrationController, 'signUp']).as('signup').use(middleware.guest())
router.get('/verify-email', [RegistrationController, 'verifyEmail']).as('verify_email')
