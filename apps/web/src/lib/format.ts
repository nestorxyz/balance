export { formatMoney, parseMoney, moneyToDecimal } from '@balance/core'

export function formatCurrency(minorAmount: number, currency: string = 'PEN'): string {
  const locale = currency === 'PEN' ? 'es-PE' : currency === 'USD' ? 'en-US' : 'es-CL'
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'CLP' ? 0 : 2,
    maximumFractionDigits: currency === 'CLP' ? 0 : 2,
  })
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits
    ?? (currency === 'CLP' ? 0 : 2)

  return formatter.format(minorAmount / 10 ** fractionDigits)
}
