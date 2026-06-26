import * as React from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '~/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { cn } from '~/lib/utils'

export type MultiSelectOption = {
  label: string
  value: string
}

type MultiSelectProps = {
  options: MultiSelectOption[]
  value: string[]
  onValueChange: (value: string[]) => void
  placeholder?: string
  maxSelected?: number
  disabled?: boolean
  className?: string
  ariaInvalid?: boolean
}

export function MultiSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Select options...',
  maxSelected,
  disabled,
  className,
  ariaInvalid,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)

  const selectedOptions = React.useMemo(
    () => options.filter((o) => value.includes(o.value)),
    [options, value]
  )

  const toggle = (optionValue: string) => {
    const selected = value.includes(optionValue)

    if (selected) {
      onValueChange(value.filter((v) => v !== optionValue))
      return
    }

    if (maxSelected && value.length >= maxSelected) {
      return
    }

    onValueChange([...value, optionValue])
  }

  const remove = (e: React.MouseEvent<HTMLButtonElement>, optionValue: string) => {
    e.stopPropagation()
    onValueChange(value.filter((v) => v !== optionValue))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          data-invalid={ariaInvalid}
          disabled={disabled}
          className={cn(
            'min-h-10 w-full justify-between px-3',
            ariaInvalid && 'border-destructive ring-3 ring-destructive/20 dark:ring-destructive/40',
            className
          )}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1 overflow-hidden">
            {selectedOptions.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selectedOptions.map((option) => (
                <Badge key={option.value} variant="secondary" className="gap-1">
                  {option.label}

                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => remove(e, option.value)}
                    className="rounded-sm outline-none"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>

          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." />

          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup>
            {options.map((option) => {
              const selected = value.includes(option.value)

              return (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => toggle(option.value)}
                >
                  <Check className={cn('mr-2 h-4 w-4', selected ? 'opacity-100' : 'opacity-0')} />

                  {option.label}
                </CommandItem>
              )
            })}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
