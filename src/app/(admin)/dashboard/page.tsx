import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Package, CheckCircle2, AlertTriangle, Wallet, Plus, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { connection } from 'next/server'

export const instant = false

export default async function DashboardPage() {
  await connection()

  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  const allProducts = products || []
  const totalProducts = allProducts.length
  const activeProducts = allProducts.filter((p) => p.is_active).length
  const lowStockProducts = allProducts.filter((p) => (p.stock_count ?? 0) <= 3).length
  const totalCatalogValue = allProducts.reduce(
    (sum, p) => sum + Number(p.price || 0) * Math.max(Number(p.stock_count ?? 0), 0),
    0
  )

  const stats = [
    {
      label: 'Total Inventory Value',
      value: `KES ${totalCatalogValue.toLocaleString()}`,
      subtext: 'Based on available units in stock',
      icon: Wallet,
    },
    {
      label: 'Total Products',
      value: totalProducts.toString(),
      subtext: 'Items in catalog',
      icon: Package,
    },
    {
      label: 'Active on Storefront',
      value: activeProducts.toString(),
      subtext: `${totalProducts - activeProducts} saved as draft`,
      icon: CheckCircle2,
    },
    {
      label: 'Low Stock Items',
      value: lowStockProducts.toString(),
      subtext: '3 or fewer units left',
      icon: AlertTriangle,
    },
  ]

  return (
    <div className="space-y-8 pt-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-muted-foreground">
            Real-time snapshot of your store inventory and catalog health.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="secondary" className="rounded-xl font-medium">
              Customize Branding
            </Button>
          </Link>
          <Link href="/inventory/new">
            <Button className="gap-2 rounded-xl font-medium shadow-md shadow-primary/20">
              <Plus size={16} />
              New Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card
              key={stat.label}
              className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </span>
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    <Icon size={18} />
                  </div>
                </div>
                <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.subtext}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Recent Additions */}
      <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card rounded-2xl">
        <CardHeader className="px-6 pt-6 pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Recent Products</CardTitle>
            <p className="text-xs text-muted-foreground">Latest items added to your catalog</p>
          </div>
          <Link
            href="/inventory"
            className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            View All <ArrowUpRight size={15} />
          </Link>
        </CardHeader>
        <CardContent className="p-6">
          {allProducts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Your inventory is currently empty.</p>
              <Link href="/inventory/new" className="inline-block mt-4">
                <Button size="sm" className="rounded-xl">Add Your First Product</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {allProducts.slice(0, 5).map((product) => (
                <div key={product.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    {product.image_urls?.[0] ? (
                      <Image
                        src={product.image_urls[0]}
                        alt={product.title}
                        width={48}
                        height={48}
                        className="w-12 h-12 rounded-xl object-cover bg-secondary shrink-0"
                        unoptimized
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-xs text-muted-foreground shrink-0">
                        No Img
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{product.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Stock: {product.stock_count ?? 0} units
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="font-semibold text-sm">
                      KES {Number(product.price).toLocaleString()}
                    </span>
                    <Link href={`/inventory/${product.id}/edit`}>
                      <Button variant="secondary" size="sm" className="rounded-xl">
                        Edit
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}