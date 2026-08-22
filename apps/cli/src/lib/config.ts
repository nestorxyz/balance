import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

interface BackendConfig {
  supabase_url: string
  supabase_publishable_key: string
}

export function getConfigPath(): string {
  return process.env.BAL_CONFIG_FILE ?? join(homedir(), '.balance', 'config.json')
}

function loadBackendConfig(): Partial<BackendConfig> {
  const path = getConfigPath()
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf8')) as Partial<BackendConfig>
}

export function loadBackendConfigIntoEnv(): void {
  const config = loadBackendConfig()
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL && config.supabase_url) {
    process.env.SUPABASE_URL = config.supabase_url
  }
  if (
    !process.env.SUPABASE_PUBLISHABLE_KEY
    && !process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    && config.supabase_publishable_key
  ) {
    process.env.SUPABASE_PUBLISHABLE_KEY = config.supabase_publishable_key
  }
}

export function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL
    ?? process.env.VITE_SUPABASE_URL
    ?? loadBackendConfig().supabase_url
  if (!url) throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) env var')
  return url
}

export function getSupabasePublishableKey(): string {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
    ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ?? loadBackendConfig().supabase_publishable_key
  if (!key) {
    throw new Error(
      'Missing SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) env var',
    )
  }
  return key
}

export async function saveBackendConfig(config: BackendConfig): Promise<void> {
  const path = getConfigPath()
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, JSON.stringify(config, null, 2), { mode: 0o600 })
  await chmod(path, 0o600)
}

export function getSessionPath(): string {
  const custom = process.env.BAL_SESSION_FILE
  if (custom) return custom
  return join(homedir(), '.balance', 'session.json')
}
