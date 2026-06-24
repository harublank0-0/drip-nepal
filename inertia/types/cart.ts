export type Store = {
  id: string
  name: string
  slug: string
  logo: string
  itemCount: number
}

export type CartItem = {
  id: string
  productId: string
  storeId: string
  name: string
  image: string
  storeName: string
  storeLogo: string
  color: string
  size: string
  price: number
  originalPrice: number | null
  quantity: number
  maxQuantity: number
  inStock: boolean
  slug: string
}

export type SavedItem = CartItem

export type CartState = {
  items: CartItem[]
  savedItems: SavedItem[]
  isDrawerOpen: boolean
  isLoading: boolean
  isUpdating: Record<string, boolean>
  coupon: string | null
  couponDiscount: number
}

export type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { id: string; quantity: number } }
  | { type: 'TOGGLE_DRAWER' }
  | { type: 'OPEN_DRAWER' }
  | { type: 'CLOSE_DRAWER' }
  | { type: 'SAVE_FOR_LATER'; payload: string }
  | { type: 'MOVE_TO_CART'; payload: SavedItem }
  | { type: 'REMOVE_SAVED'; payload: string }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_UPDATING'; payload: { id: string; loading: boolean } }
  | { type: 'APPLY_COUPON'; payload: string }
  | { type: 'REMOVE_COUPON' }
  | { type: 'SET_ITEMS'; payload: CartItem[] }
  | { type: 'SET_SAVED_ITEMS'; payload: SavedItem[] }

export type GroupedCartItems = {
  storeId: string
  storeName: string
  storeLogo: string
  items: CartItem[]
}

export type CartContextType = {
  state: CartState
  dispatch: React.Dispatch<CartAction>
  addItem: (item: CartItem) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  toggleDrawer: () => void
  openDrawer: () => void
  closeDrawer: () => void
  saveForLater: (id: string) => void
  moveToCart: (item: SavedItem) => void
  removeSaved: (id: string) => void
  clearCart: () => void
  applyCoupon: (code: string) => void
  removeCoupon: () => void
  itemCount: number
  subtotal: number
  shipping: number
  discount: number
  total: number
  freeShippingRemaining: number
  groupedItems: GroupedCartItems[]
  savedCount: number
}
