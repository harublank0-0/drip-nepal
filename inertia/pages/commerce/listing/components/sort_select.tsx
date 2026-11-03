import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import type { ListingSort } from '../types'

const SORT_OPTIONS: { value: ListingSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
]

type SortSelectProps = {
  value: ListingSort
  onChange: (value: ListingSort) => void
}

export function SortSelect({ value, onChange }: SortSelectProps) {
  const handleChange = (next: string) => {
    const option = SORT_OPTIONS.find((item) => item.value === next)
    if (option) onChange(option.value)
  }

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger aria-label="Sort products" className="h-9 min-w-44">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-muted-foreground">Sort:</span>
          <span className="truncate">
            <SelectValue />
          </span>
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
