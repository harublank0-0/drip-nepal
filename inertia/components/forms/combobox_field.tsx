import { useId, useState } from 'react'
import { ChevronsUpDownIcon } from 'lucide-react'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command'

/*
 * A labelled choice from a list too long to scan (docs/08 §4.3 `AddressForm`
 * local level; §9.2 "Comboboxes"), on the `popover` and `command`
 * primitives: the field is a button that names the choice, and opens a list
 * you type to filter, move through with Up and Down, choose from with Enter
 * and close with Escape; focus goes back to the button. The chosen name is
 * the button's text, so it shows next to the label (08 §9.2). Nothing can be
 * typed that is not an option (AC-FR-IAM-012-1).
 *
 * The button carries the label's id, the help text and the errors in
 * `aria-describedby`. While `disabled`, `placeholder` says why (choose the
 * district first). Items filter on their name and their code.
 */
export function ComboboxField({
  id,
  label,
  value,
  options,
  onChange,
  errors,
  placeholder,
  searchLabel,
  emptyText,
  description,
  disabled = false,
}: {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  errors: unknown[]
  placeholder: string
  searchLabel: string
  emptyText: string
  description?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const messages = errors.filter((error): error is string => typeof error === 'string')
  const chosen = options.find((option) => option.value === value)
  const describedBy = [
    description ? `${id}-help` : null,
    messages.length > 0 ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Field data-invalid={messages.length > 0 || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-invalid={messages.length > 0 || undefined}
            aria-describedby={describedBy || undefined}
            disabled={disabled}
            className="h-11 w-full justify-between text-base font-normal md:text-sm"
          >
            <span className={cn('truncate', !chosen && 'text-muted-foreground')}>
              {chosen?.label ?? placeholder}
            </span>
            <ChevronsUpDownIcon aria-hidden="true" className="opacity-50" />
          </Button>
        </PopoverTrigger>
        {/* No animation: closing unmounts it at once, so a list opened next (the ward) cannot
            leave this layer stuck mid-animation, still catching outside clicks. */}
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0 animate-none!"
        >
          <Command>
            <CommandInput aria-label={searchLabel} placeholder={searchLabel} />
            <CommandList id={listId} aria-label={label}>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label]}
                    data-checked={option.value === value}
                    onSelect={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {description && <FieldDescription id={`${id}-help`}>{description}</FieldDescription>}
      <FieldError id={`${id}-error`} errors={messages.map((message) => ({ message }))} />
    </Field>
  )
}
