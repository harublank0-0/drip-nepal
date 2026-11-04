import { Link, Form } from '@adonisjs/inertia/react'
import { usePage } from '@inertiajs/react'
import { LucideLogIn } from 'lucide-react'
import { motion } from 'framer-motion'
import { SplitLayout } from '~/components/auth/split_layout'
import { BrandingPanel } from '~/components/auth/branding_panel'
import { PasswordInput } from '~/components/auth/password_input'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { Label } from '~/components/ui/label'
import { Field, FieldError, FieldLabel } from '~/components/ui/field'
import { useSupport } from '~/components/support/contact_options'

/*
 * There is no email reset yet, so a forgotten password goes to the store's
 * WhatsApp or email (SUPPORT_PHONE / SUPPORT_EMAIL). Hidden when neither
 * is set.
 */
function ForgotPassword() {
  const support = useSupport()
  const message = 'Hi, I forgot my Drip Nepal password. My account email is '
  const href = support.whatsapp
    ? `${support.whatsapp}?text=${encodeURIComponent(message)}`
    : support.email
      ? `mailto:${support.email}?subject=${encodeURIComponent('Forgot my password')}`
      : null
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline transition-colors"
    >
      Forgot password?
    </a>
  )
}

export default function Login() {
  const { props } = usePage()
  const serverError = (props as { error?: string }).error

  return (
    <SplitLayout
      left={
        <BrandingPanel
          heading={
            <>
              Welcome back{' '}
              <span className="inline-block" aria-label="waving hand" role="img">
                👋
              </span>
            </>
          }
          subheading="Log in to see your orders and check out faster with your saved addresses."
          benefits={[
            'All your orders in one place',
            'Check out faster with saved addresses',
            'Pay cash when your order arrives',
          ]}
        />
      }
      right={
        <div className="flex w-full items-center justify-center px-5 pt-8 pb-12 sm:py-12 lg:px-8 lg:py-16">
          <motion.div
            className="w-full max-w-115 sm:rounded-3xl sm:border sm:border-border/50 sm:bg-card sm:p-10 sm:shadow-xl"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="mb-6 sm:mb-8 sm:text-center">
              <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-2xl">Log in</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Welcome back. Log in to use your saved addresses and see your orders.
              </p>
            </div>

            <Form route="api.auth.user_session.store">
              {({ errors, processing }) => (
                <div className="flex flex-col gap-4">
                  <Field>
                    <FieldLabel>Email</FieldLabel>
                    <Input
                      className="h-11"
                      name="email"
                      placeholder="you@example.com"
                      type="email"
                      required
                      autoFocus
                      autoComplete="email"
                    />
                    {errors.email && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <FieldError>{errors.email}</FieldError>
                      </motion.div>
                    )}
                  </Field>

                  <Field>
                    <FieldLabel>Password</FieldLabel>
                    <PasswordInput
                      name="password"
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
                    />
                    {errors.password && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <FieldError>{errors.password}</FieldError>
                      </motion.div>
                    )}
                  </Field>

                  <div className="flex items-center justify-between">
                    <Label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox name="remember" />
                      Remember me
                    </Label>
                    <ForgotPassword />
                  </div>

                  {serverError && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <FieldError>{serverError}</FieldError>
                    </motion.div>
                  )}

                  <motion.div
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                  >
                    <Button
                      type="submit"
                      size="lg"
                      className="h-12 w-full rounded-xl text-base"
                      disabled={processing}
                    >
                      {processing ? (
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Logging in…
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <LucideLogIn size={16} />
                          Log in
                        </span>
                      )}
                    </Button>
                  </motion.div>
                </div>
              )}
            </Form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link
                route="ui.auth.user_registration.create"
                className="font-semibold text-foreground underline-offset-2 hover:underline"
              >
                Create one
              </Link>
            </p>
          </motion.div>
        </div>
      }
    />
  )
}
