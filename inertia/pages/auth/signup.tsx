import { Typography } from '~/components/ui/typography'
import DripNepalLogo from '~/assets/logo/drip-nepal.png'
import { LucideTag } from 'lucide-react'
import { DripCircleIcon } from '~/components/ui/drip-circle-icon'
import { Field, FieldError, FieldLabel, FieldSet } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import { Form } from '@adonisjs/inertia/react'

export default function Signup() {
  return (
    <div className="grid grid-cols-6 h-screen">
      <div className="col-span-4 grid place-content-center gap-6">
        <figure className="bg-black h-fit w-fit p-4 rounded-full mx-auto ">
          <img src={DripNepalLogo} alt="Drip Nepal" className="h-16 w-16" />
        </figure>
        <Typography.H2>Hi Friend!</Typography.H2>

        <Typography.P>Enter your email to sign in or join for</Typography.P>

        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <DripCircleIcon>
              <LucideTag />
            </DripCircleIcon>

            <Typography.P>Exclusive discounts</Typography.P>
          </div>

          <div className="flex flex-col items-center">
            <DripCircleIcon>
              <LucideTag />
            </DripCircleIcon>

            <Typography.P>Easily tracked deliviries and returns</Typography.P>
          </div>

          <div className="flex flex-col items-center">
            <DripCircleIcon>
              <LucideTag />
            </DripCircleIcon>

            <Typography.P>Speedy checkout</Typography.P>
          </div>
        </div>
        <Form route="new_account.store">
          {({ errors }) => (
            <FieldSet>
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

              <Button>Continue</Button>
            </FieldSet>
          )}
        </Form>
      </div>

      <div>QR?</div>
    </div>
  )
}
