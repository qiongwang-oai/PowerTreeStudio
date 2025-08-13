import React from 'react'
import { Button } from '../ui/button'
import { useStore } from '../../state/store'
import { genId } from '../../utils'
import { AnyNode, Project } from '../../models'

function createPreset(type:'Converter'|'Load'|'Bus'|'Note'|'Subsystem'|'SubsystemInput'): AnyNode {
  const id = genId('n_')
  if (type==='Converter') return { id, type, name:'Buck', Vin_min:40, Vin_max:60, Vout:12, efficiency:{type:'fixed', value:0.95}, x: 320, y: 160 } as any
  if (type==='Load') return { id, type, name:'Load', Vreq:12, I_typ:1, I_idle:1, I_max:2, x: 560, y: 240 } as any
  if (type==='Bus') return { id, type, name:'Bus', V_bus:12, x: 420, y: 220 } as any
  if (type==='Subsystem') return { id, type, name:'Subsystem', inputV_nom:12, numParalleledSystems: 1,
    project: { id: genId('p_'), name: 'Embedded', units: { voltage:'V', current:'A', power:'W', resistance:'mΩ' }, defaultMargins: { currentPct:10, powerPct:10, voltageDropPct:5, voltageMarginPct:3 }, scenarios: ['Typical','Max','Idle'], currentScenario: 'Typical', nodes: [], edges: [] }, x: 420, y: 300 } as any
  if (type==='SubsystemInput') return { id, type, name:'Subsystem Input', Vout: 12, x: 80, y: 80 } as any
  return { id, type, name:'Note', text:'...', x: 420, y: 300 } as any
}

export default function SubsystemPalette({ subsystemId, project }:{ subsystemId:string, project: Project }){
  const addNode = useStore(s=>s.subsystemAddNode)
  const onAdd = (t:any)=>{
    if (t==='Source') return // blocked in nested
    if (t==='SubsystemInput'){
      const count = project.nodes.filter(n=> (n as any).type==='SubsystemInput').length
      if (count>=1){ window.alert('Exactly one Subsystem Input is allowed.'); return }
    }
    addNode(subsystemId, createPreset(t))
  }
  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-semibold text-slate-600">Embedded Palette</h2>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={()=>onAdd('Converter')}>Converter</Button>
        <Button onClick={()=>onAdd('Load')}>Load</Button>
        <Button onClick={()=>onAdd('Bus')}>Bus/Net</Button>
        <Button variant="outline" onClick={()=>onAdd('Note')}>Note</Button>
        <div className="col-span-2 h-px bg-slate-200 my-1" aria-hidden="true" />
        <Button onClick={()=>onAdd('Subsystem')}>Subsystem</Button>
        <Button onClick={()=>onAdd('SubsystemInput')}>Subsystem Input Port</Button>
      </div>
      <div className="text-xs text-slate-500">Sources are not allowed inside embedded subsystems. Add exactly one Subsystem Input.</div>
    </div>
  )
}


