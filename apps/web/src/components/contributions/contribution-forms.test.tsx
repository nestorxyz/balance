// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ContributionActionForm, NewContributionForm } from './contribution-forms'
import type { SharedContribution } from '@balance/core'
import type { Account } from '@/hooks/use-accounts'
import type { Category } from '@/hooks/use-categories'

const { create, act } = vi.hoisted(() => ({ create: vi.fn(), act: vi.fn() }))
vi.mock('@/hooks/use-contributions', () => ({ useContributionMutations: () => ({
  create: { mutateAsync: create, isPending: false }, act: { mutateAsync: act, isPending: false },
}) }))
const row: SharedContribution = { id: 'c1', contributor: 'Neighbor', description: 'Light', category_id: 'light',
  amount: 3000, notice_date: '2026-08-20', due_date: '2026-08-27', status: 'received',
  received_date: '2026-08-22', liability_account_id: 'holding', events: [] }
const accounts = [{ id: 'bank', name: 'Bank', type: 'asset', subtype: 'debit', currency: 'PEN', on_budget: true, is_archived: false },
  { id: 'holding', name: 'Holding', type: 'liability', subtype: 'payable', currency: 'PEN', on_budget: true, is_archived: false }] as Account[]
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }) }
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'confirm').mockReturnValue(true); create.mockResolvedValue({}); act.mockResolvedValue({}) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('contribution forms', () => {
  it('requires explicit account selection and confirmation; refuses an undersized bill', async () => {
    render(<ContributionActionForm row={row} accounts={accounts}/>)
    expect((screen.getByLabelText('Cuenta desde la que pagas') as HTMLSelectElement).value).toBe('')
    expect(screen.queryByRole('option', { name: 'Holding' })).toBeNull()
    change('Cuenta desde la que pagas', 'bank'); change('Total completo del recibo (S/)', '20')
    fireEvent.click(screen.getByRole('button', { name: 'Pagar recibo y aplicar aporte' }))
    await screen.findByRole('alert')
    expect(act).not.toHaveBeenCalled()
    change('Total completo del recibo (S/)', '100')
    vi.mocked(window.confirm).mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Pagar recibo y aplicar aporte' }))
    expect(act).not.toHaveBeenCalled()
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Pagar recibo y aplicar aporte' }))
    await waitFor(() => expect(act).toHaveBeenCalledOnce())
    expect(act.mock.calls[0]![0]).toMatchObject({ action: 'settle', accountId: 'bank', billAmount: 10000 })
  })
  it('retries exactly the same operation after an uncertain response', async () => {
    act.mockRejectedValueOnce(new Error('Network response lost'))
    render(<ContributionActionForm row={{ ...row, status: 'pending' }} accounts={accounts}/>)
    change('Cuenta donde lo recibiste', 'bank')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recepción' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar misma operación' }))
    await waitFor(() => expect(act).toHaveBeenCalledTimes(2))
    expect(act.mock.calls[0]).toEqual(act.mock.calls[1])
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })
  it('creates an explicit notice and due date without moving cash', async () => {
    const categories = [{ id: 'light', name: 'Luz', parent_id: null }] as Category[]
    render(<NewContributionForm categories={categories}/>)
    change('Persona', 'Neighbor'); change('Concepto', 'Light'); change('Aporte esperado (S/)', '30')
    change('Categoría de tu gasto', 'light'); change('Fecha de aviso', '2026-08-20'); change('Fecha límite de pago', '2026-08-27')
    fireEvent.click(screen.getByRole('button', { name: 'Crear aporte pendiente' }))
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create.mock.calls[0]![0]).toMatchObject({ amount: 3000, noticeDate: '2026-08-20', dueDate: '2026-08-27', categoryId: 'light' })
    expect(act).not.toHaveBeenCalled()
  })
})
