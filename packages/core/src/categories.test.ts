import { describe, expect, it, vi } from 'vitest'
import { createSubcategory } from './categories'

describe('category API', () => {
  it('generates a stable custom id when creating a subcategory', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'created' }, error: null })
    const client = { rpc } as never

    await createSubcategory(client, { parentId: 'food', name: 'Diario' })

    expect(rpc).toHaveBeenCalledWith('create_subcategory', {
      p_parent_id: 'food',
      p_id: expect.stringMatching(/^custom\.[0-9a-f-]{36}$/),
      p_name: 'Diario',
    })
  })
})
