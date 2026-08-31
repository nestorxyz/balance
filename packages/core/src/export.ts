import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { moneyToDecimal } from './money'

type TypedClient = SupabaseClient<Database>

interface ExportData {
  exported_at: string
  tables: {
    accounts: Record<string, unknown>[]
    transactions: Record<string, unknown>[]
    debts: Record<string, unknown>[]
    categories: Record<string, unknown>[]
    snapshots: Record<string, unknown>[]
    recurring_charges: Record<string, unknown>[]
    shared_contributions: Record<string, unknown>[]
    contribution_events: Record<string, unknown>[]
  }
}

export async function exportAllData(client: TypedClient): Promise<ExportData> {
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('No authenticated user')

  const [accounts, transactions, debts, categories, snapshots, recurring, contributions, contributionEvents] = await Promise.all([
    client.from('accounts').select('*'),
    client.from('transactions').select('*').order('date', { ascending: false }),
    client.from('debts').select('*'),
    client.from('categories').select('*').or(`user_id.eq.${user.id},user_id.is.null`),
    client.from('snapshots').select('*'),
    client.from('recurring_charges').select('*'),
    client.from('shared_contributions').select('*'),
    client.from('contribution_events').select('*'),
  ])

  const results = [accounts, transactions, debts, categories, snapshots, recurring, contributions, contributionEvents]
  for (const result of results) {
    if (result.error) throw new Error(`Export failed: ${(result.error as { message: string }).message}`)
  }

  return {
    exported_at: new Date().toISOString(),
    tables: {
      accounts: (accounts.data ?? []) as Record<string, unknown>[],
      transactions: (transactions.data ?? []) as Record<string, unknown>[],
      debts: (debts.data ?? []) as Record<string, unknown>[],
      categories: (categories.data ?? []) as Record<string, unknown>[],
      snapshots: (snapshots.data ?? []) as Record<string, unknown>[],
      recurring_charges: (recurring.data ?? []) as Record<string, unknown>[],
      shared_contributions: (contributions.data ?? []) as Record<string, unknown>[],
      contribution_events: (contributionEvents.data ?? []) as Record<string, unknown>[],
    },
  }
}

const MONEY_FIELDS = new Set([
  'amount', 'bill_amount', 'balance', 'credit_limit', 'total_amount', 'installment_amount',
  'last_installment_amount', 'remaining_amount', 'statement_balance',
  'net_worth', 'position', 'accumulated', 'delta', 'net', 'neto', 'iva',
  'paid_amount', 'f29_total', 'monthly_income', 'monthly_expenses',
  'monthly_profit', 'iva_debito', 'iva_credito', 'iva_neto', 'ppm',
  'remanente_anterior', 'remanente_siguiente',
])

/** Recursively serialize known monetary fields as exact two-place decimals. */
export function serializeMoneyFields(value: unknown, field?: string): unknown {
  if (typeof value === 'number' && field && MONEY_FIELDS.has(field)) return moneyToDecimal(value)
  if (Array.isArray(value)) return value.map((item) => serializeMoneyFields(item))
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(Object.entries(record).map(([key, item]) => {
      // `total` is also commonly a count. It is money only in invoice/amount rows.
      const moneyField = key === 'total' && ('net' in record || 'neto' in record || 'iva' in record || 'amount' in record)
      return [key, serializeMoneyFields(item, moneyField ? 'amount' : key)]
    }))
  }
  return value
}

export function stringifyMoneyJson(value: unknown, space?: number): string {
  return JSON.stringify(serializeMoneyFields(value), null, space)
}

export function exportTableAsCsv(data: Record<string, unknown>[], _tableName: string): string {
  if (data.length === 0) return ''

  const firstRow = data[0]
  if (!firstRow) return ''

  const headers = Object.keys(firstRow)
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = serializeMoneyFields(row[h], h)
      if (val === null || val === undefined) return ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(','),
  )

  return [headers.join(','), ...rows].join('\n')
}

export function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
