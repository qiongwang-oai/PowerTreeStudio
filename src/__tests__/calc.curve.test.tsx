import { describe, it, expect } from 'vitest'
import { compute } from '../calc'
import { Project } from '../models'
const proj: Project = {
  id: 'p1', name: 'T', units: { voltage:'V', current:'A', power:'W', resistance:'mΩ' },
  defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
  scenarios: ['Typical','Max','Idle'], currentScenario: 'Typical',
  nodes: [
    { id:'s', type:'Source', name:'S', V_nom:12 },
    { id:'c', type:'Converter', name:'C', Vin_min:10, Vin_max:14, Vout:5, Pout_max:100, Iout_max:30, efficiency:{ type:'curve', base:'Pout_max', points:[{loadPct:0,eta:0.8},{loadPct:50,eta:0.9},{loadPct:100,eta:0.95}] } },
    { id:'l', type:'Load', name:'L', Vreq:5, I_typ:10, I_max:20 }
  ] as any,
  edges: [{ id:'e1', from:'s', to:'c', interconnect:{ R_milliohm: 1 } }, { id:'e2', from:'c', to:'l', interconnect:{ R_milliohm: 1 } }]
}
describe('curve efficiency', ()=>{
  it('computes P_in/P_out and edge losses', ()=>{
    const r = compute(proj)
    const conv = r.nodes['c']
    const e2 = r.edges['e2']
    expect(conv.P_out).toBeCloseTo(50 + (e2.P_loss_edge || 0), 3)
    expect(conv.P_in! - conv.P_out!).toBeGreaterThan(0)
    expect(e2.P_loss_edge).toBeGreaterThan(0)
    expect((conv.P_out || 0) / Math.max(conv.P_in || 1, 1e-9)).toBeCloseTo(0.9, 3)
  })

  it('applies per-phase efficiency data for multi-phase converters', () => {
    const project: Project = {
      id: 'ph',
      name: 'PerPhase',
      units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
      defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
      scenarios: ['Typical', 'Max', 'Idle'],
      currentScenario: 'Typical',
      nodes: [
        { id: 's', type: 'Source', name: 'Src', Vout: 12 },
        {
          id: 'c',
          type: 'Converter',
          name: 'VRM',
          Vin_min: 10,
          Vin_max: 14,
          Vout: 10,
          Iout_max: 40,
          phaseCount: 2,
          efficiency: {
            type: 'curve',
            base: 'Iout_max',
            perPhase: true,
            points: [
              { current: 0, eta: 0.9 },
              { current: 20, eta: 0.95 },
            ],
          },
        } as any,
        { id: 'l', type: 'Load', name: 'L', Vreq: 10, I_typ: 30, I_max: 30 },
      ] as any,
      edges: [
        { id: 'es', from: 's', to: 'c' },
        { id: 'ec', from: 'c', to: 'l' },
      ],
    }

    const result = compute(project)
    const conv = result.nodes['c'] as any
    const eta = (conv.P_out || 0) / Math.max(conv.P_in || 1, 1e-9)
    expect(eta).toBeCloseTo(0.9375, 4)
  })

  it('uses 2d efficiency based on converter Vout and output current', () => {
    const project: Project = {
      id: 'curve-2d-converter',
      name: '2D Converter',
      units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
      defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
      scenarios: ['Typical', 'Max', 'Idle'],
      currentScenario: 'Typical',
      nodes: [
        { id: 's', type: 'Source', name: 'Src', Vout: 12 },
        {
          id: 'c',
          type: 'Converter',
          name: 'POL',
          Vin_min: 10,
          Vin_max: 14,
          Vout: 1.8,
          Iout_max: 10,
          efficiency: {
            type: 'curve',
            mode: '2d',
            table: {
              outputVoltages: [1.2, 1.8],
              outputCurrents: [0, 10],
              values: [
                [0.8, 0.9],
                [0.82, 0.94],
              ],
            },
          },
        } as any,
        { id: 'l', type: 'Load', name: 'Core', Vreq: 1.8, I_typ: 5, I_max: 5 },
      ] as any,
      edges: [
        { id: 'es', from: 's', to: 'c' },
        { id: 'ec', from: 'c', to: 'l' },
      ],
    }

    const result = compute(project)
    const conv = result.nodes['c'] as any
    const eta = (conv.P_out || 0) / Math.max(conv.P_in || 1, 1e-9)
    expect(eta).toBeCloseTo(0.88, 3)
  })

  it('uses branch-specific Vout for dual-output 2d efficiency', () => {
    const project: Project = {
      id: 'curve-2d-dual',
      name: '2D Dual',
      units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
      defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
      scenarios: ['Typical', 'Max', 'Idle'],
      currentScenario: 'Typical',
      nodes: [
        { id: 's', type: 'Source', name: 'Src', Vout: 12 },
        {
          id: 'd',
          type: 'DualOutputConverter',
          name: 'PMIC',
          Vin_min: 10,
          Vin_max: 14,
          outputs: [
            {
              id: 'out-a',
              label: 'A',
              Vout: 1.0,
              Iout_max: 10,
              efficiency: {
                type: 'curve',
                mode: '2d',
                table: {
                  outputVoltages: [1.0, 1.8],
                  outputCurrents: [0, 10],
                  values: [
                    [0.7, 0.75],
                    [0.82, 0.94],
                  ],
                },
              },
            },
            {
              id: 'out-b',
              label: 'B',
              Vout: 1.8,
              Iout_max: 10,
              efficiency: {
                type: 'curve',
                mode: '2d',
                table: {
                  outputVoltages: [1.0, 1.8],
                  outputCurrents: [0, 10],
                  values: [
                    [0.7, 0.75],
                    [0.82, 0.94],
                  ],
                },
              },
            },
          ],
        } as any,
        { id: 'l', type: 'Load', name: 'Memory', Vreq: 1.8, I_typ: 5, I_max: 5 },
      ] as any,
      edges: [
        { id: 'es', from: 's', to: 'd' },
        { id: 'eb', from: 'd', fromHandle: 'out-b', to: 'l' },
      ],
    }

    const result = compute(project)
    const dual = result.nodes['d'] as any
    expect(dual.__outputs['out-b'].eta).toBeCloseTo(0.88, 3)
  })

  it('falls back to default efficiency when a 2d table is malformed', () => {
    const project: Project = {
      id: 'curve-2d-invalid',
      name: '2D Invalid',
      units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
      defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
      scenarios: ['Typical', 'Max', 'Idle'],
      currentScenario: 'Typical',
      nodes: [
        { id: 's', type: 'Source', name: 'Src', Vout: 12 },
        {
          id: 'c',
          type: 'Converter',
          name: 'Broken',
          Vin_min: 10,
          Vin_max: 14,
          Vout: 1.2,
          Iout_max: 10,
          efficiency: {
            type: 'curve',
            mode: '2d',
            table: {
              outputVoltages: [1.2],
              outputCurrents: [0, 10],
              values: [[0.8]],
            },
          },
        } as any,
        { id: 'l', type: 'Load', name: 'ASIC', Vreq: 1.2, I_typ: 5, I_max: 5 },
      ] as any,
      edges: [
        { id: 'es', from: 's', to: 'c' },
        { id: 'ec', from: 'c', to: 'l' },
      ],
    }

    const result = compute(project)
    const conv = result.nodes['c'] as any
    const eta = (conv.P_out || 0) / Math.max(conv.P_in || 1, 1e-9)
    expect(eta).toBeCloseTo(0.9, 3)
  })
})
