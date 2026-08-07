/**
 * Money helpers.
 *
 * All money crossing the TypeScript boundary is a safe integer number of minor
 * units (hundredths). Rates and percentages are deliberately not minor units.
 */

export interface ParseMoneyOptions {
  allowNegative?: boolean
  allowZero?: boolean
}

/** Parse a locale-aware decimal amount without passing through floating point. */
export function parseMoney(raw: string, options: ParseMoneyOptions = {}): number {
  let value = raw.trim()
  if (!value) throw new Error(`invalid amount: ${raw}`)

  let sign = 1
  if (value[0] === '+' || value[0] === '-') {
    if (value[0] === '-') sign = -1
    value = value.slice(1)
  }
  if (!value || /[^\d.,]/.test(value)) throw new Error(`invalid amount: ${raw}`)
  if (sign < 0 && !options.allowNegative) throw new Error(`invalid amount: ${raw}`)

  const dots = [...value.matchAll(/\./g)].map((m) => m.index)
  const commas = [...value.matchAll(/,/g)].map((m) => m.index)
  let decimalIndex = -1

  if (dots.length && commas.length) {
    decimalIndex = Math.max(dots.at(-1)!, commas.at(-1)!)
    if (value.length - decimalIndex - 1 > 2) throw new Error(`invalid amount: ${raw}`)
  } else {
    const separators = dots.length ? dots : commas
    if (separators.length === 1) {
      const digitsAfter = value.length - separators[0]! - 1
      if (digitsAfter === 1 || digitsAfter === 2) decimalIndex = separators[0]!
      else if (digitsAfter !== 3) throw new Error(`invalid amount: ${raw}`)
    } else if (separators.length > 1) {
      // Repeated separators are thousands grouping only.
      const separator = dots.length ? '.' : ','
      if (!new RegExp(`^\\d{1,3}(?:\\${separator}\\d{3})+$`).test(value)) {
        throw new Error(`invalid amount: ${raw}`)
      }
    }
  }

  const integerRaw = decimalIndex < 0 ? value : value.slice(0, decimalIndex)
  const fractionRaw = decimalIndex < 0 ? '' : value.slice(decimalIndex + 1)
  const integerDigits = integerRaw.replace(/[.,]/g, '') || '0'
  if (!/^\d+$/.test(integerDigits) || !/^\d{1,2}$|^$/.test(fractionRaw)) {
    throw new Error(`invalid amount: ${raw}`)
  }

  // Any separator before the decimal separator must be correctly grouped.
  if (/[.,]/.test(integerRaw)) {
    const grouping = integerRaw.includes('.') ? '.' : ','
    if (integerRaw.includes(grouping === '.' ? ',' : '.') ||
        !new RegExp(`^\\d{1,3}(?:\\${grouping}\\d{3})+$`).test(integerRaw)) {
      throw new Error(`invalid amount: ${raw}`)
    }
  }

  const minor = Number(integerDigits) * 100 + Number(fractionRaw.padEnd(2, '0') || 0)
  const result = sign * minor
  if (!Number.isSafeInteger(result) || (!options.allowZero && result === 0)) {
    throw new Error(`invalid amount: ${raw}`)
  }
  return result
}

/** Exact, locale-independent representation for JSON, CSV, and APIs. */
export function moneyToDecimal(minorUnits: number): string {
  assertMinorUnits(minorUnits)
  const sign = minorUnits < 0 ? '-' : ''
  const absolute = Math.abs(minorUnits)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}

/** Human display using the requested locale, omitting a zero fractional part. */
export function formatMoney(minorUnits: number, currency = 'CLP', locale = 'es-CL'): string {
  assertMinorUnits(minorUnits)
  const fraction = Math.abs(minorUnits) % 100
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fraction === 0 ? 0 : 2,
    maximumFractionDigits: fraction === 0 ? 0 : 2,
  }).format(minorUnits / 100)
}

export function assertMinorUnits(value: number): void {
  if (!Number.isSafeInteger(value)) throw new Error(`money must be safe integer minor units: ${value}`)
}

/** Half-up rounding for a computed monetary value. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) throw new Error(`invalid monetary calculation: ${value}`)
  const rounded = value < 0 ? -Math.floor(-value + 0.5) : Math.floor(value + 0.5)
  assertMinorUnits(rounded)
  return rounded
}

/** Convert USD minor units to CLP minor units at a major-unit exchange rate. */
export function usdToClp(usdMinorUnits: number, exchangeRate: number): number {
  assertMinorUnits(usdMinorUnits)
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error(`exchange rate must be positive: ${exchangeRate}`)
  }
  return roundMoney(usdMinorUnits * exchangeRate)
}

/** @deprecated Use parseMoney. Returns USD minor units. */
export function parseUsdAmount(raw: string): number {
  return parseMoney(raw)
}
