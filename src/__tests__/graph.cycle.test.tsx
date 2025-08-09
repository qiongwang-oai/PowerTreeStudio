import { describe, it, expect } from 'vitest'
import { compute } from '../calc'
import { Project } from '../models'
it('prevents compute on cycle', ()=>{
  const proj: Project = {
    id:'p', name:'T', units:{voltage:'V',current:'A',power:'W',resistance:'mΩ'},
    defaultMargins:{ currentPct:10, powerPct:10, voltageDropPct:5, voltageMarginPct:3 },
    scenarios:['Typical','Max','Idle'], currentScenario:'Typical',
    nodes:[
      {id:'a', type:'Source', name:'A', V_nom:12},
      {id:'b', type:'Converter', name:'B', Vin_min:10, Vin_max:14, Vout:5, efficiency:{type:'fixed', value:0.9}},
      {id:'c', type:'Load', name:'C', Vreq:5, I_typ:1, I_max:2}
    ] as any,
    edges:[{id:'e1', from:'a', to:'b'},{id:'e2', from:'b', to:'a'}]
  }
  const r = compute(proj)
  expect(r.globalWarnings.length).toBeGreaterThan(0)
})
