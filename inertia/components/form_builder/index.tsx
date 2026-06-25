import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Show } from '~/components/ui/show'
import { AnyFormApi, FormField } from './form.types'
import { useEffect } from 'react'
import { hasValidationErrors } from '~/lib/utils'
import { usePage } from '@inertiajs/react'

type FormBuilderProps<TData, TForm extends AnyFormApi> = {
  form: TForm
  fields: FormField<TData>[]
  children: React.ReactNode
}

export function FormBuilder<TData, TForm extends AnyFormApi>(
  props: FormBuilderProps<TData, TForm>
) {
  const { fields: formFields, form, children } = props
  const { errors = {} } = usePage().props

  useEffect(() => {
    if (!hasValidationErrors(errors)) return

    const mappedErrors = Object.entries(errors).reduce<Record<string, { message: string }>>(
      (acc, [fieldName, errorMessage]) => {
        acc[fieldName] = {
          message: errorMessage,
        }
        return acc
      },
      {}
    )
    form.setErrorMap({
      onSubmit: {
        fields: mappedErrors,
      },
    })
  }, [errors, form])
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <>
          {formFields.map((formField) => {
            const { type } = formField
            return (
              <form.Field
                key={formField.name}
                name={formField.name}
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel>{formField.label}</FieldLabel>

                      <Input
                        type={formField.type}
                        id={formField.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        placeholder={formField.placeholder}
                        autoComplete="off"
                      />

                      <Show when={!!formField.description}>
                        <FieldDescription>{formField.description}</FieldDescription>
                      </Show>

                      <Show when={isInvalid}>
                        <FieldError errors={field.state.meta.errors} />
                      </Show>
                    </Field>
                  )
                }}
              />
            )
          })}

          {children}
        </>
      </form>
    </>
  )
}
