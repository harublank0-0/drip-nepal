import { ChevronDown } from 'lucide-react'

type FilterGroupProps = {
  label: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

export function FilterGroup({ label, isOpen, onToggle, children }: FilterGroupProps) {
  return (
    <div className="border-b border-border pb-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-3 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
        aria-expanded={isOpen}
      >
        {label}
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && <div className="pt-1 space-y-2">{children}</div>}
    </div>
  )
}
