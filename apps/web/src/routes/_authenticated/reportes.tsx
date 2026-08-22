import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { FinancialReports } from '@/components/reports/financial-reports'
import { MonthClosePanel } from '@/components/reports/month-close-panel'
import { useFinancialReport } from '@/hooks/use-financial-report'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_authenticated/reportes')({
  component: ReportsPage,
})

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function moveMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year!, monthNumber! - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return `${MONTH_NAMES[monthNumber! - 1]} ${year}`
}

function ReportsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16" />)}</div>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

function ReportsPage() {
  const [month, setMonth] = useState(currentMonth)
  const report = useFinancialReport(month)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Contabilidad personal</p>
          <h1 className="mt-1 text-2xl font-semibold">Reportes financieros</h1>
          <p className="mt-1 text-sm text-muted-foreground">Diario, mayor, flujo de caja y situación financiera desde un solo ledger.</p>
        </div>
        <div className="flex items-center rounded-md border border-border bg-card p-1">
          <button type="button" onClick={() => setMonth((value) => moveMonth(value, -1))} className="flex size-9 items-center justify-center rounded text-lg text-muted-foreground hover:bg-muted" aria-label="Mes anterior">‹</button>
          <span className="min-w-[150px] text-center text-sm font-medium">{monthLabel(month)}</span>
          <button type="button" onClick={() => setMonth((value) => moveMonth(value, 1))} className="flex size-9 items-center justify-center rounded text-lg text-muted-foreground hover:bg-muted" aria-label="Mes siguiente">›</button>
        </div>
      </div>

      {report.isLoading && <ReportsSkeleton />}
      {report.error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-5">
          <p className="font-medium text-red-600">No se pudieron cargar los reportes</p>
          <p className="mt-1 text-sm text-muted-foreground">{report.error.message}</p>
          <button type="button" onClick={() => void report.refetch()} className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Reintentar</button>
        </div>
      )}
      {report.data && <FinancialReports key={month} report={report.data} />}
      <MonthClosePanel month={month} />
    </div>
  )
}
