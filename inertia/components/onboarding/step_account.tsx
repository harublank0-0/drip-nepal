import { useState } from 'react'
import { EyeIcon, EyeOffIcon, Loader2Icon } from 'lucide-react'
import { type ReactFormExtendedApi } from '@tanstack/react-form'
import { Field, FieldError, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Show } from '~/components/ui/show'
import { PasswordStrength } from '~/components/onboarding/password_strength'
import { cn } from '~/lib/utils'
import { Link } from '@adonisjs/inertia/react'

type StepAccountProps = {
  form: ReactFormExtendedApi<any, any, any, any, any, any, any, any, any, any, any, any>
  isSubmitting: boolean
  onContinue: () => void
}

export function StepAccount({ form, isSubmitting, onContinue }: StepAccountProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <div className="space-y-6">
      <form.Field name="fullName">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="fullName">Full Name</FieldLabel>
              <Input
                id="fullName"
                type="text"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
                aria-invalid={isInvalid}
              />
              <Show when={isInvalid}>
                <FieldError errors={field.state.meta.errors} />
              </Show>
            </Field>
          )
        }}
      </form.Field>

      <form.Field name="email">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="email">Email Address</FieldLabel>
              <Input
                id="email"
                type="email"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                aria-invalid={isInvalid}
              />
              <Show when={isInvalid}>
                <FieldError errors={field.state.meta.errors} />
              </Show>
            </Field>
          )
        }}
      </form.Field>

      <form.Field name="phone">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="phone">Phone Number</FieldLabel>
              <Input
                id="phone"
                type="tel"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="98XXXXXXXX"
                autoComplete="tel"
                aria-invalid={isInvalid}
              />
              <Show when={isInvalid}>
                <FieldError errors={field.state.meta.errors} />
              </Show>
            </Field>
          )
        }}
      </form.Field>

      <form.Field name="password">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  aria-invalid={isInvalid}
                  className={cn(
                    isInvalid &&
                      'border-destructive ring-3 ring-destructive/20 dark:ring-destructive/40'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </button>
              </div>
              <PasswordStrength password={field.state.value || ''} />
              <Show when={isInvalid}>
                <FieldError errors={field.state.meta.errors} />
              </Show>
            </Field>
          )
        }}
      </form.Field>

      <form.Field name="confirmPassword">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="confirmPassword">Confirm Password</FieldLabel>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  aria-invalid={isInvalid}
                  className={cn(
                    isInvalid &&
                      'border-destructive ring-3 ring-destructive/20 dark:ring-destructive/40'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </button>
              </div>
              <Show when={isInvalid}>
                <FieldError errors={field.state.meta.errors} />
              </Show>
            </Field>
          )
        }}
      </form.Field>

      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={onContinue}
        disabled={isSubmitting}
      >
        <Show when={isSubmitting}>
          <Loader2Icon className="size-4 animate-spin" />
        </Show>
        Continue
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign In
        </Link>
      </p>
    </div>
  )
}
