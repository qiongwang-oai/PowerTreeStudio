import { describe, it, expect } from 'vitest'

import { autoLayoutProjectV2 } from '../utils/autoLayout.v2'
import { estimateNodeHeight } from '../utils/nodeDimensions'
import type { AnyNode, Project, SourceNode, ConverterNode, LoadNode, SubsystemNode } from '../models'

const makeLinearProject = (): Project => {
  const source: SourceNode = {
    id: 'source',
    type: 'Source',
    name: 'Battery',
    Vout: 48,
  }

  const converter: ConverterNode = {
    id: 'converter',
    type: 'Converter',
    name: 'DCDC',
    Vin_min: 40,
    Vin_max: 60,
    Vout: 12,
    efficiency: { type: 'fixed', value: 0.95 },
  }

  const loadPrimary: LoadNode = {
    id: 'load-primary',
    type: 'Load',
    name: 'Compute Tray',
    Vreq: 12,
    I_typ: 10,
    I_max: 12,
  }

  const loadSecondary: LoadNode = {
    id: 'load-secondary',
    type: 'Load',
    name: 'Cooling',
    Vreq: 12,
    I_typ: 5,
    I_max: 7,
  }

  return {
    id: 'linear-project',
    name: 'Linear Project',
    units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
    defaultMargins: { currentPct: 0.1, powerPct: 0.1, voltageDropPct: 0.1, voltageMarginPct: 0.1 },
    scenarios: ['Typical'],
    currentScenario: 'Typical',
    nodes: [source, converter, loadPrimary, loadSecondary],
    edges: [
      { id: 'edge-source-converter', from: 'source', to: 'converter' },
      { id: 'edge-converter-load1', from: 'converter', to: 'load-primary' },
      { id: 'edge-converter-load2', from: 'converter', to: 'load-secondary' },
    ],
    markups: [],
  }
}

const makeBranchingProject = (): Project => {
  const source: SourceNode = {
    id: 'source',
    type: 'Source',
    name: 'Battery',
    Vout: 48,
  }

  const converterA: ConverterNode = {
    id: 'converter-a',
    type: 'Converter',
    name: 'Converter A',
    Vin_min: 40,
    Vin_max: 60,
    Vout: 12,
    efficiency: { type: 'fixed', value: 0.95 },
  }

  const converterB: ConverterNode = {
    id: 'converter-b',
    type: 'Converter',
    name: 'Converter B',
    Vin_min: 40,
    Vin_max: 60,
    Vout: 5,
    efficiency: { type: 'fixed', value: 0.93 },
  }

  const loadA: LoadNode = {
    id: 'load-a',
    type: 'Load',
    name: 'Load A',
    Vreq: 12,
    I_typ: 4,
    I_max: 6,
  }

  const loadB: LoadNode = {
    id: 'load-b',
    type: 'Load',
    name: 'Load B',
    Vreq: 5,
    I_typ: 3,
    I_max: 4,
  }

  return {
    id: 'branching-project-v2',
    name: 'Branching Project',
    units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
    defaultMargins: { currentPct: 0.1, powerPct: 0.1, voltageDropPct: 0.1, voltageMarginPct: 0.1 },
    scenarios: ['Typical'],
    currentScenario: 'Typical',
    nodes: [source, converterA, converterB, loadA, loadB],
    edges: [
      { id: 'e-source-a', from: 'source', to: 'converter-a' },
      { id: 'e-source-b', from: 'source', to: 'converter-b' },
      { id: 'e-a-load', from: 'converter-a', to: 'load-a' },
      { id: 'e-b-load', from: 'converter-b', to: 'load-b' },
    ],
    markups: [],
  }
}

