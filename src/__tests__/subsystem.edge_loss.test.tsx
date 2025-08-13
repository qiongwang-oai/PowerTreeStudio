import { describe, it, expect } from 'vitest'
import { compute } from '../calc'
import { Project } from '../models'

describe('converter to subsystem includes edge loss in P_out', ()=>{
  it('adds converter->subsystem edge loss to converter P_out', ()=>{
    const inner: Project = {
      id:'pi', name:'Inner',
      units:{voltage:'V',current:'A',power:'W',resistance:'mΩ'},
      defaultMargins:{ currentPct:10, powerPct:10, voltageDropPct:5, voltageMarginPct:3 },
      scenarios:['Typical','Max','Idle'], currentScenario:'Typical',
      nodes:[
        {id:'in', type:'SubsystemInput', name:'IN'},
        {id:'l', type:'Load', name:'L', Vreq:5, I_typ:2, I_max:2}
      ] as any,
      edges:[{id:'ei', from:'in', to:'l', interconnect:{ R_milliohm: 0 }}]
    }
    const parent: Project = {
      id:'pp', name:'Parent',
      units:{voltage:'V',current:'A',power:'W',resistance:'mΩ'},
      defaultMargins:{ currentPct:10, powerPct:10, voltageDropPct:5, voltageMarginPct:3 },
      scenarios:['Typical','Max','Idle'], currentScenario:'Typical',
      nodes:[
        {id:'s', type:'Source', name:'S', Vout:12},
        {id:'c', type:'Converter', name:'Buck', Vin_min:10, Vin_max:14, Vout:12, efficiency:{type:'fixed', value:0.95}},
        {id:'sub', type:'Subsystem', name:'SUB', inputV_nom:12, project: inner}
      ] as any,
      edges:[{id:'e1', from:'s', to:'c', interconnect:{ R_milliohm: 0 }},{id:'e2', from:'c', to:'sub', interconnect:{ R_milliohm: 100 }}]
    }
    const r = compute(parent)
    const sub = r.nodes['sub']!
    // inner load power = 5V * 2A = 10W, inner source input ~10W (no inner edge loss)
    expect(sub.P_in).toBeCloseTo(10, 6)
    const e2 = r.edges['e2']!
    const conv = r.nodes['c']!
    // Edge loss: I = sub.P_in / 12 = 0.8333A; R=0.1Ω => Ploss ~ 0.06944W
    expect(e2.P_loss_edge!).toBeGreaterThan(0)
    expect(conv.P_out!).toBeCloseTo(sub.P_in! + e2.P_loss_edge!, 6)
  })
})


