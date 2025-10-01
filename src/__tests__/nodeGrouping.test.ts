import { describe, it, expect } from 'vitest'
import type { AnyNode, Project } from '../models'
import { collectProjectNodeGroups } from '../utils/nodeGrouping'

const makeProject = (nodes: AnyNode[], edges: any[] = []): Project => ({
  id: 'proj-test',
  name: 'Project',
  units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
  defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
  scenarios: ['Typical', 'Max', 'Idle'],
  currentScenario: 'Typical',
  nodes,
  edges,
})

describe('collectProjectNodeGroups', () => {
  it('groups nodes by subsystem path', () => {
    const loadNode: AnyNode = {
      id: 'load-1',
      type: 'Load',
      name: 'Compute Rail',
      Vreq: 5,
      I_typ: 1,
      I_max: 2,
    } as any
    const subsystem: AnyNode = {
      id: 'sub-1',
      type: 'Subsystem',
      name: 'Subsystem A',
      inputV_nom: 12,
      project: makeProject([loadNode]),
    } as any
    const source: AnyNode = {
      id: 'src-1',
      type: 'Source',
      name: 'Main Source',
      Vout: 12,
    } as any
    const rootProject = makeProject([source, subsystem])

    const { groups, nodeIndex } = collectProjectNodeGroups(rootProject)

    expect(groups.length).toBe(2)
    const rootGroup = groups[0]
    const subsystemGroup = groups[1]

    expect(rootGroup.label).toBe('Top Level System')
    expect(rootGroup.nodeKeys.length).toBe(2)

    expect(subsystemGroup.label).toBe('Subsystem A')
    expect(subsystemGroup.nodeKeys.length).toBe(1)
    expect(subsystemGroup.path).toEqual(['sub-1'])
    expect(subsystemGroup.nameTrail).toEqual(['Subsystem A'])

    const indexEntries = Object.values(nodeIndex)
    expect(indexEntries.map(entry => entry.nodeId).sort()).toEqual(['load-1', 'src-1', 'sub-1'])

    const loadEntry = indexEntries.find(entry => entry.nodeId === 'load-1')
    expect(loadEntry?.path).toEqual(['sub-1'])
    expect(loadEntry?.pathNames).toEqual(['Subsystem A'])

    const sourceEntry = indexEntries.find(entry => entry.nodeId === 'src-1')
    expect(sourceEntry?.path).toEqual([])
  })
})


