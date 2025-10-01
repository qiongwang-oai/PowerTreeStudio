import { describe, it, expect } from 'vitest'
import type { AnyNode, Project } from '../models'
import { useStore } from '../state/store'

const makeProject = (nodes: AnyNode[], edges: any[] = []): Project => ({
  id: 'proj-bulk',
  name: 'Bulk Project',
  units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
  defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
  scenarios: ['Typical', 'Max', 'Idle'],
  currentScenario: 'Typical',
  nodes,
  edges,
})

describe('bulkUpdateNodes', () => {
  it('applies patches to multiple root nodes', () => {
    const source: AnyNode = { id: 'src', type: 'Source', name: 'Source', Vout: 12 } as any
    const load: AnyNode = { id: 'load', type: 'Load', name: 'Load', Vreq: 5, I_typ: 1, I_max: 2 } as any
    const project = makeProject([source, load])
    const { setProject, bulkUpdateNodes } = useStore.getState()
    setProject(project)

    bulkUpdateNodes([
      { nodeId: 'src', patch: { Vout: 13.2 } },
      { nodeId: 'load', patch: { Vreq: 4.8, numParalleledDevices: 2 } },
    ])

    const updated = useStore.getState().project
    const updatedSource = updated.nodes.find(node => node.id === 'src') as any
    const updatedLoad = updated.nodes.find(node => node.id === 'load') as any

    expect(updatedSource?.Vout).toBe(13.2)
    expect(updatedLoad?.Vreq).toBe(4.8)
    expect(updatedLoad?.numParalleledDevices).toBe(2)
  })

  it('updates nodes nested inside subsystems when provided a path', () => {
    const nestedLoad: AnyNode = { id: 'nested-load', type: 'Load', name: 'Nested Load', Vreq: 3.3, I_typ: 0.5, I_max: 1 } as any
    const subsystem: AnyNode = {
      id: 'sub',
      type: 'Subsystem',
      name: 'Subsystem',
      inputV_nom: 12,
      project: makeProject([nestedLoad]),
    } as any
    const project = makeProject([subsystem])
    const { setProject, bulkUpdateNodes } = useStore.getState()
    setProject(project)

    bulkUpdateNodes([
      { nodeId: 'nested-load', subsystemPath: ['sub'], patch: { Vreq: 3.6, critical: false } },
    ])

    const updated = useStore.getState().project
    const updatedSubsystem = updated.nodes.find(node => node.id === 'sub') as any
    const updatedLoad = updatedSubsystem.project.nodes.find((node: AnyNode) => node.id === 'nested-load') as any

    expect(updatedLoad?.Vreq).toBe(3.6)
    expect(updatedLoad?.critical).toBe(false)
    // ensure subsystem path nodes not duplicated
    expect(updatedSubsystem.project.nodes.length).toBe(1)
  })
})

describe('bulkAddNodes', () => {
  it('adds nodes to the top-level project', () => {
    const source: AnyNode = { id: 'src', type: 'Source', name: 'Source', Vout: 12 } as any
    const project = makeProject([source])
    const { setProject, bulkAddNodes } = useStore.getState()
    setProject(project)

    const newLoad: AnyNode = { id: 'load-new', type: 'Load', name: 'Extra Load', Vreq: 5, I_typ: 1, I_max: 2 } as any

    bulkAddNodes([
      { node: newLoad },
    ])

    const updated = useStore.getState().project
    expect(updated.nodes.some(node => node.id === 'load-new')).toBe(true)
  })

  it('adds nodes inside nested subsystems when provided a path', () => {
    const subsystem: AnyNode = {
      id: 'sub',
      type: 'Subsystem',
      name: 'Subsystem',
      inputV_nom: 12,
      project: makeProject([], []),
    } as any
    const project = makeProject([subsystem])
    const { setProject, bulkAddNodes } = useStore.getState()
    setProject(project)

    const nestedLoad: AnyNode = { id: 'nested-load', type: 'Load', name: 'Nested Load', Vreq: 3.3, I_typ: 0.5, I_max: 1 } as any

    bulkAddNodes([
      { node: nestedLoad, subsystemPath: ['sub'] },
    ])

    const updated = useStore.getState().project
    const updatedSubsystem = updated.nodes.find(node => node.id === 'sub') as any
    expect(updatedSubsystem.project.nodes.some((node: AnyNode) => node.id === 'nested-load')).toBe(true)
  })
})


