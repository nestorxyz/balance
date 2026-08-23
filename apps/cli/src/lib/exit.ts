export function fail(message: string, code = 1): never {
  process.stderr.write(`error: ${message}\n`)
  process.exit(code)
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error

  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>
    const message = typeof value.message === 'string' ? value.message : null
    const code = typeof value.code === 'string' ? value.code : null
    const details = typeof value.details === 'string' ? value.details : null
    const hint = typeof value.hint === 'string' ? value.hint : null
    const parts = [message, code && `code: ${code}`, details, hint].filter(Boolean)
    if (parts.length > 0) return parts.join(' | ')

    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }

  return String(error)
}
