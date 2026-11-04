import { useEffect, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { cn } from '~/lib/utils'
import { purchaseLabel, type VariantSelection } from '../hooks/use_variant_selection'
import { PriceTag } from './price_tag'

type MobileAddToCartBarProps = {
  selection: VariantSelection
  processing: boolean
  onAddToCart: () => void
  /* The main add-to-cart block: the bar hides while it's on screen. */
  ctaRef: React.RefObject<HTMLDivElement | null>
  /* Marks the end of the product content: the bar hides once it's reached. */
  endRef: React.RefObject<HTMLDivElement | null>
}

function useBarVisibility(
  ctaRef: React.RefObject<HTMLDivElement | null>,
  endRef: React.RefObject<HTMLDivElement | null>
) {
  const [ctaInView, setCtaInView] = useState(true)
  const [pastEnd, setPastEnd] = useState(false)

  useEffect(() => {
    const cta = ctaRef.current
    const end = endRef.current
    if (!cta || !end || typeof IntersectionObserver === 'undefined') return

    const ctaObserver = new IntersectionObserver(([entry]) => setCtaInView(entry.isIntersecting))
    // The end counts as reached once it's above the middle of the screen, so
    // the bar stays up through the related products but leaves the footer
    // clear. The observed area runs from far above the viewport down to its
    // middle, so `isIntersecting` flips even when a jump skips past the end.
    const endObserver = new IntersectionObserver(([entry]) => setPastEnd(entry.isIntersecting), {
      rootMargin: '100000px 0px -50% 0px',
    })
    ctaObserver.observe(cta)
    endObserver.observe(end)
    return () => {
      ctaObserver.disconnect()
      endObserver.disconnect()
    }
  }, [ctaRef, endRef])

  return !ctaInView && !pastEnd
}

/*
 * A bottom bar on small screens so the shopper can add to cart without
 * scrolling back up. While an option is still missing, the button scrolls
 * to the pickers instead.
 */
export function MobileAddToCartBar({
  selection,
  processing,
  onAddToCart,
  ctaRef,
  endRef,
}: MobileAddToCartBarProps) {
  const visible = useBarVisibility(ctaRef, endRef)
  const isIncomplete = selection.state === 'incomplete'
  const canAct = (selection.state === 'ready' || isIncomplete) && !processing

  const onClick = () => {
    if (isIncomplete) {
      document
        .getElementById('product-options')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    onAddToCart()
  }

  return (
    <div
      data-slot="mobile-add-to-cart"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-300 md:hidden',
        visible ? 'translate-y-0' : 'pointer-events-none translate-y-full'
      )}
      aria-hidden={!visible}
      inert={!visible}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <PriceTag price={selection.price} size="sm" />
          {(selection.selectedSize || selection.selectedColor) && (
            <p className="truncate text-xs text-muted-foreground">
              {[selection.selectedColor, selection.selectedSize].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          className="h-11 shrink-0 px-5 text-sm font-semibold"
          disabled={!canAct}
          onClick={onClick}
        >
          {processing ? (
            <>
              <Spinner />
              Adding…
            </>
          ) : (
            purchaseLabel(selection, { short: true })
          )}
        </Button>
      </div>
    </div>
  )
}
