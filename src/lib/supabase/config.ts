// Default UUID seeded for Luminous Drip Line
const DEFAULT_STORE_ID = '00000000-0000-0000-0000-000000000001'

export function getStoreId(): string {
  const envId = process.env.NEXT_PUBLIC_STORE_ID?.trim()
  return envId && envId.length === 36 ? envId : DEFAULT_STORE_ID
}