import { useState } from 'react'
import { router, usePage } from '@inertiajs/react'

const CART_ITEMS_URL = '/api/v1/cart/items'

/*
 * Posts a variant to the cart, for guests and logged-in shoppers alike.
 * The server redirects back with a flash message (shown as a toast by the
 * root layout). Validation errors come back as page errors.
 */
export function useAddToCart() {
  const { errors } = usePage().props
  const [processing, setProcessing] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  function addToCart(variantId: string, quantity: number) {
    router.post(
      CART_ITEMS_URL,
      { variantId, quantity },
      {
        preserveScroll: true,
        // Keep the picked size, color and quantity after the redirect back.
        preserveState: true,
        onStart: () => {
          setProcessing(true)
          setShowErrors(true)
        },
        onFinish: () => setProcessing(false),
      }
    )
  }

  const error = showErrors ? (errors?.quantity ?? errors?.variantId) : undefined

  return {
    addToCart,
    processing,
    error: typeof error === 'string' ? error : undefined,
    /* Hide a stale error once the shopper changes their pick. */
    dismissError: () => setShowErrors(false),
  }
}
