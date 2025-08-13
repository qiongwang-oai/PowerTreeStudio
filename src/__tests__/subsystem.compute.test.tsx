import { describe, it, expect } from 'vitest'
import { compute } from '../calc'
import { Project } from '../models'

describe('Subsystem with Subsystem Input Port', ()=>{
  it('rolls up inner power and sets parent edge current', ()=>{
    const inner: Project = {
      id:'pi', name:'Inner',
      units:{voltage:'V',current:'A',power:'W',resistance:'mΩ'},
      defaultMargins:{ currentPct:10, powerPct:10, voltageDropPct:5, voltageMarginPct:3 },
      scenarios:['Typical','Max','Idle'], currentScenario:'Typical',
      nodes:[
        {id:'in', type:'SubsystemInput', name:'IN'},
        {id:'conv', type:'Converter', name:'Buck', Vin_min:10, Vin_max:14, Vout:5, efficiency:{type:'fixed', value:0.9}},
        {id:'load', type:'Load', name:'L', Vreq:5, I_typ:2, I_max:3}
      ] as any,
      edges:[{id:'e1', from:'in', to:'conv'},{id:'e2', from:'conv', to:'load'}]
    }
    const parent: Project = {
      id:'pp', name:'Parent',
      units:{voltage:'V',current:'A',power:'W',resistance:'mΩ'},
      defaultMargins:{ currentPct:10, powerPct:10, voltageDropPct:5, voltageMarginPct:3 },
      scenarios:['Typical','Max','Idle'], currentScenario:'Typical',
      nodes:[
        {id:'s', type:'Source', name:'S', V_nom:12},
        {id:'sub', type:'Subsystem', name:'SUB', inputV_nom:12, project: inner}
      ] as any,
      edges:[{id:'e', from:'s', to:'sub'}]
    }
    const r = compute(parent)
    const sub = r.nodes['sub']!
    expect(sub.P_out).toBeGreaterThan(0)
    expect(sub.P_in).toBeGreaterThan((sub.P_out || 0) - 1e-9)
    const edgeI = r.edges['e']!.I_edge!
    expect(edgeI).toBeCloseTo((sub.P_in || 0)/12, 6)
  })
})


