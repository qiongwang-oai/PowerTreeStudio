import { describe, it, expect } from 'vitest'

import { autoLayoutProjectV2 } from '../utils/autoLayout.v2'
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
    const verticalGap = Math.abs((loadSecondary.y ?? 0) - (loadPrimary.y ?? 0))
    expect(verticalGap).toBeGreaterThanOrEqual(140)
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

    const sourceA = getNode(layout.nodes, 'source-a')
    const sourceB = getNode(layout.nodes, 'source-b')

    const [top, bottom] = [sourceA, sourceB].sort((a, b) => (a.y ?? 0) - (b.y ?? 0))
    const gap = Math.abs((bottom.y ?? 0) - (top.y ?? 0))
    expect(gap).toBeGreaterThanOrEqual(rowSpacing)
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


