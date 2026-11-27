import { useEffect, useRef } from 'react'
import { XIcon } from 'lucide-react'
import { t } from '~/lib/i18n'

/*
 * The applied filters as removable chips (docs/08 §4.3 `FilterBar`, §11.1;
 * R1-S part 3d-i-b): each a button named "Remove filter: Size: M". After a
 * removal focus moves to the chip now in its place, the next one, or the
 * one before when it was the last, and to the results heading when none is
 * left; "Clear all" moves it to the heading. On narrow screens the chips
 * scroll sideways.
 */
export type FilterChip = { key: string; label: string }

export function FilterChips({
  chips,
  onRemove,
  onClearAll,
  focusHeading,
}: {
  chips: FilterChip[]
  // Whether a visit was made; focus moves only then.
  onRemove: (chip: FilterChip) => boolean
  onClearAll: () => void
  focusHeading: () => void
}) {
  const list = useRef<HTMLUListElement>(null)
  // The place of the chip just removed, for focus once the list has re-rendered.
  const removedAt = useRef<number | null>(null)
  useEffect(() => {
    if (removedAt.current === null) return
    const index = Math.min(removedAt.current, chips.length - 1)
    removedAt.current = null
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('button[data-chip]')
    if (index < 0 || !buttons?.[index]) focusHeading()
    else buttons[index].focus()
  }, [chips, focusHeading])

  if (chips.length === 0) return null
  return (
    <div className="flex items-center gap-2">
      <ul
        ref={list}
        aria-label={t('storefront.filters.applied')}
        className="relative -my-1 flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 sm:flex-wrap sm:overflow-visible"
      >
        {chips.map((chip, index) => (
          <li key={chip.key} className="shrink-0">
            <button
              type="button"
              data-chip
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-ring/50 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm outline-none focus-visible:ring-3"
              onClick={() => {
                if (onRemove(chip)) removedAt.current = index
              }}
            >
              <span className="sr-only">{t('storefront.filters.remove_prefix')} </span>
              {chip.label}
              <XIcon aria-hidden="true" className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="text-link shrink-0 text-sm underline underline-offset-4"
        onClick={() => {
          onClearAll()
          focusHeading()
        }}
      >
        {t('storefront.filters.clear_all')}
      </button>
    </div>
  )
}
