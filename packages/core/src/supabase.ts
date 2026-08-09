import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

export type { SupabaseClient }
export type { Database }

export function createSupabaseClient(options?: { accessToken?: string }) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY environment variables')
  }

  return createClient<Database>(url, key, options?.accessToken
    ? { global: { headers: { Authorization: `Bearer ${options.accessToken}` } } }
    : undefined
  )
}
