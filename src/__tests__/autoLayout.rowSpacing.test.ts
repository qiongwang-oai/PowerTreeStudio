import { describe, it, expect } from 'vitest'

import { autoLayoutProject } from '../utils/autoLayout'
import type { Project, SubsystemInputNode, ConverterNode, LoadNode } from '../models'

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

const yById = (nodes: Project['nodes'], id: string): number => {
  const found = nodes.find(node => node.id === id)
  if (!found) throw new Error(`Node ${id} not found in layout result`)
  if (typeof found.y !== 'number') throw new Error(`Node ${id} missing y coordinate`)
  return found.y
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

    const defaultGap = Math.abs(yById(defaultLayout.nodes, 'loadB') - yById(defaultLayout.nodes, 'loadA'))
    const customGap = Math.abs(yById(customLayout.nodes, 'loadB') - yById(customLayout.nodes, 'loadA'))

    expect(defaultGap).toBeGreaterThan(0)
    expect(customGap).toBeGreaterThan(defaultGap)
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
})

