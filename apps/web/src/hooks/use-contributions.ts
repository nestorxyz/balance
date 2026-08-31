import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { actOnContribution, createSharedContribution, getSharedContributions } from '@balance/core'
import type { ContributionActionInput, CreateContributionInput } from '@balance/core'
import { supabase } from '@/lib/supabase'

export function useContributions() {
  return useQuery({ queryKey: ['contributions'], queryFn: () => getSharedContributions(supabase) })
}
export function useContributionMutations() {
  const queryClient = useQueryClient()
  async function refresh() {
    // Refresh dependent account, transaction, report and budget views together.
    await queryClient.invalidateQueries()
  }
  const create = useMutation({ mutationFn: (input: CreateContributionInput) => createSharedContribution(supabase, input), retry: false, onSuccess: refresh })
  const act = useMutation({ mutationFn: (input: ContributionActionInput) => actOnContribution(supabase, input), retry: false, onSuccess: refresh })
  return { create, act }
}
