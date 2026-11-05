import { useId, useRef, type SubmitEvent } from 'react'
import { SearchIcon, X } from 'lucide-react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '~/components/ui/input-group'
import { Spinner } from '~/components/ui/spinner'

type SearchBoxProps = {
  query: string
  isUpdating: boolean
  onQueryChange: (query: string) => void
  onSubmit: () => void
  onClear: () => void
  onBlur: () => void
  onCompositionChange: (composing: boolean) => void
}

export function SearchBox({
  query,
  isUpdating,
  onQueryChange,
  onSubmit,
  onClear,
  onBlur,
  onCompositionChange,
}: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hintId = useId()
  const tooShort = query.trim().length === 1

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form role="search" aria-label="Product search" onSubmit={submit} className="min-w-0 flex-1">
      <InputGroup className="h-12 rounded-xl">
        <InputGroupAddon className="pl-3.5">
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          type="text"
          inputMode="search"
          name="q"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onBlur={onBlur}
          onCompositionStart={() => onCompositionChange(true)}
          onCompositionEnd={() => onCompositionChange(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault()
          }}
          placeholder="Search products, brands and stores"
          aria-label="Search products, brands and stores"
          aria-describedby={tooShort ? hintId : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={100}
          className="h-full min-w-0"
        />
        <InputGroupAddon align="inline-end" className="gap-0.5 pr-1">
          {isUpdating && <Spinner aria-label="Updating products" className="mx-2" />}
          {query && (
            <InputGroupButton
              size="icon-sm"
              aria-label="Clear search"
              className="size-11 md:size-9"
              onClick={() => {
                onClear()
                inputRef.current?.focus()
              }}
            >
              <X aria-hidden="true" />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
      {tooShort && (
        <p id={hintId} className="mt-2 text-xs text-muted-foreground">
          Enter at least 2 characters to search.
        </p>
      )}
    </form>
  )
}
