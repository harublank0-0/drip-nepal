import { type DeepKeys, type ReactFormExtendedApi } from '@tanstack/react-form'

type BaseField<TFormData, TName extends DeepKeys<TFormData>> = {
  name: TName
  label: string
  description?: string
}

export type TextField<TFormData> = {
  type: 'text'
  placeholder: string
} & BaseField<TFormData, string>

export type EmailField<TFormData> = {
  type: 'email'
  placeholder: string
} & BaseField<TFormData, string>

export type AnyFormApi = ReactFormExtendedApi<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

export type FormField<TFormData> = TextField<TFormData> | EmailField<TFormData>
