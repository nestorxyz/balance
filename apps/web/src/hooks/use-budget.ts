import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { copyBudget, getMonthlyBudget, setBudgetIncome, setBudgetTarget, removeBudgetTarget } from '@balance/core'
import { supabase } from '@/lib/supabase'

export function useBudget(month: string) {
  return useQuery({ queryKey: ['budget', month], queryFn: () => getMonthlyBudget(supabase, month) })
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
