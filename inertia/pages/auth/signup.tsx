import { Typography } from '~/components/ui/typography'
import DripNepalLogo from '~/assets/logo/drip-nepal.png'
import { LucidePackage, LucideTag, LucideVan } from 'lucide-react'
import { DripCircleIcon } from '~/components/ui/drip_circle_icon'
import { Field, FieldError, FieldLabel, FieldSet } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Form } from '@adonisjs/inertia/react'

export default function Signup() {
  return (
    <div className="grid grid-cols-6 h-screen w-screen">
      {/*
       * Background image that get's displayed on small screens
       */}
      <div
        className="h-36 col-span-full bg-cover bg-center bg-no-repeat lg:hidden"
        id="signup-mobile-bg"
      />

      <div className="col-span-full px-4 lg:py-12 lg:col-span-4 lg:w-md mx-auto grid place-content-center gap-6">
        <figure className="translate-y-[-50%] lg:translate-y-0 bg-black h-fit w-fit p-4 rounded-full mx-auto">
          <img src={DripNepalLogo} alt="Drip Nepal" className="h-16 w-16" />
        </figure>
        <Typography.H2>Hi Friend!</Typography.H2>

        <Typography.P className="lg:mb-6">Enter your email to sign in or join for</Typography.P>

        <div className="flex gap-4 text-center">
          <div className="flex flex-col items-center">
            <DripCircleIcon>
              <LucideTag />
            </DripCircleIcon>

            <Typography.P className="text-sm">Exclusive discounts</Typography.P>
          </div>

          <div className="flex flex-col items-center">
            <DripCircleIcon>
              <LucidePackage />
            </DripCircleIcon>

            <Typography.P className="text-sm">Easily tracked deliviries and returns</Typography.P>
          </div>

          <div className="flex flex-col items-center">
            <DripCircleIcon>
              <LucideVan />
            </DripCircleIcon>

            <Typography.P className="text-sm">Speedy checkout</Typography.P>
          </div>
        </div>
        <Form route="new_account.store">
          {({ errors }) => (
            <FieldSet>
              <Field>
                <FieldLabel>
                  Full Name: <sup>*</sup>
                </FieldLabel>
                <Input name="fullName" placeholder="Drip Nepal" type="text" required />

                {errors.fullName && <FieldError>{errors.fullName}</FieldError>}
              </Field>

              <Field>
                <FieldLabel>
                  Email: <sup>*</sup>
                </FieldLabel>
                <Input
                  name="email"
                  placeholder="awesomecustomer@dripnepal.com"
                  type="email"
                  required
                />

                {errors.email && <FieldError>{errors.email}</FieldError>}
              </Field>

              <Field>
                <FieldLabel>
                  Password <sup>*</sup>
                </FieldLabel>
                <Input name="password" placeholder="********" type="password" required />

                {errors.password && <FieldError>{errors.password}</FieldError>}
              </Field>

              <Field>
                <FieldLabel>
                  Confirm Password <sup>*</sup>
                </FieldLabel>
                <Input
                  name="passwordConfirmation"
                  placeholder="********"
                  type="password"
                  required
                />

                {errors.passwordConfirmation && (
                  <FieldError>{errors.passwordConfirmation}</FieldError>
                )}
              </Field>

              <Button>Sign Up</Button>
            </FieldSet>
          )}
        </Form>
      </div>

      {/**
       * Background image that get's displayed on large screen
       */}
      <div
        className="col-span-2 bg-cover bg-center bg-no-repeat hidden lg:block"
        id="signup-desktop-bg"
      />
    </div>
  )
}
