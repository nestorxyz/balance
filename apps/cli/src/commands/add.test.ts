import { describe, expect, it } from 'vitest'
import { parseAmount } from './add'

describe('parseAmount', () => {
  it('parses plain integers', () => {
    expect(parseAmount('8000')).toBe(800000)
  })

  it('strips dot thousands separators', () => {
    expect(parseAmount('8.000')).toBe(800000)
    expect(parseAmount('1.234.567')).toBe(123456700)
  })

  it('accepts comma thousands and decimal amounts', () => {
    expect(parseAmount('8,000')).toBe(800000)
    expect(parseAmount('8.50')).toBe(850)
    expect(parseAmount('8,50')).toBe(850)
  })

  it('returns absolute value for negatives', () => {
    expect(parseAmount('-500')).toBe(50000)
  })

  it('throws on zero', () => {
    expect(() => parseAmount('0')).toThrow(/invalid amount/)
  })

  it('throws on non-numeric input', () => {
    expect(() => parseAmount('abc')).toThrow(/invalid amount/)
    expect(() => parseAmount('')).toThrow(/invalid amount/)
    expect(() => parseAmount('1.2345')).toThrow(/invalid amount/)
  })
})
