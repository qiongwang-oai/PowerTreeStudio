import { describe, expect, it } from 'vitest'
import { compute } from '../calc'
import type { Project } from '../models'

describe('dual-output converter compute', () => {
  it('distributes power to each output with efficiency applied per branch', () => {
    const project: Project = {
      id: 'p',
      name: 'Dual Test',
      units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
      defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
      scenarios: ['Typical', 'Max', 'Idle'],
      currentScenario: 'Typical',
      nodes: [
        { id: 'src', type: 'Source', name: 'Source', Vout: 48 },
        {
          id: 'dual',
          type: 'DualOutputConverter',
          name: 'Dual',
          Vin_min: 40,
          Vin_max: 60,
          controllerPartNumber: '',
          powerStagePartNumber: '',
          controllerDatasheetRef: '',
          powerStageDatasheetRef: '',
          outputs: [
            {
              id: 'outputA',
              label: 'A',
              Vout: 12,
              Iout_max: 10,
              Pout_max: 120,
              phaseCount: 1,
              efficiency: { type: 'fixed', value: 0.95 },
            },
            {
              id: 'outputB',
              label: 'B',
              Vout: 5,
              Iout_max: 20,
              Pout_max: 100,
              phaseCount: 1,
              efficiency: { type: 'fixed', value: 0.9 },
            },
          ],
        } as any,
        { id: 'loadA', type: 'Load', name: 'LoadA', Vreq: 12, I_typ: 1, I_max: 1, numParalleledDevices: 1, Utilization_typ: 100, Utilization_max: 100 },
        { id: 'loadB', type: 'Load', name: 'LoadB', Vreq: 5, I_typ: 2, I_max: 2, numParalleledDevices: 1, Utilization_typ: 100, Utilization_max: 100 },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'dual' },
        { id: 'e2', from: 'dual', to: 'loadA', fromHandle: 'outputA' },
        { id: 'e3', from: 'dual', to: 'loadB', fromHandle: 'outputB' },
      ],
    }

    const result = compute(project)
    const dualNode = result.nodes['dual'] as any
    expect(dualNode.type).toBe('DualOutputConverter')
    const expectedBranchAOut = 12 // 12V * 1A
    const expectedBranchBOut = 10 // 5V * 2A
    const expectedBranchAIn = expectedBranchAOut / 0.95
    const expectedBranchBIn = expectedBranchBOut / 0.9

    expect(dualNode.P_out).toBeCloseTo(expectedBranchAOut + expectedBranchBOut, 5)
    expect(dualNode.P_in).toBeCloseTo(expectedBranchAIn + expectedBranchBIn, 5)
    const outputs = (dualNode as any).__outputs || {}
    expect(outputs.outputA.P_out).toBeCloseTo(expectedBranchAOut, 5)
    expect(outputs.outputA.P_in).toBeCloseTo(expectedBranchAIn, 5)
    expect(outputs.outputB.P_out).toBeCloseTo(expectedBranchBOut, 5)
    expect(outputs.outputB.P_in).toBeCloseTo(expectedBranchBIn, 5)
    expect(dualNode.I_in).toBeCloseTo((expectedBranchAIn + expectedBranchBIn) / 48, 5)
  })
})
