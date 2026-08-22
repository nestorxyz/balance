import { useState } from 'react'
import type {
  AccountLedger,
  CashFlowCategory,
  FinancialPositionItem,
  MonthlyFinancialReport,
} from '@balance/core'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'

type ReportView = 'diario' | 'mayor' | 'flujo' | 'situacion'

const VIEWS: Array<{ id: ReportView; label: string; description: string }> = [
  { id: 'diario', label: 'Libro diario', description: 'Cada operación con su debe y haber' },
  { id: 'mayor', label: 'Libro mayor', description: 'Saldos y movimientos por cuenta' },
  { id: 'flujo', label: 'Flujo de caja', description: 'Ingresos y gastos reales del mes' },
  { id: 'situacion', label: 'Situación financiera', description: 'Activos, pasivos y patrimonio al cierre' },
]

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' })
    .format(new Date(`${date}T12:00:00`))
}

function Money({ value, currency = 'PEN', className }: { value: number; currency?: string; className?: string }) {
  return <span className={cn('font-mono tabular-nums', className)}>{formatCurrency(value, currency)}</span>
}

function EmptyReport({ children }: { children: string }) {
  return (
    <div className="rounded-md border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function JournalReport({ report }: { report: MonthlyFinancialReport }) {
  if (report.journal.length === 0) return <EmptyReport>No hay asientos en este mes.</EmptyReport>

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="hidden grid-cols-[90px_minmax(180px,1fr)_minmax(160px,1fr)_130px_130px] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
        <span>Fecha</span><span>Descripción</span><span>Cuenta</span><span className="text-right">Debe</span><span className="text-right">Haber</span>
      </div>
      {report.journal.map((entry, index) => (
        <div key={entry.id} className={cn(index > 0 && 'border-t border-border')}>
          {entry.lines.map((line, lineIndex) => (
            <div key={`${entry.id}-${line.account}-${lineIndex}`} className="grid grid-cols-[72px_minmax(0,1fr)_110px] gap-2 px-4 py-2.5 text-sm md:grid-cols-[90px_minmax(180px,1fr)_minmax(160px,1fr)_130px_130px] md:gap-3">
              <span className="text-muted-foreground">{lineIndex === 0 ? formatDate(entry.date) : ''}</span>
              <span className={cn('truncate', lineIndex > 0 && 'text-muted-foreground md:pl-4')}>
                {lineIndex === 0 ? entry.description : ''}
              </span>
              <span className="truncate text-right text-muted-foreground md:text-left">{line.account}</span>
              <span className="hidden text-right md:block">{line.debit ? <Money value={line.debit} /> : '—'}</span>
              <span className="hidden text-right md:block">{line.credit ? <Money value={line.credit} /> : '—'}</span>
              <span className="col-span-3 flex justify-end gap-3 text-xs md:hidden">
                {line.debit > 0 ? <>Debe <Money value={line.debit} /></> : <>Haber <Money value={line.credit} /></>}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function LedgerTable({ ledger }: { ledger: AccountLedger }) {
  const currency = ledger.account.currency
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Saldo inicial" value={ledger.openingBalance} currency={currency} />
        <Metric label="Débitos / Créditos" value={ledger.totalDebits - ledger.totalCredits} currency={currency} />
        <Metric label="Saldo final" value={ledger.closingBalance} currency={currency} strong />
      </div>
      {ledger.rows.length === 0 ? <EmptyReport>Sin movimientos en esta cuenta durante el mes.</EmptyReport> : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2 text-left">Fecha</th><th className="px-4 py-2 text-left">Detalle</th><th className="px-4 py-2 text-right">Debe</th><th className="px-4 py-2 text-right">Haber</th><th className="px-4 py-2 text-right">Saldo</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ledger.rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(row.date)}</td>
                  <td className="px-4 py-2.5"><p>{row.description}</p><p className="text-xs text-muted-foreground">{row.category}</p></td>
                  <td className="px-4 py-2.5 text-right">{row.debit ? <Money value={row.debit} currency={currency} /> : '—'}</td>
                  <td className="px-4 py-2.5 text-right">{row.credit ? <Money value={row.credit} currency={currency} /> : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-medium"><Money value={row.balance} currency={currency} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LedgerReport({ report }: { report: MonthlyFinancialReport }) {
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const ledger = report.ledgers.find((item) => item.account.id === selectedAccountId) ?? report.ledgers[0]
  if (!ledger) return <EmptyReport>No hay cuentas con movimientos o saldo en este mes.</EmptyReport>

  return (
    <div className="space-y-4">
      <label className="block max-w-sm">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Cuenta</span>
        <select value={ledger.account.id} onChange={(event) => setSelectedAccountId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
          {report.ledgers.map((item) => <option key={item.account.id} value={item.account.id}>{item.account.name}</option>)}
        </select>
      </label>
      <LedgerTable ledger={ledger} />
    </div>
  )
}

function CashFlowGroup({ title, categories, total, tone }: { title: string; categories: CashFlowCategory[]; total: number; tone: 'income' | 'expense' }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="font-medium">{title}</h3>
        <Money value={total} className={tone === 'income' ? 'text-emerald-600' : 'text-red-600'} />
      </div>
      <div className="divide-y divide-border">
        {categories.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">Sin movimientos</p> : categories.map((category) => (
          <div key={category.id} className="flex items-center justify-between px-5 py-3">
            <div><p className="text-sm">{category.name}</p><p className="text-xs text-muted-foreground">{category.transactions} {category.transactions === 1 ? 'movimiento' : 'movimientos'}</p></div>
            <Money value={category.amount} />
          </div>
        ))}
      </div>
    </section>
  )
}

function CashFlowReport({ report }: { report: MonthlyFinancialReport }) {
  const { cashFlow } = report
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Ingresos" value={cashFlow.totalIncome} tone="positive" />
        <Metric label="Gastos" value={cashFlow.totalExpenses} tone="negative" />
        <Metric label="Flujo neto" value={cashFlow.net} strong tone={cashFlow.net >= 0 ? 'positive' : 'negative'} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CashFlowGroup title="Ingresos" categories={cashFlow.income} total={cashFlow.totalIncome} tone="income" />
        <CashFlowGroup title="Gastos" categories={cashFlow.expenses} total={cashFlow.totalExpenses} tone="expense" />
      </div>
      <p className="text-xs text-muted-foreground">Las transferencias entre tus cuentas, pagos de tarjeta y préstamos por cobrar no se consideran ingresos ni gastos.</p>
    </div>
  )
}

function PositionGroup({ title, items, total }: { title: string; items: FinancialPositionItem[]; total: number }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3"><h3 className="font-medium">{title}</h3><Money value={total} /></div>
      <div className="divide-y divide-border">
        {items.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">Sin saldos</p> : items.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-5 py-3 text-sm">
            <div><p>{item.name}</p><p className="text-xs capitalize text-muted-foreground">{item.subtype.replace('_', ' ')}</p></div>
            <Money value={item.balance} currency={item.currency} />
          </div>
        ))}
      </div>
    </section>
  )
}

function FinancialPositionReport({ report }: { report: MonthlyFinancialReport }) {
  const { position } = report
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Patrimonio al cierre</p>
        <Money value={position.netWorth} className={cn('mt-1 text-3xl font-semibold', position.netWorth < 0 ? 'text-red-600' : 'text-emerald-600')} />
        <p className="mt-2 text-xs text-muted-foreground">Activos + pasivos con signo = patrimonio</p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PositionGroup title="Activos" items={position.assets} total={position.totalAssets} />
        <PositionGroup title="Pasivos" items={position.liabilities} total={position.totalLiabilities} />
      </div>
    </div>
  )
}

function Metric({ label, value, currency = 'PEN', strong = false, tone }: { label: string; value: number; currency?: string; strong?: boolean; tone?: 'positive' | 'negative' }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Money value={value} currency={currency} className={cn('mt-1 block text-xl', strong && 'font-semibold', tone === 'positive' && 'text-emerald-600', tone === 'negative' && 'text-red-600')} />
    </div>
  )
}

export function FinancialReports({ report }: { report: MonthlyFinancialReport }) {
  const [view, setView] = useState<ReportView>('flujo')
  const activeView = VIEWS.find((item) => item.id === view) ?? VIEWS[0]!

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {VIEWS.map((item) => (
          <button key={item.id} type="button" onClick={() => setView(item.id)} className={cn('rounded-md border px-4 py-3 text-left transition-colors', view === item.id ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:bg-muted/50')}>
            <span className="block text-sm font-medium">{item.label}</span>
            <span className={cn('mt-0.5 hidden text-xs sm:block', view === item.id ? 'text-background/70' : 'text-muted-foreground')}>{item.description}</span>
          </button>
        ))}
      </div>
      <div>
        <h2 className="text-lg font-semibold">{activeView.label}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{activeView.description}</p>
        {view === 'diario' && <JournalReport report={report} />}
        {view === 'mayor' && <LedgerReport report={report} />}
        {view === 'flujo' && <CashFlowReport report={report} />}
        {view === 'situacion' && <FinancialPositionReport report={report} />}
      </div>
    </div>
  )
}
