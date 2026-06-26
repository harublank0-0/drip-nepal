import { TextField } from '~/components/form_builder/forms.types'

type TextFieldProps = {
  name: string
  label: string
  description?: string
  type: 'text'
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function TextInputField() {}
