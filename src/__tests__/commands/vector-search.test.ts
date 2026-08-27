import { describe, it, expect } from 'vitest'

describe('vector-search', () => {
  it('module should load', async () => {
    const m = await import('./../../commands/vector-search/index')
    expect(m).toBeDefined()
  })
})
