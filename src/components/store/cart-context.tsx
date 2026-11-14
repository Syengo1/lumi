'use client'

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useSyncExternalStore,
} from 'react'

export interface CartItem {
  key: string // `${productId}__${selectedSize}`
  productId: string
  title: string
  selectedSize: string
  primaryColor: string
  colorHex: string
  unitPrice: number
  regularPrice: number
  quantity: number
  maxStock: number
  imageUrl: string | null
}

interface CartContextValue {
  items: CartItem[]
  isOpen: boolean
  openCart: () => void
  closeCart: () => void
  addItem: (item: Omit<CartItem, 'key'>, openDrawer?: boolean) => void
  updateQuantity: (key: string, quantity: number) => void
  removeItem: (key: string) => void
  clearCart: () => void
  totalItems: number
  subtotal: number
  totalSavings: number
}

const CartContext = createContext<CartContextValue | undefined>(undefined)
const STORAGE_KEY = 'luminous_drip_cart_v1'
const EMPTY_CART: CartItem[] = []

let cachedRaw: string | null = null
let cachedItems: CartItem[] = EMPTY_CART
const listeners = new Set<() => void>()

function emitCartChange() {
  listeners.forEach((listener) => listener())
}

function subscribeToCart(callback: () => void) {
  listeners.add(callback)
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage)
  }
  return () => {
    listeners.delete(callback)
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage)
    }
  }
}

function getCartSnapshot(): CartItem[] {
  if (typeof window === 'undefined') return EMPTY_CART
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === cachedRaw) return cachedItems
    cachedRaw = raw
    if (!raw) {
      cachedItems = EMPTY_CART
      return cachedItems
    }
    const parsed = JSON.parse(raw)
    cachedItems = Array.isArray(parsed) ? (parsed as CartItem[]) : EMPTY_CART
    return cachedItems
  } catch {
    return EMPTY_CART
  }
}

function getServerCartSnapshot(): CartItem[] {
  return EMPTY_CART
}

function writeCartStorage(nextItems: CartItem[]) {
  if (typeof window === 'undefined') return
  try {
    const serialized = JSON.stringify(nextItems)
    cachedRaw = serialized
    cachedItems = nextItems
    window.localStorage.setItem(STORAGE_KEY, serialized)
    emitCartChange()
  } catch {
    // Ignore storage quota errors
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const items = useSyncExternalStore(
    subscribeToCart,
    getCartSnapshot,
    getServerCartSnapshot
  )
  const [isOpen, setIsOpen] = useState(false)

  const addItem = useCallback((incoming: Omit<CartItem, 'key'>, openDrawer = true) => {
    const current = getCartSnapshot()
    const key = `${incoming.productId}__${incoming.selectedSize}`
    const existingIndex = current.findIndex((i) => i.key === key)

    let next: CartItem[]
    if (existingIndex > -1) {
      next = [...current]
      const existing = next[existingIndex]
      const nextQty = Math.min(existing.maxStock, existing.quantity + incoming.quantity)
      next[existingIndex] = { ...existing, quantity: nextQty }
    } else {
      next = [
        ...current,
        {
          ...incoming,
          key,
          quantity: Math.min(incoming.maxStock, Math.max(1, incoming.quantity)),
        },
      ]
    }

    writeCartStorage(next)
    if (openDrawer) setIsOpen(true)
  }, [])

  const removeItem = useCallback((key: string) => {
    const current = getCartSnapshot()
    writeCartStorage(current.filter((item) => item.key !== key))
  }, [])

  const updateQuantity = useCallback((key: string, quantity: number) => {
    const current = getCartSnapshot()
    if (quantity <= 0) {
      writeCartStorage(current.filter((item) => item.key !== key))
      return
    }
    writeCartStorage(
      current.map((item) =>
        item.key === key
          ? { ...item, quantity: Math.min(item.maxStock, quantity) }
          : item
      )
    )
  }, [])

  const clearCart = useCallback(() => {
    writeCartStorage(EMPTY_CART)
  }, [])

  const summary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.totalItems += item.quantity
        acc.subtotal += item.unitPrice * item.quantity
        if (item.regularPrice > item.unitPrice) {
          acc.totalSavings += (item.regularPrice - item.unitPrice) * item.quantity
        }
        return acc
      },
      { totalItems: 0, subtotal: 0, totalSavings: 0 }
    )
  }, [items])

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        openCart: () => setIsOpen(true),
        closeCart: () => setIsOpen(false),
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        totalItems: summary.totalItems,
        subtotal: summary.subtotal,
        totalSavings: summary.totalSavings,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}