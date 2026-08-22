export { formatMoney, parseMoney, moneyToDecimal } from '@balance/core'

export function formatCurrency(amount: number, currency: string = 'PEN'): string {
  const locale = currency === 'PEN' ? 'es-PE' : currency === 'USD' ? 'en-US' : 'es-CL'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'CLP' ? 0 : 2,
    maximumFractionDigits: currency === 'CLP' ? 0 : 2,
  }).format(amount)
}
