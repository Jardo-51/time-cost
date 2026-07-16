import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'
import { toPlain } from '@/db/plain'

describe('toPlain', () => {
  it('unwraps nested reactive values so structured clone accepts them', () => {
    const source = ref([{ id: 'a', tagIds: ['trip'] }])
    const spread = { ...source.value[0]!, deleted: true }

    expect(() => structuredClone(spread)).toThrow()
    expect(() => structuredClone(toPlain(spread))).not.toThrow()
    expect(toPlain(spread)).toEqual({ id: 'a', tagIds: ['trip'], deleted: true })
  })

  it('unwraps arrays of reactive records', () => {
    const list = reactive([{ id: 'a', tagIds: ['trip'] }])
    expect(() => structuredClone(toPlain(list.map(item => ({ ...item }))))).not.toThrow()
  })

  // toRaw() alone returns a ref as its RefImpl, which structured clone rejects.
  it('unwraps refs, at the top level and nested', () => {
    expect(toPlain(ref(['trip']))).toEqual(['trip'])

    const nested = { id: 'a', tagIds: ref(['trip']) }
    expect(() => structuredClone(nested)).toThrow()
    expect(() => structuredClone(toPlain(nested))).not.toThrow()
    expect(toPlain(nested)).toEqual({ id: 'a', tagIds: ['trip'] })
  })

  it('leaves non-plain objects intact', () => {
    const bytes = new Uint8Array([1, 2, 3])
    expect(toPlain({ cachedItem: bytes }).cachedItem).toBe(bytes)
  })

  it('passes primitives and null through', () => {
    expect(toPlain(null)).toBeNull()
    expect(toPlain(undefined)).toBeUndefined()
    expect(toPlain(42)).toBe(42)
  })
})
