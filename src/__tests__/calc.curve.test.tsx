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
    expect(conv.P_out).toBeCloseTo(50, 3)
    expect(conv.P_in! - conv.P_out!).toBeGreaterThan(0)
    const e2 = r.edges['e2']
    expect(e2.P_loss_edge).toBeGreaterThan(0)
  })
})
