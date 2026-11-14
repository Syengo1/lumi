'use server'

import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Please provide both email and password.' }
  }

  const supabase = await createClient()
  const storeId = getStoreId()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    return { error: 'Invalid credentials. Please try again.' }
  }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', data.user.id)
    .eq('store_id', storeId)
    .maybeSingle()

  if (roleData?.role !== 'admin') {
    await supabase.auth.signOut()
    return { error: 'Access denied. You do not have administrator privileges for this store.' }
  }

  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}