const makeFloatingSourceProject = (): Project => {
  const sourceA: SourceNode = {
    id: 'source-a',
    type: 'Source',
    name: 'Generator A',
    Vout: 24,
  }

  const sourceB: SourceNode = {
    id: 'source-b',
    type: 'Source',
    name: 'Generator B',
    Vout: 24,
  }

  const subsystem: SubsystemNode = {
    id: 'subsystem',
    type: 'Subsystem',
    name: 'Rack',
    inputV_nom: 24,
    project: {
      id: 'embedded',
      name: 'embedded',
      units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
      defaultMargins: { currentPct: 0.1, powerPct: 0.1, voltageDropPct: 0.1, voltageMarginPct: 0.1 },
      scenarios: ['Typical'],
      currentScenario: 'Typical',
      nodes: [],
      edges: [],
      markups: [],
    },
  }

  const loadLeaf: LoadNode = {
    id: 'load-leaf',
    type: 'Load',
    name: 'Fan Bank',
    Vreq: 24,
    I_typ: 2,
    I_max: 3,
  }

  return {
    id: 'floating-source-project',
    name: 'Floating Source Project',
    units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
    defaultMargins: { currentPct: 0.1, powerPct: 0.1, voltageDropPct: 0.1, voltageMarginPct: 0.1 },
    scenarios: ['Typical'],
    currentScenario: 'Typical',
    nodes: [sourceA, sourceB, subsystem, loadLeaf],
    edges: [
      { id: 'edge-subsystem-load', from: 'subsystem', to: 'load-leaf' },
    ],
    markups: [],
  }
}

const makeParallelSourcesProject = (): Project => ({
  id: 'parallel-sources',
  name: 'Parallel Sources',
  units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
  defaultMargins: { currentPct: 0.1, powerPct: 0.1, voltageDropPct: 0.1, voltageMarginPct: 0.1 },
  scenarios: ['Typical'],
  currentScenario: 'Typical',
  nodes: [
    { id: 'source-a', type: 'Source', name: 'A', Vout: 48 },
    { id: 'source-b', type: 'Source', name: 'B', Vout: 48 },
    { id: 'source-c', type: 'Source', name: 'C', Vout: 48 },
    { id: 'bus', type: 'Bus', name: 'Main Bus', V_bus: 48 },
    { id: 'load', type: 'Load', name: 'Server', Vreq: 48, I_typ: 5, I_max: 8 },
  ],
  edges: [
    { id: 'edge-a-bus', from: 'source-a', to: 'bus' },
    { id: 'edge-b-bus', from: 'source-b', to: 'bus' },
    { id: 'edge-c-bus', from: 'source-c', to: 'bus' },
    { id: 'edge-bus-load', from: 'bus', to: 'load' },
  ],
  markups: [],
})

const getNode = (nodes: AnyNode[], id: string): AnyNode => {
  const found = nodes.find(node => node.id === id)
  if (!found) throw new Error(`Expected node ${id} in layout result`)
  return found
}

const verticalSpacingBetween = (nodes: AnyNode[], idA: string, idB: string): number => {
  const first = getNode(nodes, idA)
  const second = getNode(nodes, idB)
  if (typeof first.y !== 'number' || typeof second.y !== 'number') {
    throw new Error('Missing coordinates for spacing measurement')
  }
  const ordered = [first, second].sort((a, b) => (a.y ?? 0) - (b.y ?? 0))
  const top = ordered[0]
  const bottom = ordered[1]
  const topHeight = estimateNodeHeight(top)
  return (bottom.y ?? 0) - ((top.y ?? 0) + topHeight)
}

