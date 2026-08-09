import { homedir } from 'node:os'
import { join } from 'node:path'

export function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  if (!url) throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) env var')
  return url
}

export function getSupabasePublishableKey(): string {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!key) {
    throw new Error(
      'Missing SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) env var',
    )
  }
  return key
}

export function getSessionPath(): string {
  const custom = process.env.BAL_SESSION_FILE
  if (custom) return custom
  return join(homedir(), '.balance', 'session.json')
}
