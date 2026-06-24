import { createContext, useContext, useReducer, useMemo, useCallback, type ReactNode } from 'react'
import type {
  CartItem,
  CartState,
  CartAction,
  CartContextType,
  GroupedCartItems,
  SavedItem,
} from '~/types/cart'
import { FREE_SHIPPING_THRESHOLD, SHIPPING_COST } from '~/lib/mock-data/cart'

const initialState: CartState = {
  items: [],
  savedItems: [],
  isDrawerOpen: false,
  isLoading: false,
  isUpdating: {},
  coupon: null,
  couponDiscount: 0,
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find(
        (item) =>
          item.productId === action.payload.productId &&
          item.color === action.payload.color &&
          item.size === action.payload.size
      )
      if (existing) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === existing.id
              ? {
                  ...item,
                  quantity: Math.min(item.quantity + action.payload.quantity, item.maxQuantity),
                }
              : item
          ),
        }
      }
      return { ...state, items: [...state.items, action.payload] }
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((item) => item.id !== action.payload) }
    case 'UPDATE_QUANTITY':
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.payload.id
            ? {
                ...item,
                quantity: Math.max(1, Math.min(action.payload.quantity, item.maxQuantity)),
              }
            : item
        ),
      }
    case 'TOGGLE_DRAWER':
      return { ...state, isDrawerOpen: !state.isDrawerOpen }
    case 'OPEN_DRAWER':
      return { ...state, isDrawerOpen: true }
    case 'CLOSE_DRAWER':
      return { ...state, isDrawerOpen: false }
    case 'SAVE_FOR_LATER': {
      const item = state.items.find((i) => i.id === action.payload)
      if (!item) return state
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.payload),
        savedItems: [...state.savedItems, item as SavedItem],
      }
    }
    case 'MOVE_TO_CART': {
      const existing = state.items.find(
        (item) =>
          item.productId === action.payload.productId &&
          item.color === action.payload.color &&
          item.size === action.payload.size
      )
      if (existing) {
        return {
          ...state,
          savedItems: state.savedItems.filter((i) => i.id !== action.payload.id),
          items: state.items.map((item) =>
            item.id === existing.id
              ? { ...item, quantity: Math.min(item.quantity + 1, item.maxQuantity) }
              : item
          ),
        }
      }
      return {
        ...state,
        savedItems: state.savedItems.filter((i) => i.id !== action.payload.id),
        items: [...state.items, action.payload],
      }
    }
    case 'REMOVE_SAVED':
      return { ...state, savedItems: state.savedItems.filter((i) => i.id !== action.payload) }
    case 'CLEAR_CART':
      return { ...state, items: [], savedItems: [], coupon: null, couponDiscount: 0 }
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    case 'SET_UPDATING':
      return {
        ...state,
        isUpdating: { ...state.isUpdating, [action.payload.id]: action.payload.loading },
      }
    case 'APPLY_COUPON':
      return { ...state, coupon: action.payload, couponDiscount: 0.1 }
    case 'REMOVE_COUPON':
      return { ...state, coupon: null, couponDiscount: 0 }
    case 'SET_ITEMS':
      return { ...state, items: action.payload }
    case 'SET_SAVED_ITEMS':
      return { ...state, savedItems: action.payload }
    default:
      return state
  }
}

const CartContext = createContext<CartContextType | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialState)

  const addItem = useCallback((item: CartItem) => {
    dispatch({ type: 'ADD_ITEM', payload: item })
  }, [])

  const removeItem = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_ITEM', payload: id })
  }, [])

  const updateQuantity = useCallback((id: string, quantity: number) => {
    dispatch({ type: 'SET_UPDATING', payload: { id, loading: true } })
    dispatch({ type: 'UPDATE_QUANTITY', payload: { id, quantity } })
    setTimeout(() => {
      dispatch({ type: 'SET_UPDATING', payload: { id, loading: false } })
    }, 300)
  }, [])

  const toggleDrawer = useCallback(() => dispatch({ type: 'TOGGLE_DRAWER' }), [])
  const openDrawer = useCallback(() => dispatch({ type: 'OPEN_DRAWER' }), [])
  const closeDrawer = useCallback(() => dispatch({ type: 'CLOSE_DRAWER' }), [])

  const saveForLater = useCallback((id: string) => {
    dispatch({ type: 'SAVE_FOR_LATER', payload: id })
  }, [])

  const moveToCart = useCallback((item: SavedItem) => {
    dispatch({ type: 'MOVE_TO_CART', payload: item })
  }, [])

  const removeSaved = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_SAVED', payload: id })
  }, [])

  const clearCart = useCallback(() => dispatch({ type: 'CLEAR_CART' }), [])

  const applyCoupon = useCallback((code: string) => {
    dispatch({ type: 'APPLY_COUPON', payload: code })
  }, [])

  const removeCoupon = useCallback(() => dispatch({ type: 'REMOVE_COUPON' }), [])

  const itemCount = state.items.reduce((sum, item) => sum + item.quantity, 0)

  const subtotal = useMemo(
    () => state.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [state.items]
  )

  const discount = useMemo(() => {
    const totalBeforeDiscount = state.items.reduce(
      (sum, item) => sum + (item.originalPrice ?? item.price) * item.quantity,
      0
    )
    const couponDiscount = subtotal * state.couponDiscount
    return totalBeforeDiscount - subtotal + couponDiscount
  }, [state.items, subtotal, state.couponDiscount])

  const shipping = useMemo(() => {
    if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0
    return SHIPPING_COST
  }, [subtotal])

  const total = useMemo(() => subtotal + shipping - discount, [subtotal, shipping, discount])

  const freeShippingRemaining = useMemo(() => {
    if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0
    return FREE_SHIPPING_THRESHOLD - subtotal
  }, [subtotal])

  const groupedItems = useMemo(() => {
    const grouped: Record<string, GroupedCartItems> = {}
    for (const item of state.items) {
      if (!grouped[item.storeId]) {
        grouped[item.storeId] = {
          storeId: item.storeId,
          storeName: item.storeName,
          storeLogo: item.storeLogo,
          items: [],
        }
      }
      grouped[item.storeId].items.push(item)
    }
    return Object.values(grouped)
  }, [state.items])

  const savedCount = state.savedItems.length

  const value = useMemo(
    () => ({
      state,
      dispatch,
      addItem,
      removeItem,
      updateQuantity,
      toggleDrawer,
      openDrawer,
      closeDrawer,
      saveForLater,
      moveToCart,
      removeSaved,
      clearCart,
      applyCoupon,
      removeCoupon,
      itemCount,
      subtotal,
      shipping,
      discount,
      total,
      freeShippingRemaining,
      groupedItems,
      savedCount,
    }),
    [
      state,
      addItem,
      removeItem,
      updateQuantity,
      toggleDrawer,
      openDrawer,
      closeDrawer,
      saveForLater,
      moveToCart,
      removeSaved,
      clearCart,
      applyCoupon,
      removeCoupon,
      itemCount,
      subtotal,
      shipping,
      discount,
      total,
      freeShippingRemaining,
      groupedItems,
      savedCount,
    ]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextType {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
