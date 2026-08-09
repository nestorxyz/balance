import { afterEach, describe, expect, it } from 'vitest'
import { getSupabasePublishableKey } from './config'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('getSupabasePublishableKey', () => {
  it('reads SUPABASE_PUBLISHABLE_KEY', () => {
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_node'
    expect(getSupabasePublishableKey()).toBe('sb_publishable_node')
  })

  it('accepts the Vite-prefixed new key as a fallback', () => {
    delete process.env.SUPABASE_PUBLISHABLE_KEY
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vite'
    expect(getSupabasePublishableKey()).toBe('sb_publishable_vite')
  })

  it('rejects legacy-only configuration', () => {
    delete process.env.SUPABASE_PUBLISHABLE_KEY
    delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    process.env.SUPABASE_ANON_KEY = 'legacy-anon-key'
    expect(() => getSupabasePublishableKey()).toThrow('Missing SUPABASE_PUBLISHABLE_KEY')
  })
})