describe('autoLayoutProjectV2', () => {
  it('places downstream loads to the right of their upstream sources respecting spacing', () => {
    const project = makeLinearProject()
    const layout = autoLayoutProjectV2(project, { columnSpacing: 320, rowSpacing: 140 })

    const loadPrimary = getNode(layout.nodes, 'load-primary')
    const loadSecondary = getNode(layout.nodes, 'load-secondary')
    const converter = getNode(layout.nodes, 'converter')
    const source = getNode(layout.nodes, 'source')

    const loadPrimaryX = loadPrimary.x ?? Number.NaN
    const loadSecondaryX = loadSecondary.x ?? Number.NaN
    const converterX = converter.x ?? Number.NaN
    const sourceX = source.x ?? Number.NaN

    expect(Number.isFinite(loadPrimaryX)).toBe(true)
    expect(Number.isFinite(converterX)).toBe(true)
    expect(Number.isFinite(sourceX)).toBe(true)

    // Loads share the same column furthest to the right
    expect(loadPrimaryX).toBe(loadSecondaryX)
    expect(loadPrimaryX).toBeGreaterThan(converterX)
    expect(converterX).toBeGreaterThan(sourceX)

    // Loads maintain the configured vertical spacing or greater
    const verticalGap = verticalSpacingBetween(layout.nodes as AnyNode[], 'load-primary', 'load-secondary')
    expect(verticalGap).toBeCloseTo(140, 3)
  })

  it('honors 1px spacing in the rightmost column', () => {
    const project = makeLinearProject()
    const layout = autoLayoutProjectV2(project, { columnSpacing: 320, rowSpacing: 1 })

    const gap = verticalSpacingBetween(layout.nodes as AnyNode[], 'load-primary', 'load-secondary')
    expect(gap).toBeCloseTo(1, 1e-6)
  })

  it('maintains the configured minimum gap for upstream columns', () => {
    const project = makeBranchingProject()
    const layout = autoLayoutProjectV2(project, { columnSpacing: 320, rowSpacing: 1 })

    const gap = verticalSpacingBetween(layout.nodes as AnyNode[], 'converter-a', 'converter-b')
    expect(gap).toBeGreaterThanOrEqual(1 - 1e-6)
  })

  it('keeps floating sources in the load column when no path to a load exists', () => {
    const project = makeFloatingSourceProject()
    const layout = autoLayoutProjectV2(project, { columnSpacing: 280, rowSpacing: 120 })

    const subsystem = getNode(layout.nodes, 'subsystem')
    const load = getNode(layout.nodes, 'load-leaf')
    const sourceA = getNode(layout.nodes, 'source-a')
    const sourceB = getNode(layout.nodes, 'source-b')

    expect(subsystem.x).toBe(load.x)
    expect(sourceA.x).toBe(load.x)
    expect(sourceB.x).toBe(load.x)
  })

  it('maintains configured spacing for upstream nodes sharing a column', () => {
    const project = makeParallelSourcesProject()
    const rowSpacing = 160
    const layout = autoLayoutProjectV2(project, { columnSpacing: 320, rowSpacing })

    const gap = verticalSpacingBetween(layout.nodes as AnyNode[], 'source-a', 'source-b')
    expect(gap).toBeCloseTo(rowSpacing, 3)
  })

  it('orders edge midpoints left-to-right for lower column edges', () => {
    const project = makeParallelSourcesProject()
    const layout = autoLayoutProjectV2(project, { columnSpacing: 320, rowSpacing: 120 })

    const edgesToBus = layout.edges.filter(edge => edge.to === 'bus')
    expect(edgesToBus).toHaveLength(3)

    const nodesById = new Map(layout.nodes.map(node => [node.id, node]))
    const sortedBySourceY = edgesToBus.slice().sort((a, b) => {
      const ay = nodesById.get(a.from)?.y ?? 0
      const by = nodesById.get(b.from)?.y ?? 0
      return ay - by
    })

    let previousX = Number.NEGATIVE_INFINITY
    for (const edge of sortedBySourceY) {
      expect(edge.midpointX).toBeGreaterThan(previousX)
      previousX = edge.midpointX ?? 0
      const source = nodesById.get(edge.from)
      const target = nodesById.get(edge.to)
      expect(edge.midpointX).toBeGreaterThanOrEqual(Math.min(source?.x ?? 0, target?.x ?? 0))
      expect(edge.midpointX).toBeLessThanOrEqual(Math.max(source?.x ?? 0, target?.x ?? 0))
    }
  })
})


