import { useState } from 'react'
import { Link, Form } from '@adonisjs/inertia/react'
import { motion } from 'framer-motion'
import { LucideUserPlus } from 'lucide-react'
import { SplitLayout } from '~/components/auth/split_layout'
import { BrandingPanel } from '~/components/auth/branding_panel'
import { PasswordInput } from '~/components/auth/password_input'
import { PasswordStrength } from '~/components/auth/password_strength'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Field, FieldError, FieldLabel } from '~/components/ui/field'

export default function Signup() {
  const [password, setPassword] = useState('')

  return (
    <SplitLayout
      left={<BrandingPanel />}
      right={
        <div className="flex w-full items-center justify-center px-5 pt-8 pb-12 sm:py-12 lg:px-8 lg:py-16">
          <motion.div
            className="w-full max-w-120 sm:rounded-3xl sm:border sm:border-border/50 sm:bg-card sm:p-10 sm:shadow-xl"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="mb-6 sm:mb-8 sm:text-center">
              <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-2xl">
                Create your account
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                You need an account to order. It takes a minute.
              </p>
            </div>

            <Form route="api.auth.user_registration.store">
              {({ errors, processing }) => (
                <div className="flex flex-col gap-4">
                  <Field>
                    <FieldLabel>Full name</FieldLabel>
                    <Input
                      className="h-11"
                      name="fullName"
                      placeholder="John Doe"
                      type="text"
                      required
                      autoFocus
                      autoComplete="name"
                    />
                    {errors.fullName && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <FieldError>{errors.fullName}</FieldError>
                      </motion.div>
                    )}
                  </Field>

                  <Field>
                    <FieldLabel>Email</FieldLabel>
                    <Input
                      className="h-11"
                      name="email"
                      placeholder="john@example.com"
                      type="email"
                      required
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
                    <FieldLabel>Mobile number</FieldLabel>
                    <Input
                      className="h-11"
                      name="phone"
                      placeholder="98XXXXXXXX"
                      inputMode="tel"
                      type="tel"
                      autoComplete="tel"
                    />
                    {errors.phone && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <FieldError>{errors.phone}</FieldError>
                      </motion.div>
                    )}
                  </Field>

                  <Field>
                    <FieldLabel>Password</FieldLabel>
                    <PasswordInput
                      name="password"
                      placeholder="Create a password"
                      required
                      autoComplete="new-password"
                      onChange={(e) => setPassword(e.currentTarget.value)}
                    />
                    <PasswordStrength value={password} />
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

                  <Field>
                    <FieldLabel>Confirm password</FieldLabel>
                    <PasswordInput
                      name="passwordConfirmation"
                      placeholder="Confirm your password"
                      required
                      autoComplete="new-password"
                    />
                    {errors.passwordConfirmation && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <FieldError>{errors.passwordConfirmation}</FieldError>
                      </motion.div>
                    )}
                  </Field>

                  <p className="text-xs text-muted-foreground">
                    By creating an account, you agree to our{' '}
                    <Link
                      route="legal.terms"
                      target="_blank"
                      className="text-foreground underline underline-offset-2"
                    >
                      Terms
                    </Link>{' '}
                    and{' '}
                    <Link
                      route="legal.privacy"
                      target="_blank"
                      className="text-foreground underline underline-offset-2"
                    >
                      Privacy policy
                    </Link>
                    .
                  </p>

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
                          Creating account…
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <LucideUserPlus size={16} />
                          Create account
                        </span>
                      )}
                    </Button>
                  </motion.div>
                </div>
              )}
            </Form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                route="ui.auth.user_session.create"
                className="font-semibold text-foreground underline-offset-2 hover:underline"
              >
                Log in
              </Link>
            </p>
          </motion.div>
        </div>
      }
    />
  )
}
