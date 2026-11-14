import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ProductCard } from './product-card'
import type { CategoryItem, ProductItem } from '@/lib/inventory/constants'
import {
  ArrowRight,
  Sparkles,
  Smartphone,
  MapPin,
  ShieldCheck,
  Flame,
  Layers,
} from 'lucide-react'

export function HeroSection({
  storeName,
  heroHeadline,
}: {
  storeName: string
  heroHeadline: string
}) {
  return (
    <section className="relative overflow-hidden bg-secondary/50 border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-20 md:py-28 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-8 space-y-6">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
            <Sparkles size={14} /> Official {storeName} Drop
          </span>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.08]">
            {heroHeadline}
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl">
            Curated streetwear, footwear, headwear, and utility bags crafted for statement comfort. Instant M-Pesa STK checkout and GPS-calculated doorstep delivery across Kenya.
          </p>
          <div className="pt-2 flex flex-wrap gap-4">
            <Link href="/shop">
              <Button
                size="lg"
                className="rounded-xl font-bold shadow-lg shadow-primary/20 gap-2 px-7 h-12"
              >
                Explore Full Shop <ArrowRight size={18} />
              </Button>
            </Link>
            <Link href="/shop?offer=true">
              <Button variant="secondary" size="lg" className="rounded-xl font-semibold px-6 h-12">
                View Active Offers
              </Button>
            </Link>
          </div>
        </div>

        <div className="lg:col-span-4 grid grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-2">
            <Smartphone className="text-primary" size={24} />
            <p className="font-bold text-sm">Instant M-Pesa</p>
            <p className="text-xs text-muted-foreground">
              Direct Daraja STK Push prompt sent straight to your phone.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-2">
            <MapPin className="text-primary" size={24} />
            <p className="font-bold text-sm">Pin-Accurate Delivery</p>
            <p className="text-xs text-muted-foreground">
              Fair distance-based rates calculated from your exact map pin.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export function CategoryShowcaseSection({
  categories,
  products,
}: {
  categories: CategoryItem[]
  products: ProductItem[]
}) {
  if (categories.length === 0) return null

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Layers size={14} /> Browse by Category
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Shop by Silhouette
          </h2>
        </div>
        <Link href="/shop" className="text-sm font-semibold text-primary hover:underline">
          All Categories →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {categories.map((cat) => {
          const count = products.filter((p) => p.category_id === cat.id).length
          return (
            <Link
              key={cat.id}
              href={`/shop?category=${cat.id}`}
              className="group p-5 rounded-2xl bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:bg-primary hover:text-primary-foreground transition-all flex flex-col justify-between h-28"
            >
              <span className="font-extrabold text-base tracking-tight">{cat.name}</span>
              <div className="flex items-center justify-between text-xs opacity-75">
                <span>
                  {count} {count === 1 ? 'piece' : 'pieces'}
                </span>
                <ArrowRight
                  size={15}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

export function FeaturedOffersSection({ products }: { products: ProductItem[] }) {
  const featured = products.filter(
    (p) =>
      p.is_featured ||
      (p.offer_price && Number(p.offer_price) > 0 && Number(p.offer_price) < Number(p.price))
  )

  if (featured.length === 0) return null

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-8">
      <div className="flex items-end justify-between mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Flame size={14} /> Limited Offers & Featured Picks
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Featured & On-Offer Drops
          </h2>
        </div>
        <Link href="/shop?offer=true" className="text-sm font-semibold text-primary hover:underline">
          View All Deals →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {featured.slice(0, 4).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}

export function ValuePropsBanner() {
  const perks = [
    {
      icon: Smartphone,
      title: 'Verified M-Pesa Daraja Checkout',
      desc: 'No manual copy-pasting till numbers. Enter your number and approve the STK push PIN prompt.',
    },
    {
      icon: MapPin,
      title: 'Server-Validated GPS Delivery',
      desc: 'Drop your pin on Google Maps at checkout. Delivery fee is transparently calculated per kilometer.',
    },
    {
      icon: ShieldCheck,
      title: 'Authentic Quality & Exact Sizing',
      desc: 'Every hoodie, tee, sneaker, cap, and bag includes detailed size matrices and fit notes.',
    },
  ]

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-8">
      <div className="rounded-3xl bg-secondary/60 p-8 sm:p-10 grid grid-cols-1 md:grid-cols-3 gap-8">
        {perks.map((perk) => {
          const Icon = perk.icon
          return (
            <div key={perk.title} className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-primary text-primary-foreground shrink-0">
                <Icon size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base">{perk.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{perk.desc}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}