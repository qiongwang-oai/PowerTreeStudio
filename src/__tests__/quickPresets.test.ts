import { describe, expect, it } from 'vitest'
import { createNodePreset } from '../utils/nodePresets'
import {
  sanitizeNodeForPreset,
  createQuickPresetFromNode,
  materializeQuickPreset,
  serializeQuickPresetsToYaml,
  parseQuickPresetsYaml,
} from '../utils/quickPresets'

describe('quick preset utilities', () => {
  it('sanitizes node snapshots for presets', () => {
    const node = createNodePreset({ type: 'Load' })
    const sanitized = sanitizeNodeForPreset(node)
    expect((sanitized as any).id).toBeUndefined()
    expect((sanitized as any).x).toBeUndefined()
    expect((sanitized as any).y).toBeUndefined()
    expect(sanitized.type).toBe('Load')
  })

  it('materializes presets with new node ids and positions', () => {
    const node = createNodePreset({ type: 'Converter' })
    const preset = createQuickPresetFromNode(node, { name: 'Unit Test Preset' })
    const materialized = materializeQuickPreset(preset, { x: 123, y: 456 })
    expect(materialized.id).not.toEqual(node.id)
    expect(materialized.type).toBe('Converter')
    expect(materialized.x).toBe(123)
    expect(materialized.y).toBe(456)
  })

  it('round-trips presets through YAML import/export', () => {
    const node = createNodePreset({ type: 'Source' })
    const preset = createQuickPresetFromNode(node, { name: 'Source Preset' })
    const yaml = serializeQuickPresetsToYaml([preset], { includeDefaults: true })
    const parsed = parseQuickPresetsYaml(yaml)
    expect(parsed.version).toBe(1)
    expect(parsed.presets.length).toBeGreaterThan(0)
    const restored = parsed.presets[0]
    expect(restored.name).toBe('Source Preset')
    expect(restored.nodeType).toBe('Source')
    expect(restored.node.type).toBe('Source')
  })
})


