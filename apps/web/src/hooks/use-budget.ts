import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  assignTransactionToBudget,
  copyBudget,
  excludeTransactionFromBudget,
  getBudgetAssignments,
  getMonthlyBudget,
  resetTransactionBudgetAssignment,
  setBudgetIncome,
  setBudgetTarget,
  removeBudgetTarget,
} from '@balance/core'
import { supabase } from '@/lib/supabase'

export function useBudget(month: string) {
  return useQuery({ queryKey: ['budget', month], queryFn: () => getMonthlyBudget(supabase, month) })
}

export function useBudgetAssignments(accountingMonth: string) {
  return useQuery({
    queryKey: ['budget-assignments', { accountingMonth }],
    queryFn: () => getBudgetAssignments(supabase, { accountingMonth, explicitOnly: false }),
  })
}

export function useBudgetAssignmentMutations() {
  const qc = useQueryClient()
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['budget'] }),
    qc.invalidateQueries({ queryKey: ['budget-assignments'] }),
  ])
  return {
    assign: useMutation({
      mutationFn: (value: { transactionId: string; month: string }) =>
        assignTransactionToBudget(supabase, value.transactionId, value.month),
      onSuccess: refresh,
    }),
    exclude: useMutation({ mutationFn: excludeTransactionFromBudget.bind(null, supabase), onSuccess: refresh }),
    reset: useMutation({ mutationFn: resetTransactionBudgetAssignment.bind(null, supabase), onSuccess: refresh }),
  }
}
export function useBudgetMutations(month: string) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['budget'] })
  return {
    income: useMutation({ mutationFn: (amount: number) => setBudgetIncome(supabase, month, amount), onSuccess: refresh }),
    target: useMutation({ mutationFn: (v: { categoryId: string; amount: number }) => setBudgetTarget(supabase, month, v.categoryId, v.amount), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (categoryId: string) => removeBudgetTarget(supabase, month, categoryId), onSuccess: refresh }),
    copy: useMutation({ mutationFn: (v: { from: string; replace: boolean }) => copyBudget(supabase, v.from, month, v.replace), onSuccess: refresh }),
  }
}
