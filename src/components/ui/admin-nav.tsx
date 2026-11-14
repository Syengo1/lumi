'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, ReceiptText, Settings, Store, LogOut } from 'lucide-react'
import { logout } from '@/app/(auth)/login/actions'

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Orders', href: '/orders', icon: ReceiptText },
  { name: 'Inventory', href: '/inventory', icon: Package },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function AdminNav({ storeName = 'Luminous.' }: { storeName?: string }) {
  const pathname = usePathname()

  return (
    <>
      {/* DESKTOP & TABLET: Borderless Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-transparent h-screen fixed top-0 left-0 z-40">
        <div className="p-8 pb-4">
          <Link
            href="/dashboard"
            className="font-extrabold text-2xl text-primary tracking-tight line-clamp-1"
          >
            {storeName}
          </Link>
          <p className="text-xs text-muted-foreground mt-0.5">Store Management</p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${
                  isActive
                    ? 'bg-card shadow-[0_2px_10px_rgb(0,0,0,0.04)] text-primary'
                    : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
                }`}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 mb-4 mx-4 space-y-1">
          <Link
            href="/"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-card/60 hover:text-foreground transition-colors font-medium text-sm"
          >
            <Store size={18} />
            <span>View Storefront</span>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors font-medium text-sm cursor-pointer"
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </form>
        </div>
      </aside>

      {/* MOBILE & FOLDABLES: Floating Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-card/90 backdrop-blur-md flex justify-around items-center h-16 pb-[env(safe-area-inset-bottom)] z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-semibold">{item.name}</span>
            </Link>
          )
        })}
        <Link
          href="/"
          className="flex flex-col items-center justify-center w-full h-full space-y-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Store size={20} />
          <span className="text-[10px] font-semibold">Store</span>
        </Link>
        <form action={logout} className="w-full h-full">
          <button
            type="submit"
            className="flex flex-col items-center justify-center w-full h-full space-y-1 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
          >
            <LogOut size={20} />
            <span className="text-[10px] font-semibold">Exit</span>
          </button>
        </form>
      </nav>
    </>
  )
}