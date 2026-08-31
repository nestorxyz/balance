import { describe, expect, it } from 'vitest'
import {
  buildMonthlyFinancialReport,
  monthBounds,
  type ReportAccount,
  type ReportCategory,
  type ReportTransaction,
} from './reports'

const accounts: ReportAccount[] = [
  { id: 'yape', name: 'Yape BCP', type: 'asset', subtype: 'debit', currency: 'PEN', on_budget: true, is_archived: false },
  { id: 'bbva', name: 'BBVA', type: 'asset', subtype: 'debit', currency: 'PEN', on_budget: true, is_archived: false },
  { id: 'card', name: 'Tarjeta Interbank', type: 'liability', subtype: 'credit_card', currency: 'PEN', on_budget: true, is_archived: false },
  { id: 'loan', name: 'Préstamos', type: 'asset', subtype: 'receivable', currency: 'PEN', on_budget: true, is_archived: false },
]

const categories: ReportCategory[] = [
  { id: 'food', name: 'Alimentación', parent_id: null },
  { id: 'income', name: 'Ingresos', parent_id: null },
]

function tx(input: Partial<ReportTransaction> & Pick<ReportTransaction, 'id' | 'account_id' | 'amount' | 'type'>): ReportTransaction {
  return {
    category: null,
    date: '2026-08-22',
    description: '',
    entity: 'personal',
    transfer_to: null,
    ...input,
  }
}

describe('monthly financial reports', () => {
  it('applies refunds as positive account effects and reverses expense journal lines', () => {
    const holding: ReportAccount = { id: 'holding', name: 'Anticipo', type: 'liability', subtype: 'payable', currency: 'PEN', on_budget: true, is_archived: false }
    const transactions = [
      tx({id:'initial',account_id:'yape',type:'income',amount:50000,date:'2026-07-01',category:'income'}),
      tx({id:'received',account_id:'yape',type:'transfer',amount:3000,date:'2026-07-25',transfer_to:'holding'}),
      tx({id:'reserved',account_id:'holding',type:'transfer',amount:-3000,date:'2026-07-25',transfer_to:'yape'}),
      tx({id:'bill',account_id:'yape',type:'expense',amount:10000,category:'food'}),
      tx({id:'applied',account_id:'holding',type:'refund',amount:3000,category:'food'}),
    ]
    const report = buildMonthlyFinancialReport({ month:'2026-08',transactions,accounts:[...accounts,holding],categories })
    expect(report.ledgers.find(l=>l.account.id==='holding')).toMatchObject({openingBalance:-3000,closingBalance:0})
    expect(report.position.netWorth).toBe(43000)
    expect(report.position.totalLiabilities).toBe(0)
    expect(report.cashFlow.totalExpenses).toBe(7000)
    expect(report.journal.find(j=>j.id==='applied')?.lines).toEqual([
      {account:'Anticipo',debit:3000,credit:0},
      {account:'Alimentación',debit:0,credit:3000},
    ])
    const cashRefund = buildMonthlyFinancialReport({month:'2026-08',accounts,categories,transactions:[
      tx({id:'refund',account_id:'yape',type:'refund',amount:8000,category:'food'}),
    ]})
    expect(cashRefund.position.totalAssets).toBe(8000)
  })
  it('validates and calculates calendar month bounds', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(() => monthBounds('2026-13')).toThrow('Invalid report month')
  })

  it('keeps transfers out of cash flow and produces balanced journal entries', () => {
    const transactions: ReportTransaction[] = [
      tx({ id: 'opening-yape', account_id: 'yape', amount: 100, type: 'adjustment', date: '2026-07-31' }),
      tx({ id: 'opening-bbva', account_id: 'bbva', amount: 250, type: 'adjustment', date: '2026-07-31' }),
      tx({ id: 'opening-card', account_id: 'card', amount: -500, type: 'adjustment', date: '2026-07-31' }),
      tx({ id: 'salary', account_id: 'yape', amount: 1000, type: 'income', category: 'income', description: 'Sueldo' }),
      tx({ id: 'food', account_id: 'yape', amount: 300, type: 'expense', category: 'food', description: 'Mercado' }),
      tx({ id: 'loan-out', account_id: 'yape', amount: -400, type: 'transfer', transfer_to: 'loan', description: 'Préstamo' }),
      tx({ id: 'loan-in', account_id: 'loan', amount: 400, type: 'transfer', transfer_to: 'yape', description: 'Préstamo' }),
      tx({ id: 'card-out', account_id: 'bbva', amount: -200, type: 'transfer', transfer_to: 'card', description: 'Pago tarjeta' }),
      tx({ id: 'card-in', account_id: 'card', amount: 200, type: 'transfer', transfer_to: 'bbva', description: 'Pago tarjeta' }),
    ]

    const report = buildMonthlyFinancialReport({ month: '2026-08', transactions, accounts, categories })

    expect(report.cashFlow.totalIncome).toBe(1000)
    expect(report.cashFlow.totalExpenses).toBe(300)
    expect(report.cashFlow.net).toBe(700)
    expect(report.cashFlow.expenses).toEqual([
      { id: 'food', name: 'Alimentación', amount: 300, transactions: 1 },
    ])
    expect(report.journal).toHaveLength(4)
    for (const entry of report.journal) {
      expect(entry.lines.reduce((sum, line) => sum + line.debit, 0)).toBe(entry.amount)
      expect(entry.lines.reduce((sum, line) => sum + line.credit, 0)).toBe(entry.amount)
    }
    expect(report.ledgers.find((ledger) => ledger.account.id === 'yape')?.closingBalance).toBe(400)
    expect(report.ledgers.find((ledger) => ledger.account.id === 'card')?.closingBalance).toBe(-300)
    expect(report.position).toMatchObject({
      totalAssets: 850,
      totalLiabilities: -300,
      netWorth: 550,
    })
  })

  it('keeps repeated identical transfers as separate journal entries', () => {
    const transactions: ReportTransaction[] = [
      tx({ id: 'out-1', account_id: 'bbva', amount: -50, type: 'transfer', transfer_to: 'yape' }),
      tx({ id: 'in-1', account_id: 'yape', amount: 50, type: 'transfer', transfer_to: 'bbva' }),
      tx({ id: 'out-2', account_id: 'bbva', amount: -50, type: 'transfer', transfer_to: 'yape' }),
      tx({ id: 'in-2', account_id: 'yape', amount: 50, type: 'transfer', transfer_to: 'bbva' }),
    ]
    const report = buildMonthlyFinancialReport({ month: '2026-08', transactions, accounts, categories })

    expect(report.journal).toHaveLength(2)
    expect(report.journal.every((entry) => entry.amount === 50)).toBe(true)
  })

  it('uses actual category names and carries opening balances into the ledger', () => {
    const transactions: ReportTransaction[] = [
      tx({ id: 'opening', account_id: 'yape', amount: 500, type: 'adjustment', date: '2026-07-31' }),
      tx({ id: 'expense', account_id: 'yape', amount: 95.8, type: 'expense', category: 'food', description: 'Extras' }),
    ]
    const report = buildMonthlyFinancialReport({ month: '2026-08', transactions, accounts, categories })
    const ledger = report.ledgers.find((item) => item.account.id === 'yape')

    expect(ledger?.openingBalance).toBe(500)
    expect(ledger?.rows[0]).toMatchObject({ category: 'Alimentación', credit: 95.8, balance: 404.2 })
    expect(report.journal[0]?.lines[0]?.account).toBe('Alimentación')
  })
})
