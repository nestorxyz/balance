import { describe, expect, it } from 'vitest'
import { formatError } from './exit'

describe('formatError', () => {
  it('formats Error instances and strings', () => {
    expect(formatError(new Error('boom'))).toBe('boom')
    expect(formatError('plain')).toBe('plain')
  })

  it('formats structured Supabase errors', () => {
    expect(formatError({
      message: 'function is ambiguous',
      code: 'PGRST203',
      details: 'multiple candidates',
      hint: 'rename a function',
    })).toBe('function is ambiguous | code: PGRST203 | multiple candidates | rename a function')
  })
})
