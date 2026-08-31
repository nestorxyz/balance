import { useState } from 'react'
import type { ReactNode } from 'react'
import { financeToday, parseMoney } from '@balance/core'
import type { SharedContribution, ContributionAction, ContributionActionInput, CreateContributionInput } from '@balance/core'
import type { Account } from '@/hooks/use-accounts'
import type { Category } from '@/hooks/use-categories'
import { useContributionMutations } from '@/hooks/use-contributions'
import { formatSoles as formatMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'

const inputClass = 'w-full rounded border bg-background px-3 py-2'
export function ContributionField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1 text-sm"><span>{label}</span>{children}</label>
}

export function NewContributionForm({ categories }: { categories: Category[] }) {
  const { create } = useContributionMutations()
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState('')
  // Retain the exact submitted payload on uncertain errors. A retry never creates a new request.
  const [submitted, setSubmitted] = useState<CreateContributionInput | null>(null)
  return <form className="space-y-3" onSubmit={async event => {
    event.preventDefault()
    const form = event.currentTarget
    try {
      const fields = new FormData(form)
      const input = submitted ?? {
        id: requestId, contributor: String(fields.get('person')), description: String(fields.get('description')),
        categoryId: String(fields.get('category')), amount: parseMoney(String(fields.get('amount'))),
        noticeDate: String(fields.get('notice')), dueDate: String(fields.get('due')),
      }
      if (!submitted && !window.confirm(`Crear aporte de ${input.contributor} por ${formatMoney(input.amount)}, aviso ${input.noticeDate}, vence ${input.dueDate}. No mueve dinero. ¿Confirmas?`)) return
      setSubmitted(input)
      await create.mutateAsync(input)
      setSubmitted(null); setRequestId(crypto.randomUUID()); setError(''); form.reset()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo crear el aporte') }
  }}>
    <fieldset disabled={create.isPending || submitted !== null} className="grid gap-3 sm:grid-cols-2">
      <ContributionField label="Persona"><input className={inputClass} name="person" required maxLength={120}/></ContributionField>
      <ContributionField label="Concepto"><input className={inputClass} name="description" placeholder="Luz de septiembre" required maxLength={240}/></ContributionField>
      <ContributionField label="Aporte esperado (S/)"><input className={inputClass} name="amount" inputMode="decimal" required/></ContributionField>
      <ContributionField label="Categoría de tu gasto"><select className={inputClass} name="category" defaultValue="" required><option value="" disabled>Elegir categoría</option>{categories.map(category => <option key={category.id} value={category.id}>{category.parent_id ? `${categories.find(c => c.id === category.parent_id)?.name ?? ''} → ` : ''}{category.name}</option>)}</select></ContributionField>
      <ContributionField label="Fecha de aviso"><input className={inputClass} name="notice" type="date" required defaultValue={financeToday()}/></ContributionField>
      <ContributionField label="Fecha límite de pago"><input className={inputClass} name="due" type="date" required/></ContributionField>
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}. Si la respuesta fue incierta, reintenta la misma solicitud.</p>}
    <Button disabled={create.isPending} type="submit">{create.isPending ? 'Guardando…' : submitted ? 'Reintentar misma solicitud' : 'Crear aporte pendiente'}</Button>
  </form>
}

const actionLabels: Record<ContributionAction, string> = { receive: 'Confirmar recepción', settle: 'Pagar recibo y aplicar aporte', return: 'Devolver aporte completo', cancel: 'Cancelar solicitud' }

export function ContributionActionForm({ row, accounts }: { row: SharedContribution; accounts: Account[] }) {
  const { act } = useContributionMutations()
  const [action, setAction] = useState<ContributionAction>(row.status === 'pending' ? 'receive' : 'settle')
  const [requestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState<ContributionActionInput | null>(null)
  const eligible = accounts.filter(a => a.type === 'asset' && ['debit', 'cash'].includes(a.subtype) && a.currency === 'PEN' && a.on_budget && !a.is_archived)
  const actions: ContributionAction[] = row.status === 'pending' ? ['receive', 'cancel'] : ['settle', 'return']
  return <form className="space-y-3 border-t pt-3" onSubmit={async event => {
    event.preventDefault()
    try {
      const fields = new FormData(event.currentTarget)
      const input: ContributionActionInput = submitted ?? {
        id: row.id, requestId, action, date: String(fields.get('date')),
        accountId: action === 'cancel' ? undefined : String(fields.get('account')),
        billAmount: action === 'settle' ? parseMoney(String(fields.get('bill'))) : undefined,
      }
      if (input.action === 'settle' && input.billAmount! < row.amount) throw new Error('El total del recibo no puede ser menor al aporte')
      const account = eligible.find(a => a.id === input.accountId)?.name ?? 'Sin movimiento de dinero'
      const summary = input.action === 'settle'
        ? `Salida ${formatMoney(input.billAmount!)}; aporte aplicado ${formatMoney(row.amount)}; tu gasto ${formatMoney(input.billAmount! - row.amount)}.`
        : `Aporte ${formatMoney(row.amount)}.`
      if (!submitted && !window.confirm(`${actionLabels[input.action]}\n${account} · ${input.date}\n${summary}\n¿Confirmas?`)) return
      setSubmitted(input)
      await act.mutateAsync(input)
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo completar la operación') }
  }}>
    <fieldset disabled={act.isPending || submitted !== null} className="grid gap-3 sm:grid-cols-2">
      <ContributionField label="Operación"><select className={inputClass} value={action} onChange={e => setAction(e.target.value as ContributionAction)}>{actions.map(value => <option key={value} value={value}>{actionLabels[value]}</option>)}</select></ContributionField>
      <ContributionField label="Fecha real"><input className={inputClass} name="date" type="date" defaultValue={financeToday()} max={financeToday()} min={row.received_date ?? row.notice_date} required/></ContributionField>
      {action !== 'cancel' && <ContributionField label={action === 'receive' ? 'Cuenta donde lo recibiste' : 'Cuenta desde la que pagas'}><select className={inputClass} name="account" defaultValue="" required><option value="" disabled>Elegir cuenta</option>{eligible.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></ContributionField>}
      {action === 'settle' && <ContributionField label="Total completo del recibo (S/)"><input className={inputClass} name="bill" inputMode="decimal" required/></ContributionField>}
    </fieldset>
    {action === 'settle' && <p className="text-sm text-muted-foreground">Esta operación registra el pago completo. No la uses si ya registraste ese recibo en Movimientos.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}. Reintentar conserva la misma operación para evitar duplicados.</p>}
    <Button disabled={act.isPending} type="submit">{act.isPending ? 'Procesando…' : submitted ? 'Reintentar misma operación' : actionLabels[action]}</Button>
  </form>
}
