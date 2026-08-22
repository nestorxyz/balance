import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { closeMonth, getMonthClosePreflight } from '@balance/core'
import { supabase } from '@/lib/supabase'

export function useMonthClosePreflight(month: string) {
  return useQuery({
    queryKey: ['month-close-preflight', month],
    queryFn: () => getMonthClosePreflight(supabase, month),
    enabled: /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
    staleTime: 30_000,
  })
}

export function useCloseMonth(month: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => closeMonth(supabase, month),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['month-close-preflight', month] }),
        queryClient.invalidateQueries({ queryKey: ['snapshots'] }),
      ])
    },
  })
}
