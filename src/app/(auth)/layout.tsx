import '../globals.css'
import { Inter } from 'next/font/google'
import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { connection } from 'next/server'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata = {
  title: 'Admin Login | Luminous Drip Line',
}

export const instant = false

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await connection()

  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: store } = await supabase
    .from('stores')
    .select('primary_color')
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
        {children}
      </body>
    </html>
  )
}