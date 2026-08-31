import { createFileRoute } from '@tanstack/react-router'
import { contributionReminder, contributionReserved, financeToday } from '@balance/core'
import type { SharedContribution } from '@balance/core'
import { useContributions } from '@/hooks/use-contributions'
import { useAccounts } from '@/hooks/use-accounts'
import { useCategories } from '@/hooks/use-categories'
import { NewContributionForm, ContributionActionForm } from '@/components/contributions/contribution-forms'
import { formatSoles as formatMoney } from '@/lib/format'

export const Route = createFileRoute('/_authenticated/aportes')({ component: ContributionsPage })
const labels: Record<SharedContribution['status'], string> = {
  pending: 'Pendiente', received: 'Recibido · reservado', applied: 'Aplicado al recibo', returned: 'Devuelto', cancelled: 'Cancelado',
}
function ContributionsPage() {
  // Independent queries start together; no dependent fetching waterfall.
  const contributions = useContributions()
  const accounts = useAccounts({ entity: 'personal' })
  const categories = useCategories({ entity: 'personal' })
  if (contributions.isLoading || accounts.isLoading || categories.isLoading) return <p role="status">Cargando aportes…</p>
  const error = contributions.error ?? accounts.error ?? categories.error
  if (error) return <p role="alert">No se pudieron cargar los aportes: {error.message}. Comprueba que la migración esté instalada antes de usar esta función.</p>
  const rows = contributions.data ?? []
  return <div className="space-y-6">
    <header className="space-y-2"><h1 className="text-xl font-semibold">Aportes compartidos</h1>
      <p className="text-muted-foreground">Dinero recibido para pagar un gasto compartido. No es ingreso ni dinero libre.</p>
      <p>Reservado pendiente de aplicar: <strong>{formatMoney(contributionReserved(rows))}</strong></p>
    </header>
    <details className="rounded border p-4"><summary className="cursor-pointer font-medium">Nuevo aporte</summary><div className="pt-4"><NewContributionForm categories={categories.data ?? []}/></div></details>
    <p className="text-sm text-muted-foreground">El aviso y vencimiento aparecen aquí. Ningún pago se registra automáticamente. Para la luz, crea el aviso del día 20 con vencimiento el 27.</p>
    {!rows.length && <p>No tienes aportes registrados.</p>}
    <ul className="space-y-4">{rows.map(row => <li key={row.id} className="space-y-3 rounded border p-4">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{row.description} · {row.contributor}</h2><strong>{formatMoney(row.amount)}</strong></div>
      <p>{labels[row.status]}{contributionReminder(row, financeToday()) ? ` · ${contributionReminder(row, financeToday())}` : ''}</p>
      <p className="text-sm text-muted-foreground">Aviso: {row.notice_date} · Vence: {row.due_date} · {categories.data?.find(c => c.id === row.category_id)?.name}</p>
      {row.events.length > 0 && <details><summary className="cursor-pointer text-sm">Historial</summary><ul className="mt-2 space-y-1 text-sm">{row.events.map(event => <li key={event.id}>{event.date} · {{ receive: 'Recibido', settle: 'Aplicado', return: 'Devuelto', cancel: 'Cancelado' }[event.action]}{event.bill_amount !== null ? ` · Recibo ${formatMoney(event.bill_amount)} · Tu parte ${formatMoney(event.bill_amount - row.amount)}` : ''}</li>)}</ul></details>}
      {['pending', 'received'].includes(row.status) && <ContributionActionForm key={row.status} row={row} accounts={accounts.data ?? []}/>}
    </li>)}</ul>
  </div>
}
