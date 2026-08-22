import { useQuery } from '@tanstack/react-query'
import { getMonthlyFinancialReport } from '@balance/core'
import { supabase } from '@/lib/supabase'

export function useFinancialReport(month: string) {
  return useQuery({
    queryKey: ['financial-report', month, 'personal'],
    queryFn: () => getMonthlyFinancialReport(supabase, month, 'personal'),
    staleTime: 30_000,
    enabled: /^\d{4}-\d{2}$/.test(month),
  })
}
