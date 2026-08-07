import { describe, expect, it } from 'vitest'
import { formatMoney, moneyToDecimal, parseMoney, roundMoney, usdToClp } from './money'

describe('parseMoney', () => {
  it.each([
    ['1234.56', 123456], ['1,234.56', 123456], ['1234,56', 123456],
    ['1.234,56', 123456], ['1.234', 123400], ['1,234', 123400],
    ['.01', 1], ['0,10', 10], ['  0.99 ', 99],
  ])('parses %s', (raw, expected) => expect(parseMoney(raw)).toBe(expected))

  it('supports signed values only when requested', () => {
    expect(parseMoney('-12.34', { allowNegative: true })).toBe(-1234)
    expect(() => parseMoney('-12.34')).toThrow()
  })

  it.each(['', '0', '1.2.3', '12,34,56', '1.2345', '1,23.45', 'abc'])('rejects %s', (raw) => {
    expect(() => parseMoney(raw)).toThrow(/invalid amount/)
  })

  it('rejects unsafe minor units', () => {
    expect(() => parseMoney('90071992547409.92')).toThrow()
  })
})

describe('money output', () => {
  it.each([[0, '0.00'], [1, '0.01'], [10, '0.10'], [123450, '1234.50'], [-99, '-0.99']])(
    'serializes %s exactly', (minor, output) => expect(moneyToDecimal(minor)).toBe(output),
  )
  it('omits zero cents in human output and retains non-zero cents', () => {
    expect(formatMoney(123400)).toMatch(/1\.234/)
    expect(formatMoney(123400)).not.toMatch(/,00/)
    expect(formatMoney(123450)).toMatch(/1\.234,50/)
  })
})

describe('computed money', () => {
  it('uses half-up rounding', () => {
    expect(roundMoney(1.5)).toBe(2)
    expect(roundMoney(-1.5)).toBe(-2)
  })
  it('promotes USD cents to CLP minor units', () => {
    expect(usdToClp(849, 916)).toBe(777684)
  })
})
