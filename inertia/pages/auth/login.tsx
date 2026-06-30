import { Link, Form } from '@adonisjs/inertia/react'
import { usePage } from '@inertiajs/react'
import { LucideLogIn, LucideLock } from 'lucide-react'
import { motion } from 'framer-motion'
import { SplitLayout } from '~/components/auth/split_layout'
import { BrandingPanel } from '~/components/auth/branding_panel'
import { PasswordInput } from '~/components/auth/password_input'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { Label } from '~/components/ui/label'
import { Field, FieldError, FieldLabel } from '~/components/ui/field'

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
          subheading="Sign in to continue shopping and discover amazing products from local sellers."
          benefits={[
            'Track your orders',
            'Save your favorite products',
            'Faster checkout experience',
            'Secure shopping experience',
          ]}
        />
      }
      right={
        <div className="flex w-full items-center justify-center px-5 py-12 lg:px-8 lg:py-16">
          <motion.div
            className="w-full max-w-[460px] rounded-3xl border border-border/50 bg-card p-8 shadow-xl sm:p-10"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Welcome Back</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Sign in to your account.</p>
            </div>

            <button
              type="button"
              className="flex w-full cursor-not-allowed items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground opacity-50 transition-colors hover:bg-muted"
              disabled
              aria-label="Continue with Google (coming soon)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">Or continue with email</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Form route="session.store">
              {({ errors, processing }) => (
                <div className="flex flex-col gap-4">
                  <Field>
                    <FieldLabel>Email or Phone</FieldLabel>
                    <Input
                      name="email"
                      placeholder="hello@example.com"
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
                    <Link
                      route="home"
                      className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline transition-colors"
                    >
                      Forgot password?
                    </Link>
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
                      className="w-full rounded-xl py-2.5"
                      disabled={processing}
                    >
                      {processing ? (
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Signing in…
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <LucideLogIn size={16} />
                          Sign In
                        </span>
                      )}
                    </Button>
                  </motion.div>
                </div>
              )}
            </Form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?
              <Link
                route="new_account.create"
                className="font-semibold text-foreground underline-offset-2 hover:underline"
              >
                Create account
              </Link>
            </p>

            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <LucideLock size={12} className="shrink-0" />
              <span>Your information is securely encrypted and protected.</span>
            </div>
          </motion.div>
        </div>
      }
    />
  )
}
