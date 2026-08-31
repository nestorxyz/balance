import { Link } from '@tanstack/react-router'
import { contributionReserved } from '@balance/core'
import { useContributions } from '@/hooks/use-contributions'
import { formatSoles as formatMoney } from '@/lib/format'

export function ReservedContributions() {
  const contributions = useContributions()
  if (contributions.isLoading) return <p className="text-sm text-muted-foreground">Comprobando aportes reservados…</p>
  if (contributions.error) return <p role="alert" className="text-sm text-destructive">No se pudo comprobar el dinero reservado en aportes.</p>
  const reserved = contributionReserved(contributions.data ?? [])
  if (reserved === 0) return null
  return <p className="rounded border px-4 py-3 text-sm">
    Tus saldos bancarios incluyen <strong>{formatMoney(reserved)}</strong> de aportes pendientes de aplicar.
    No son ingresos ni dinero libre. <Link className="underline" to="/aportes">Ver aportes</Link>
  </p>
}
