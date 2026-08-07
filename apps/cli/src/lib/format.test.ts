import { describe, expect, it } from 'vitest'
import { formatCLP, padLeft, padRight } from './format'

describe('formatCLP', () => {
  it('formats integer amounts without decimals', () => {
    const out = formatCLP(800000)
    expect(out).toMatch(/8[.\s ]000/)
    expect(out).toContain('$')
  })

  it('formats zero', () => {
    const out = formatCLP(0)
    expect(out).toContain('0')
    expect(out).toContain('$')
  })

  it('formats negative amounts', () => {
    const out = formatCLP(-150000)
    expect(out).toMatch(/1[.\s ]500/)
    expect(out).toMatch(/[-−]/)
  })

  it('shows fractional minor units', () => {
    expect(formatCLP(123450)).toMatch(/1[.\s ]234,50/)
  })
})

describe('padRight / padLeft', () => {
  it('pads right to width', () => {
    expect(padRight('abc', 5)).toBe('abc  ')
  })

  it('pads left to width', () => {
    expect(padLeft('abc', 5)).toBe('  abc')
  })

  it('returns text unchanged when already >= width', () => {
    expect(padRight('abcdef', 5)).toBe('abcdef')
    expect(padLeft('abcdef', 5)).toBe('abcdef')
  })
})
