type EnvReader = (name: string) => string | undefined

export function resolveSupabaseSecretKey(readEnv: EnvReader): string {
  const hostedKeys = readEnv('SUPABASE_SECRET_KEYS')
  if (hostedKeys) {
    let parsed: unknown
    try {
      parsed = JSON.parse(hostedKeys)
    } catch {
      throw new Error('SUPABASE_SECRET_KEYS must be a valid JSON object')
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('SUPABASE_SECRET_KEYS must be a JSON object')
    }

    const defaultKey = (parsed as Record<string, unknown>).default
    if (typeof defaultKey !== 'string' || !defaultKey) {
      throw new Error('SUPABASE_SECRET_KEYS must contain a non-empty "default" key')
    }
    return defaultKey
  }

  const localKey = readEnv('SUPABASE_SECRET_KEY')
  if (localKey) return localKey

  throw new Error('Missing SUPABASE_SECRET_KEYS or SUPABASE_SECRET_KEY environment variable')
}

export function getSupabaseSecretKey(): string {
  return resolveSupabaseSecretKey((name) => Deno.env.get(name))
}
