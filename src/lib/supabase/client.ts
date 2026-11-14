import { createBrowserClient } from '@supabase/ssr'
import { getStoreId } from './config'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          'x-store-id': getStoreId(),
        },
      },
    }
  )
}