import { describe, expect, it } from 'vitest'
import { createNodePreset } from '../utils/nodePresets'

describe('createNodePreset', () => {
  it('creates default converter preset', () => {
    const node = createNodePreset({ type: 'Converter' })
    expect(node.type).toBe('Converter')
    expect((node as any).Vout).toBe(12)
    expect((node as any).efficiency).toEqual({ type: 'fixed', value: 0.95 })
  })

  it('creates VRM converter preset variant', () => {
    const node = createNodePreset({ type: 'Converter', variant: 'vrm-0p9-92' })
    expect(node.type).toBe('Converter')
    expect((node as any).Vout).toBe(0.9)
    expect((node as any).efficiency).toEqual({ type: 'fixed', value: 0.92 })
  })
})
