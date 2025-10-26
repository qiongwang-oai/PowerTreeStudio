import { describe, it, expect } from 'vitest'

import { autoLayoutProject } from '../utils/autoLayout'
import { estimateNodeHeight } from '../utils/nodeDimensions'
import type { Project, SubsystemInputNode, ConverterNode, LoadNode, AnyNode } from '../models'

const makeTestProject = (): Project => {
  const input: SubsystemInputNode = {
    id: 'input',
    type: 'SubsystemInput',
    name: 'Input',
    Vout: 12,
  }

  const converter: ConverterNode = {
    id: 'converter',
    type: 'Converter',
    name: 'Converter',
    Vin_min: 10,
    Vin_max: 14,
    Vout: 5,
    efficiency: { type: 'fixed', value: 0.92 },
  }

  const loadA: LoadNode = {
    id: 'loadA',
    type: 'Load',
    name: 'Load A',
    Vreq: 5,
    I_typ: 2,
    I_max: 3,
  }

  const loadB: LoadNode = {
    id: 'loadB',
    type: 'Load',
    name: 'Load B',
    Vreq: 5,
    I_typ: 1.5,
    I_max: 2,
  }

  return {
    id: 'test-project',
    name: 'Test Project',
    units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
    defaultMargins: { currentPct: 0.1, powerPct: 0.1, voltageDropPct: 0.1, voltageMarginPct: 0.1 },
    scenarios: ['Typical'],
    currentScenario: 'Typical',
    nodes: [input, converter, loadA, loadB],
    edges: [
      { id: 'e1', from: 'input', to: 'converter' },
      { id: 'e2', from: 'converter', to: 'loadA' },
      { id: 'e3', from: 'converter', to: 'loadB' },
    ],
    markups: [],
  }
}

const makeBranchingProject = (): Project => {
  const input: SubsystemInputNode = {
    id: 'input',
    type: 'SubsystemInput',
    name: 'Input',
    Vout: 12,
  }

  const converterA: ConverterNode = {
    id: 'converterA',
    type: 'Converter',
    name: 'Converter A',
    Vin_min: 10,
    Vin_max: 14,
    Vout: 5,
    efficiency: { type: 'fixed', value: 0.92 },
  }

  const converterB: ConverterNode = {
    id: 'converterB',
    type: 'Converter',
    name: 'Converter B',
    Vin_min: 10,
    Vin_max: 14,
    Vout: 3.3,
    efficiency: { type: 'fixed', value: 0.9 },
  }

  const loadA: LoadNode = {
    id: 'loadA',
    type: 'Load',
    name: 'Load A',
    Vreq: 5,
    I_typ: 2,
    I_max: 3,
  }

  const loadB: LoadNode = {
    id: 'loadB',
    type: 'Load',
    name: 'Load B',
    Vreq: 3.3,
    I_typ: 1.5,
    I_max: 2,
  }

  return {
    id: 'branching',
    name: 'Branching',
    units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
    defaultMargins: { currentPct: 0.1, powerPct: 0.1, voltageDropPct: 0.1, voltageMarginPct: 0.1 },
    scenarios: ['Typical'],
    currentScenario: 'Typical',
    nodes: [input, converterA, converterB, loadA, loadB],
    edges: [
      { id: 'e1', from: 'input', to: 'converterA' },
      { id: 'e2', from: 'input', to: 'converterB' },
      { id: 'e3', from: 'converterA', to: 'loadA' },
      { id: 'e4', from: 'converterB', to: 'loadB' },
    ],
    markups: [],
  }
}

const yById = (nodes: Project['nodes'], id: string): number => {
  const found = nodes.find(node => node.id === id)
  if (!found) throw new Error(`Node ${id} not found in layout result`)
  if (typeof found.y !== 'number') throw new Error(`Node ${id} missing y coordinate`)
  return found.y
}

const verticalSpacingBetween = (nodes: AnyNode[], idA: string, idB: string): number => {
  const first = nodes.find(node => node.id === idA)
  const second = nodes.find(node => node.id === idB)
  if (!first || !second) {
    throw new Error(`Expected nodes ${idA} and ${idB} in layout result`)
  }
  if (typeof first.y !== 'number' || typeof second.y !== 'number') {
    throw new Error('Missing coordinates for spacing measurement')
  }
  const ordered = [first, second].sort((a, b) => (a.y ?? 0) - (b.y ?? 0))
  const top = ordered[0]
  const bottom = ordered[1]
  const topHeight = estimateNodeHeight(top)
  return (bottom.y ?? 0) - ((top.y ?? 0) + topHeight)
}

