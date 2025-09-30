import { describe, expect, it } from 'vitest'
import { buildConverterSummary } from '../converterSummary'
import { compute } from '../calc'
import type { Project } from '../models'

describe('buildConverterSummary', () => {
  it('summarizes converter and dual-output converter nodes with branch details', () => {
    const subsystemProject: Project = {
      id: 'sub-proj',
      name: 'Rack',
      units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
      defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
      scenarios: ['Typical', 'Max', 'Idle'],
      currentScenario: 'Typical',
      nodes: [
        { id: 'subIn', type: 'SubsystemInput', name: 'Rack Input', Vout: 48 },
        {
          id: 'rackConv',
          type: 'Converter',
          name: 'Rack Buck',
          topology: 'buck',
          Vin_min: 40,
          Vin_max: 60,
          Vout: 12,
          efficiency: { type: 'fixed', value: 0.9 },
        } as any,
        { id: 'rackLoad', type: 'Load', name: 'Rack Load', Vreq: 12, I_typ: 1.5, I_max: 1.5, Utilization_typ: 100, Utilization_max: 100 },
      ],
      edges: [
        { id: 'sub-e1', from: 'subIn', to: 'rackConv' },
        { id: 'sub-e2', from: 'rackConv', to: 'rackLoad' },
      ],
    }

    const project: Project = {
      id: 'proj',
      name: 'Converter Summary Test',
      units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
      defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
      scenarios: ['Typical', 'Max', 'Idle'],
      currentScenario: 'Typical',
      nodes: [
        { id: 'src', type: 'Source', name: 'Source', Vout: 48 },
        {
          id: 'buck',
          type: 'Converter',
          name: 'Buck',
          topology: 'buck',
          Vin_min: 36,
          Vin_max: 60,
          Vout: 12,
          efficiency: { type: 'fixed', value: 0.92 },
        } as any,
        {
          id: 'dual',
          type: 'DualOutputConverter',
          name: 'Dual',
          Vin_min: 40,
          Vin_max: 60,
          outputs: [
            {
              id: 'outputA',
              label: 'A',
              Vout: 12,
              efficiency: { type: 'fixed', value: 0.95 },
            },
            {
              id: 'outputB',
              label: 'B',
              Vout: 5,
              efficiency: { type: 'fixed', value: 0.9 },
            },
          ],
        } as any,
        {
          id: 'rack',
          type: 'Subsystem',
          name: 'Rack',
          inputV_nom: 48,
          numParalleledSystems: 2,
          project: subsystemProject,
        } as any,
        { id: 'loadBuck', type: 'Load', name: 'Buck Load', Vreq: 12, I_typ: 3, I_max: 3, Utilization_typ: 100, Utilization_max: 100 },
        { id: 'loadA', type: 'Load', name: 'Load A', Vreq: 12, I_typ: 1, I_max: 1, Utilization_typ: 100, Utilization_max: 100 },
        { id: 'loadB', type: 'Load', name: 'Load B', Vreq: 5, I_typ: 2, I_max: 2, Utilization_typ: 100, Utilization_max: 100 },
      ],
      edges: [
        { id: 'e1', from: 'src', to: 'buck' },
        { id: 'e2', from: 'buck', to: 'loadBuck' },
        { id: 'e3', from: 'src', to: 'dual' },
        { id: 'e4', from: 'dual', to: 'loadA', fromHandle: 'outputA' },
        { id: 'e5', from: 'dual', to: 'loadB', fromHandle: 'outputB' },
        { id: 'e6', from: 'src', to: 'rack', toHandle: 'subIn' },
      ],
    }

    const result = compute(project)
    const summary = buildConverterSummary(project, result)

    expect(summary.length).toBe(3)

    const buck = summary.find(entry => entry.id === 'buck')
    expect(buck).toBeDefined()
    expect(buck!.nodeType).toBe('Converter')
    expect(buck!.location).toBe('System')
    expect(buck!.key).toBe('buck')
    expect(buck!.pin).toBeCloseTo(39.1304, 3)
    expect(buck!.pout).toBeCloseTo(36, 5)
    expect(buck!.loss).toBeCloseTo(3.1304, 3)
    expect(buck!.efficiency).toBeCloseTo(0.92, 5)
    expect(buck!.vout).toBe(12)
    expect(buck!.iout).toBeCloseTo(3, 5)
    expect(buck!.edgeLoss).toBeCloseTo(0, 5)
    expect(buck!.lossPerPhase).toBeUndefined()

    const dual = summary.find(entry => entry.id === 'dual')
    expect(dual).toBeDefined()
    expect(dual!.nodeType).toBe('DualOutputConverter')
    expect(dual!.location).toBe('System')
    expect(dual!.key).toBe('dual')
    expect(dual!.outputs).toBeDefined()
    expect(dual!.outputs!.length).toBe(2)
    expect(dual!.pin).toBeCloseTo(23.74269, 5)
    expect(dual!.pout).toBeCloseTo(22, 5)
    expect(dual!.loss).toBeCloseTo(1.74269, 5)
    expect(dual!.efficiency).toBeCloseTo(0.926601, 6)
    expect(dual!.iout).toBeCloseTo(3, 5)
    expect(dual!.edgeLoss).toBeCloseTo(0, 5)

    const branchA = dual!.outputs!.find(o => o.id === 'outputA')
    const branchB = dual!.outputs!.find(o => o.id === 'outputB')
    expect(branchA).toBeDefined()
    expect(branchA!.pin).toBeCloseTo(12.6315, 3)
    expect(branchA!.pout).toBeCloseTo(12, 5)
    expect(branchA!.efficiency).toBeCloseTo(0.95, 5)
    expect(branchA!.iout).toBeCloseTo(1, 5)
    expect(branchA!.edgeLoss).toBeCloseTo(0, 5)
    expect(branchB).toBeDefined()
    expect(branchB!.pin).toBeCloseTo(11.1111, 3)
    expect(branchB!.pout).toBeCloseTo(10, 5)
    expect(branchB!.efficiency).toBeCloseTo(0.9, 5)
    expect(branchB!.iout).toBeCloseTo(2, 5)
    expect(branchB!.edgeLoss).toBeCloseTo(0, 5)

    const rackBuck = summary.find(entry => entry.id === 'rackConv')
    expect(rackBuck).toBeDefined()
    expect(rackBuck!.nodeType).toBe('Converter')
    expect(rackBuck!.location).toBe('Rack')
    expect(rackBuck!.key).toBe('rack>rackConv')
    expect(rackBuck!.pin).toBeCloseTo(20, 3)
    expect(rackBuck!.pout).toBeCloseTo(18, 5)
    expect(rackBuck!.loss).toBeCloseTo(2, 3)
    expect(rackBuck!.efficiency).toBeCloseTo(0.9, 5)
    expect(rackBuck!.iout).toBeCloseTo(1.5, 5)
    expect(rackBuck!.edgeLoss).toBeCloseTo(0, 5)
  })
})

