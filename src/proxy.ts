import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getStoreId } from '@/lib/supabase/config'

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/inventory') ||
    pathname.startsWith('/settings') ||
    pathname === '/orders'

  const isLoginRoute = pathname === '/login'

  // Fast-path public storefront routes & server actions so they don't pay auth round-trip latency
  if (!isProtectedRoute && !isLoginRoute) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })
  const storeId = getStoreId()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          'x-store-id': storeId,
        },
      },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (isProtectedRoute) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('store_id', storeId)
      .maybeSingle()

    if (roleData?.role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  if (isLoginRoute && user) {
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('store_id', storeId)
      .maybeSingle()

    if (roleData?.role === 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}