import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export async function getCategories(supabase: TypedClient, options?: {
  entity?: 'personal' | 'spa'
  includeArchived?: boolean
}) {
  let query = supabase.from('categories').select('*').order('sort_order')
  if (options?.entity) query = query.eq('entity', options.entity)
  if (!options?.includeArchived) query = query.eq('is_archived' as never, false)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createTopLevelCategory(supabase: TypedClient, name: string) {
  const { data, error } = await (supabase.rpc as any)('create_top_level_category', { p_name: name })
  if (error) throw error
  return data
}

export async function archiveCategory(supabase: TypedClient, categoryId: string) {
  const { data, error } = await (supabase.rpc as any)('archive_category', { p_category_id: categoryId })
  if (error) throw error
  return data
}

export async function createSubcategory(supabase: TypedClient, input: {
  parentId: string
  id: string
  name: string
}) {
  const { data, error } = await supabase.rpc('create_subcategory', {
    p_parent_id: input.parentId,
    p_id: input.id,
    p_name: input.name,
  })
  if (error) throw error
  return data
}

export async function renameCategory(supabase: TypedClient, categoryId: string, newName: string) {
  const { data, error } = await supabase.rpc('rename_category', {
    p_category_id: categoryId,
    p_new_name: newName,
  })
  if (error) throw error
  return data
}

export async function deleteCategory(supabase: TypedClient, categoryId: string) {
  const { data, error } = await supabase.rpc('delete_category', {
    p_category_id: categoryId,
  })
  if (error) throw error
  return data
}
