import { describe, expect, it } from 'vitest'
import { scheduledCloseMonths } from './monthly-closes'

describe('scheduledCloseMonths', () => {
  it('prepares the current month from the 28th', () => {
    expect(scheduledCloseMonths(new Date(2026, 7, 28))).toEqual(['2026-08'])
  })

  it('keeps the previous month visible during the three-day grace window', () => {
    expect(scheduledCloseMonths(new Date(2026, 8, 2))).toEqual(['2026-08'])
  })

  it('handles the year boundary and stays quiet mid-month', () => {
    expect(scheduledCloseMonths(new Date(2027, 0, 1))).toEqual(['2026-12'])
    expect(scheduledCloseMonths(new Date(2026, 7, 15))).toEqual([])
  })
})
