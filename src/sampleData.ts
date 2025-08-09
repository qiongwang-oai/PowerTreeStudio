import { Project } from './models'
import { genId } from './utils'
const src = { id: genId('n_'), type:'Source', name: '48V PSU', V_nom: 48, P_max: 2000, x: 80, y: 80 } as const
const buck = { id: genId('n_'), type:'Converter', name: '12V Buck 95%', Vin_min:40, Vin_max:60, Vout:12, Pout_max:1200, efficiency: { type:'fixed', value:0.95 } as const, x: 340, y: 160 } as const
const vrm = { id: genId('n_'), type:'Converter', name:'CPU VRM 0.9V 92%', Vin_min:10, Vin_max:13, Vout:0.9, Pout_max:250, efficiency: { type:'fixed', value:0.92 } as const, x: 640, y: 160 } as const
const fan = { id: genId('n_'), type:'Load', name:'Fan Bank', Vreq:12, I_typ:5, I_max:10, x: 640, y: 280 } as const
const cpu = { id: genId('n_'), type:'Load', name:'CPU', Vreq:0.9, I_typ:120, I_max:220, x: 860, y: 140 } as const
const e1 = { id: genId('e_'), from: src.id, to: buck.id, interconnect:{ R_milliohm: 5 } }
const e2 = { id: genId('e_'), from: buck.id, to: vrm.id, interconnect:{ R_milliohm: 2 } }
const e3 = { id: genId('e_'), from: buck.id, to: fan.id, interconnect:{ R_milliohm: 10 } }
export const sampleProject: Project = {
  id: genId('p_'), name: 'Sample Server Tree',
  units: { voltage:'V', current:'A', power:'W', resistance:'mΩ' },
  defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
  scenarios: ['Typical','Max','Idle'], currentScenario: 'Typical',
  nodes: [src as any, buck as any, vrm as any, fan as any, cpu as any],
  edges: [e1 as any, e2 as any, e3 as any]
}
