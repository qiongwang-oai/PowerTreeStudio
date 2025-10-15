import { describe, expect, it } from 'vitest'
import type { Project } from '../models'
import { compute } from '../calc'
import { buildConverterSummary } from '../converterSummary'
import { buildLevelPieData } from '../reportData'

const baseUnits = { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' } as const
const baseMargins = { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 } as const

describe('Efuse/Resistor node', () => {
  const makeProject = (overrides?: Partial<Project>): Project => ({
    id: 'proj-efuse',
    name: 'Efuse Project',
    units: baseUnits,
    defaultMargins: baseMargins,
    scenarios: ['Typical', 'Max', 'Idle'],
    currentScenario: 'Typical',
    nodes: [],
    edges: [],
    ...(overrides ?? {}),
  })

  it('computes dissipation based on resistance and downstream current', () => {
    const project: Project = makeProject({
      nodes: [
        { id: 'src', type: 'Source', name: 'Source', Vout: 12 },
        { id: 'efuse', type: 'Bus', name: 'Efuse', V_bus: 12, R_milliohm: 50 },
        { id: 'load', type: 'Load', name: 'Load', Vreq: 12, I_typ: 2, I_max: 2, Utilization_typ: 100, Utilization_max: 100 },
      ] as any,
      edges: [
        { id: 'e1', from: 'src', to: 'efuse' },
        { id: 'e2', from: 'efuse', to: 'load' },
      ],
    })

    const result = compute(project)
    const bus = result.nodes['efuse'] as any
    const source = result.nodes['src'] as any

    expect(bus).toBeDefined()
    expect(bus.P_out).toBeCloseTo(24, 5)
    expect(bus.P_in).toBeCloseTo(24.2, 5)
    expect(bus.loss).toBeCloseTo(0.2, 6)
    expect(bus.I_out).toBeCloseTo(2, 5)
    expect(bus.I_in).toBeCloseTo(2, 5)
    expect(source.P_out).toBeCloseTo(24.2, 5)

    const summary = buildConverterSummary(project, result)
    const efuseEntry = summary.find(entry => entry.id === 'efuse')
    expect(efuseEntry).toBeDefined()
    expect(efuseEntry?.nodeType).toBe('Efuse/Resistor')
    expect(efuseEntry?.loss).toBeCloseTo(0.2, 6)
    expect(efuseEntry?.pin).toBeCloseTo(24.2, 5)
    expect(efuseEntry?.pout).toBeCloseTo(24, 5)

    const pie = buildLevelPieData(project, result)
    const lossesSlice = pie.find(slice => slice.id === '__losses__')
    expect(lossesSlice).toBeDefined()
    expect(lossesSlice?.value).toBeCloseTo(0.2, 5)
  })
})

