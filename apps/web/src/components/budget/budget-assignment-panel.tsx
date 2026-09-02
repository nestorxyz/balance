import { useState } from 'react'
import type { BudgetAssignment } from '@balance/core'
import { useBudgetAssignments, useBudgetAssignmentMutations } from '@/hooks/use-budget'
import { formatMoney } from '@/lib/format'

function assignmentMonth(row: BudgetAssignment): string {
  return row.budget_month?.slice(0, 7) ?? row.accounting_date.slice(0, 7)
}

function AssignmentRow({ row }: { row: BudgetAssignment }) {
  const mutations = useBudgetAssignmentMutations()
  const [month, setMonth] = useState(assignmentMonth(row))
  const accountingMonth = row.accounting_date.slice(0, 7)
  const pending = mutations.assign.isPending || mutations.exclude.isPending || mutations.reset.isPending

  return <div className="grid gap-2 border-t py-3 sm:grid-cols-[1fr_auto] sm:items-center">
    <div className="min-w-0">
      <div className="truncate text-sm font-medium">{row.description || 'Sin descripción'}</div>
      <div className="text-xs text-muted-foreground">
        {row.accounting_date} · {formatMoney(Math.abs(row.amount))}
        {row.is_excluded ? ' · fuera del presupuesto' : row.is_explicit ? ` · asignado a ${assignmentMonth(row)}` : ''}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label={`Presupuesto para ${row.description}`} type="month" value={month} onChange={event => setMonth(event.target.value)} className="rounded border px-2 py-1 text-sm" />
      <button disabled={pending || !month} className="rounded border px-2 py-1 text-sm" onClick={() => mutations.assign.mutate({ transactionId: row.transaction_id, month })}>Asignar</button>
      <button disabled={pending} className="rounded border px-2 py-1 text-sm" onClick={() => mutations.exclude.mutate(row.transaction_id)}>Excluir</button>
      {row.is_explicit && <button disabled={pending} className="text-sm text-muted-foreground" onClick={() => { setMonth(accountingMonth); mutations.reset.mutate(row.transaction_id) }}>Restablecer</button>}
    </div>
  </div>
}

export function BudgetAssignmentPanel({ initialAccountingMonth }: { initialAccountingMonth: string }) {
  const [accountingMonth, setAccountingMonth] = useState(initialAccountingMonth)
  const assignments = useBudgetAssignments(accountingMonth)

  return <section className="rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-semibold">Asignar movimientos a presupuestos</h2>
        <p className="text-sm text-muted-foreground">La fecha contable no cambia. Solo cambia el mes donde se mide el presupuesto.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">Mes contable<input type="month" value={accountingMonth} onChange={event => setAccountingMonth(event.target.value)} className="rounded border px-2 py-1" /></label>
    </div>
    {assignments.isLoading && <p className="mt-3 text-sm text-muted-foreground">Cargando movimientos…</p>}
    {assignments.isError && <p className="mt-3 text-sm text-red-600">No se pudieron cargar las asignaciones.</p>}
    {!assignments.isLoading && assignments.data?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No hay movimientos en este mes contable.</p>}
    <div className="mt-3">{assignments.data?.map(row => <AssignmentRow key={row.transaction_id} row={row} />)}</div>
  </section>
}
