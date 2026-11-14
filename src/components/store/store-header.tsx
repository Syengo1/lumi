'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCart } from './cart-context'
import { ShoppingBag, ShieldCheck, Search, Compass } from 'lucide-react'

interface StoreHeaderProps {
  storeName: string
}

export function StoreHeader({ storeName }: StoreHeaderProps) {
  const pathname = usePathname()
  const { totalItems, openCart } = useCart()

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Shop All', href: '/shop' },
    { name: 'On Offer', href: '/shop?offer=true' },
  ]

  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="font-extrabold text-xl tracking-tight flex items-center gap-2.5 shrink-0">
          <span className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm shadow-primary/20">
            <ShoppingBag size={17} />
          </span>
          <span>{storeName}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm font-semibold">
          {navLinks.map((link) => {
            const active = pathname === link.href
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {link.name}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href="/shop"
            aria-label="Search catalog"
            className="p-2.5 rounded-xl bg-secondary/70 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Search size={17} />
          </Link>

          <button
            type="button"
            onClick={openCart}
            className="relative inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm shadow-primary/20 hover:opacity-95 transition-all cursor-pointer"
          >
            <ShoppingBag size={15} />
            <span className="hidden sm:inline">Bag</span>
            <span className="px-1.5 py-0.5 rounded-full bg-background text-foreground text-[11px] font-extrabold">
              {totalItems}
            </span>
          </button>

          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-xs font-semibold"
          >
            <ShieldCheck size={14} />
            <span className="hidden sm:inline">Admin</span>
          </Link>
        </div>
      </div>

      {/* Mobile Quick Sub-Nav */}
      <div className="md:hidden border-t border-border/40 px-4 py-2 flex items-center justify-around text-xs font-semibold bg-background/95">
        <Link href="/" className={pathname === '/' ? 'text-primary' : 'text-muted-foreground'}>
          Home
        </Link>
        <Link
          href="/shop"
          className={`inline-flex items-center gap-1 ${
            pathname.startsWith('/shop') ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Compass size={13} /> Full Shop & Filters
        </Link>
        <Link href="/checkout" className={pathname === '/checkout' ? 'text-primary' : 'text-muted-foreground'}>
          Checkout
        </Link>
      </div>
    </header>
  )
}