import { stringifyMoneyJson } from '@balance/core'

/** CLI machine output: money is always an exact two-place decimal string. */
export function stringifyJson(value: unknown, replacerOrSpace?: null | number, space?: number): string {
  return stringifyMoneyJson(value, typeof replacerOrSpace === 'number' ? replacerOrSpace : space)
}
