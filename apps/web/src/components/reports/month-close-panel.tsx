import type { MonthClosePreflight } from '@balance/core'
import { useCloseMonth, useMonthClosePreflight } from '@/hooks/use-month-close'
import { cn } from '@/lib/utils'

const STATE_COPY: Record<MonthClosePreflight['state'], { title: string; description: string }> = {
  open: {
    title: 'Mes abierto',
    description: 'Balance seguirá preparando el cierre. El cierre final espera a que termine el mes y pasen todas las validaciones.',
  },
  ready: {
    title: 'Listo para cerrar',
    description: 'Las validaciones pasaron. Revisa los reportes y confirma el cierre cuando estés conforme.',
  },
  closed: {
    title: 'Mes cerrado',
    description: 'Esta revisión es inmutable. Balance avisará si aparece un movimiento retroactivo.',
  },
  amendment_required: {
    title: 'Revisión requerida',
    description: 'El ledger cambió después del cierre. Revisa el movimiento retroactivo y crea una nueva revisión.',
  },
}

export function MonthClosePanel({ month }: { month: string }) {
  const preflight = useMonthClosePreflight(month)
  const close = useCloseMonth(month)

  if (preflight.isLoading) {
    return <div className="h-40 animate-pulse rounded-md border border-border bg-muted/30" />
  }
  if (preflight.error || !preflight.data) {
    return (
      <section className="rounded-md border border-red-500/30 bg-red-500/5 p-5">
        <h2 className="font-medium text-red-600">No se pudo preparar el cierre</h2>
        <button type="button" onClick={() => void preflight.refetch()} className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm">Reintentar</button>
      </section>
    )
  }

  const data = preflight.data
  const copy = STATE_COPY[data.state]
  const nextRevision = data.latest_revision + 1

  async function confirmClose() {
    const action = data.state === 'amendment_required' ? `crear la revisión ${nextRevision}` : 'cerrar el mes'
    if (!window.confirm(`¿Confirmas que deseas ${action}? Este registro será inmutable.`)) return
    close.mutate()
  }

  return (
    <section className="rounded-md border border-border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Cierre mensual</p>
          <h2 className="mt-1 text-lg font-semibold">{copy.title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{copy.description}</p>
        </div>
        {(data.state === 'ready' || data.state === 'amendment_required') && (
          <button
            type="button"
            onClick={() => void confirmClose()}
            disabled={close.isPending}
            className="shrink-0 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {close.isPending ? 'Cerrando…' : data.state === 'amendment_required' ? `Crear revisión ${nextRevision}` : 'Cerrar mes'}
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {data.checks.map((check) => (
          <div key={check.id} className={cn('rounded-md border px-3 py-2 text-sm', check.passed ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/25 bg-amber-500/5')}>
            <span className={check.passed ? 'text-emerald-600' : 'text-amber-600'}>{check.passed ? '✓' : '•'}</span>{' '}
            {check.label}
          </div>
        ))}
      </div>

      {close.error && <p className="mt-3 text-sm text-red-600">{close.error.message}</p>}
      {close.isSuccess && <p className="mt-3 text-sm text-emerald-600">Cierre revisión {close.data.revision} guardado correctamente.</p>}
      <p className="mt-4 text-xs text-muted-foreground">Preparación automática: del día 28 al 3. El cierre final siempre requiere tu confirmación.</p>
    </section>
  )
}
