import { describe, it, expect } from 'vitest'
import { compute } from '../calc'
import { Project } from '../models'
describe('validation warnings', ()=>{
  it('overcurrent and V_drop warning', ()=>{
    const proj: Project = {
      id:'p', name:'T', units:{voltage:'V',current:'A',power:'W',resistance:'mΩ'},
      defaultMargins:{ currentPct:10, powerPct:10, voltageDropPct:5, voltageMarginPct:3 },
      scenarios:['Typical','Max','Idle'], currentScenario:'Typical',
      nodes:[
        {id:'s', type:'Source', name:'S', V_nom:12},
        {id:'c', type:'Converter', name:'C', Vin_min:10, Vin_max:14, Vout:5, Iout_max:5, Pout_max:40, efficiency:{type:'fixed', value:0.9}},
        {id:'l', type:'Load', name:'L', Vreq:5, I_typ:10, I_max:12}
      ] as any,
      edges:[{id:'e1', from:'s', to:'c', interconnect:{R_milliohm:1}},{id:'e2', from:'c', to:'l', interconnect:{R_milliohm:100}}]
    }
    const r = compute(proj)
    expect(r.nodes['c'].warnings.length).toBeGreaterThan(0)
    const loadWarns = r.nodes['l'].warnings
    expect(loadWarns.length).toBeGreaterThan(0)
  })
})
