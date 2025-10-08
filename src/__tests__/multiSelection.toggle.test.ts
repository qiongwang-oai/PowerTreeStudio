import { describe, expect, it } from 'vitest'

import {
  emptyMultiSelection,
  ensureMultiSelection,
  multiSelectionFromInspector,
  normalizeMultiSelection,
  toggleInMultiSelection,
} from '../utils/multiSelection'

describe('toggleInMultiSelection', () => {
  it('adds items when not present', () => {
    const base = emptyMultiSelection()
    const next = toggleInMultiSelection(base, { kind: 'node', id: 'n1' })
    expect(next.nodes).toEqual(['n1'])
    const withEdge = toggleInMultiSelection(next, { kind: 'edge', id: 'e1' })
    expect(withEdge.edges).toEqual(['e1'])
  })

  it('removes items when already present', () => {
    const base = ensureMultiSelection({ kind: 'multi', nodes: ['n1'], edges: ['e1'], markups: [] })
    const next = toggleInMultiSelection(base, { kind: 'node', id: 'n1' })
    expect(next.nodes).toEqual([])
    const final = toggleInMultiSelection(next, { kind: 'edge', id: 'e1' })
    expect(final.edges).toEqual([])
  })

  it('preserves insertion order on repeated toggles', () => {
    const base = emptyMultiSelection()
    const step1 = toggleInMultiSelection(base, { kind: 'node', id: 'a' })
    const step2 = toggleInMultiSelection(step1, { kind: 'node', id: 'b' })
    const step3 = toggleInMultiSelection(step2, { kind: 'node', id: 'a' })
    const step4 = toggleInMultiSelection(step3, { kind: 'node', id: 'a' })
    expect(step4.nodes).toEqual(['b', 'a'])
  })
})

describe('multiSelection helpers', () => {
  it('builds from inspector selections', () => {
    const nodeSel = multiSelectionFromInspector({ kind: 'node', id: 'n1' })
    expect(nodeSel.nodes).toEqual(['n1'])
    const nested = multiSelectionFromInspector({ kind: 'nested-edge', subsystemPath: ['s'], edgeId: 'e1' })
    expect(nested.edges).toEqual(['e1'])
  })

  it('normalizes empty selection to null', () => {
    const selection = normalizeMultiSelection({ kind: 'multi', nodes: [], edges: [], markups: [] })
    expect(selection).toBeNull()
  })
})

