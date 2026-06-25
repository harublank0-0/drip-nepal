import { FormBuilder } from '~/components/form_builder'
import { Typography } from '~/components/ui/typography'
import { map, z } from 'zod'
import { Button } from '~/components/ui/button'
import { FormField } from '~/components/form_builder/form.types'
import { useForm } from '@tanstack/react-form'
import { router } from '@inertiajs/react'
import { routes } from '@generated/registry'
import { InertiaProps } from '~/types'
import { useEffect } from 'react'
import { isArrayEmpty } from '~/lib/utils'

const ShopSignupFields: FormField<{ name: 'name' }>[] = [
  {
    name: 'name',
    type: 'text',
    label: "Shop's Name",
    placeholder: "Enter Shop's Name",
  },
  {
    name: 'email',
    type: 'email',
    label: "Shop's email",
    placeholder: 'luffy@strawhat.com',
  },
]
const shopSignupSchema = z.object({
  name: z.string().min(1, 'Shop name is required'),
  email: z.string(),
})

type ShopSignupPageProps = InertiaProps<{}>

export default function ShopSignupPage(props: ShopSignupPageProps) {
  const shopForm = useForm({
    defaultValues: {
      name: '',
      email: '',
    },
    validators: {
      onSubmit: shopSignupSchema,
      onBlur: shopSignupSchema,
    },
    onSubmit: async ({ value }) => {
      router.post(routes['shops.shop_registrations.create'].pattern, value)
    },
  })

  return (
    <>
      <Typography.H1>Welcome to Drip Nepal</Typography.H1>
      <FormBuilder fields={ShopSignupFields} form={shopForm}>
        <Button type="submit">Submit</Button>
        <Button>Cancel</Button>
      </FormBuilder>
    </>
  )
}
