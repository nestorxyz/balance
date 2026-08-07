import { formatMoney } from '@balance/core'

export function formatCLP(amount: number): string {
  return formatMoney(amount)
}

export function padRight(text: string, width: number): string {
  if (text.length >= width) return text
  return text + ' '.repeat(width - text.length)
}

export function padLeft(text: string, width: number): string {
  if (text.length >= width) return text
  return ' '.repeat(width - text.length) + text
}
