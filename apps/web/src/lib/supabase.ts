import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@balance/core'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
}

export const supabase: SupabaseClient<Database> = createClient<Database>(supabaseUrl, supabasePublishableKey)
