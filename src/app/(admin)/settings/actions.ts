'use server'

import { createClient } from '@/lib/supabase/server'
import { getStoreId } from '@/lib/supabase/config'
import { revalidatePath } from 'next/cache'

export async function updateStoreSettings(formData: FormData) {
  const supabase = await createClient()
  const storeId = getStoreId()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Authentication required.')

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('store_id', storeId)
    .maybeSingle()

  if (roleData?.role !== 'admin') {
    throw new Error('Unauthorized.')
  }

  const name = (formData.get('name') as string)?.trim() || 'Luminous Drip Line'
  const primary_color = (formData.get('primary_color') as string)?.trim() || '#f97316'
  const hero_banner_text = (formData.get('hero_banner_text') as string)?.trim()
  const contact_email = (formData.get('contact_email') as string)?.trim()

  const origin_address = (formData.get('origin_address') as string)?.trim() || 'Nairobi CBD, Kenya'
  const origin_lat = parseFloat((formData.get('origin_lat') as string) || '-1.286389')
  const origin_lng = parseFloat((formData.get('origin_lng') as string) || '36.817223')
  const base_delivery_fee = Math.max(0, parseFloat((formData.get('base_delivery_fee') as string) || '150'))
  const delivery_fee_per_km = Math.max(0, parseFloat((formData.get('delivery_fee_per_km') as string) || '35'))
  const min_delivery_fee = Math.max(0, parseFloat((formData.get('min_delivery_fee') as string) || '200'))
  const max_delivery_fee = Math.max(0, parseFloat((formData.get('max_delivery_fee') as string) || '1500'))
  const free_delivery_threshold = Math.max(
    0,
    parseFloat((formData.get('free_delivery_threshold') as string) || '15000')
  )

  const { error } = await supabase
    .from('stores')
    .update({
      name,
      primary_color,
      hero_banner_text,
      contact_email,
      origin_address,
      origin_lat: Number.isFinite(origin_lat) ? origin_lat : -1.286389,
      origin_lng: Number.isFinite(origin_lng) ? origin_lng : 36.817223,
      base_delivery_fee,
      delivery_fee_per_km,
      min_delivery_fee,
      max_delivery_fee,
      free_delivery_threshold,
    })
    .eq('id', storeId)

  if (error) {
    throw new Error(`Failed to update settings: ${error.message}`)
  }

  revalidatePath('/', 'layout')
  revalidatePath('/settings')
  revalidatePath('/dashboard')
  revalidatePath('/orders')
  revalidatePath('/checkout')
}