const makeDisconnectedProject = (): Project => {
  const inputA: SubsystemInputNode = {
    id: 'inputA',
    type: 'SubsystemInput',
    name: 'Input A',
    Vout: 12,
  }

  const loadA: LoadNode = {
    id: 'loadA',
    type: 'Load',
    name: 'Load A',
    Vreq: 12,
    I_typ: 1,
    I_max: 2,
  }

  const inputB: SubsystemInputNode = {
    id: 'inputB',
    type: 'SubsystemInput',
    name: 'Input B',
    Vout: 5,
  }

  const loadB: LoadNode = {
    id: 'loadB',
    type: 'Load',
    name: 'Load B',
    Vreq: 5,
    I_typ: 0.5,
    I_max: 1,
  }

  return {
    id: 'disconnected',
    name: 'Disconnected',
    units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
    defaultMargins: { currentPct: 0.1, powerPct: 0.1, voltageDropPct: 0.1, voltageMarginPct: 0.1 },
    scenarios: ['Typical'],
    currentScenario: 'Typical',
    nodes: [inputA, loadA, inputB, loadB],
    edges: [
      { id: 'edgeA', from: 'inputA', to: 'loadA' },
      { id: 'edgeB', from: 'inputB', to: 'loadB' },
    ],
    markups: [],
  }
}

describe('autoLayoutProject row spacing', () => {
  it('uses the provided row spacing when placing nodes in the same column', () => {
    const base = makeTestProject()

    const defaultLayout = autoLayoutProject(base, { rowSpacing: 100 })
    const customLayout = autoLayoutProject(base, { rowSpacing: 320 })
    const tinyLayout = autoLayoutProject(base, { rowSpacing: 1 })

    const defaultGap = verticalSpacingBetween(defaultLayout.nodes as AnyNode[], 'loadA', 'loadB')
    const customGap = verticalSpacingBetween(customLayout.nodes as AnyNode[], 'loadA', 'loadB')
    const tinyGap = verticalSpacingBetween(tinyLayout.nodes as AnyNode[], 'loadA', 'loadB')

    expect(defaultGap).toBeCloseTo(100, 3)
    expect(customGap).toBeCloseTo(320, 3)
    expect(tinyGap).toBeCloseTo(1, 3)
  })

  it('enforces the minimum gap for non-rightmost columns', () => {
    const project = makeBranchingProject()
    const layout = autoLayoutProject(project, { rowSpacing: 1 })

    const gap = verticalSpacingBetween(layout.nodes as AnyNode[], 'converterA', 'converterB')
    expect(gap).toBeGreaterThanOrEqual(1 - 1e-6)
  })

  it('scales spacing between disconnected components when row spacing changes', () => {
    const project = makeDisconnectedProject()

    const tightLayout = autoLayoutProject(project, { rowSpacing: 60 })
    const looseLayout = autoLayoutProject(project, { rowSpacing: 300 })

    const componentAGround = yById(tightLayout.nodes, 'inputA')
    const componentBGround = yById(tightLayout.nodes, 'inputB')
    const tightGap = componentBGround - componentAGround

    const componentAGroundLoose = yById(looseLayout.nodes, 'inputA')
    const componentBGroundLoose = yById(looseLayout.nodes, 'inputB')
    const looseGap = componentBGroundLoose - componentAGroundLoose

    expect(looseGap).toBeGreaterThan(tightGap)
  })

  it('assigns edge midpoints left-to-right based on source order', () => {
    const project = makeTestProject()
    const layout = autoLayoutProject(project, { columnSpacing: 300, rowSpacing: 120 })

    const nodesById = new Map(layout.nodes.map(node => [node.id, node]))
    const edgesToLoads = layout.edges.filter(edge => edge.to === 'loadA' || edge.to === 'loadB')

    const sorted = edgesToLoads.slice().sort((a, b) => {
      const ay = nodesById.get(a.from)?.y ?? 0
      const by = nodesById.get(b.from)?.y ?? 0
      return ay - by
    })

    let previousMid = Number.NEGATIVE_INFINITY
    for (const edge of sorted) {
      expect(edge.midpointX).toBeGreaterThan(previousMid)
      previousMid = edge.midpointX ?? 0

      const source = nodesById.get(edge.from)
      const target = nodesById.get(edge.to)
      const minX = Math.min(source?.x ?? 0, target?.x ?? 0)
      const maxX = Math.max(source?.x ?? 0, target?.x ?? 0)
      expect(edge.midpointX).toBeGreaterThanOrEqual(minX)
      expect(edge.midpointX).toBeLessThanOrEqual(maxX)
    }
  })
})

