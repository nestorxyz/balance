import { describe, expect, it } from 'vitest'
import { formatCurrency } from './format'

describe('formatCurrency', () => {
  it('formats PEN and USD amounts stored in minor units', () => {
    expect(formatCurrency(438374, 'PEN')).toContain('4,383.74')
    expect(formatCurrency(-10756, 'USD')).toContain('107.56')
  })

  it('does not scale zero-decimal CLP amounts', () => {
    expect(formatCurrency(25018, 'CLP')).toContain('25.018')
  })
})
