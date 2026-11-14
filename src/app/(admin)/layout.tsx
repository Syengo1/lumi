import '../globals.css'
import { AdminNav } from '@/components/ui/admin-nav'
import { Inter } from 'next/font/google'
import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { connection } from 'next/server'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata = {
  title: 'Admin | Store Management',
}

export const instant = false

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await connection()

  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: store } = await supabase
    .from('stores')
    .select('name, primary_color')
    .eq('id', storeId)
    .maybeSingle()

  return (
    <html
      lang="en"
      style={{
        '--primary': store?.primary_color || '#f97316',
      } as React.CSSProperties}
    >
      <body className={`${inter.variable} font-sans bg-secondary/50 text-foreground antialiased`}>
        <div className="min-h-screen flex flex-col md:flex-row">
          <AdminNav storeName={store?.name || 'Luminous Drip Line'} />
          <main className="flex-1 pb-24 md:pb-12 md:ml-64 min-w-0">
            <div className="p-4 md:p-8 max-w-6xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}