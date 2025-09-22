import { describe, expect, it } from 'vitest'
import { createNodePreset } from '../utils/nodePresets'

describe('createNodePreset', () => {
  it('creates default converter preset', () => {
    const node = createNodePreset({ type: 'Converter' })
    expect(node.type).toBe('Converter')
    expect((node as any).Vout).toBe(12)
    expect((node as any).efficiency).toEqual({ type: 'fixed', value: 0.95 })
    expect((node as any).controllerPartNumber).toBe('')
    expect((node as any).phaseCount).toBe(1)
  })

  it('creates VRM converter preset variant', () => {
    const node = createNodePreset({ type: 'Converter', variant: 'vrm-0p9-92' })
    expect(node.type).toBe('Converter')
    expect((node as any).Vout).toBe(0.9)
    expect((node as any).efficiency).toEqual({ type: 'fixed', value: 0.92 })
    expect((node as any).controllerPartNumber).toBe('')
    expect((node as any).phaseCount).toBe(1)
  })

  it('creates dual-output converter preset', () => {
    const node = createNodePreset({ type: 'DualOutputConverter', variant: 'dual-default' }) as any
    expect(node.type).toBe('DualOutputConverter')
    expect(Array.isArray(node.outputs)).toBe(true)
    expect(node.outputs).toHaveLength(2)
    expect(node.outputs[0]).toMatchObject({ id: 'outputA', Vout: 12, phaseCount: 1 })
    expect(node.outputs[1]).toMatchObject({ id: 'outputB', Vout: 5, phaseCount: 1 })
  })
})
