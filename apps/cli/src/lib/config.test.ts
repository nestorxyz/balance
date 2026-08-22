import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  loadBackendConfigIntoEnv,
  saveBackendConfig,
} from './config'

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
    process.env.BAL_CONFIG_FILE = join(tmpdir(), 'balance-config-missing.json')
    delete process.env.SUPABASE_PUBLISHABLE_KEY
    delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    process.env.SUPABASE_ANON_KEY = 'legacy-anon-key'
    expect(() => getSupabasePublishableKey()).toThrow('Missing SUPABASE_PUBLISHABLE_KEY')
  })
})

describe('persisted backend config', () => {
  it('is used when environment variables are absent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'balance-config-'))
    const path = join(dir, 'config.json')
    process.env.BAL_CONFIG_FILE = path
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_PUBLISHABLE_KEY
    delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY

    await saveBackendConfig({
      supabase_url: 'https://example.supabase.co',
      supabase_publishable_key: 'sb_publishable_saved',
    })

    expect(getSupabaseUrl()).toBe('https://example.supabase.co')
    expect(getSupabasePublishableKey()).toBe('sb_publishable_saved')
    loadBackendConfigIntoEnv()
    expect(process.env.SUPABASE_URL).toBe('https://example.supabase.co')
    expect(process.env.SUPABASE_PUBLISHABLE_KEY).toBe('sb_publishable_saved')
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      supabase_url: 'https://example.supabase.co',
      supabase_publishable_key: 'sb_publishable_saved',
    })

    await rm(dir, { recursive: true })
  })
})
