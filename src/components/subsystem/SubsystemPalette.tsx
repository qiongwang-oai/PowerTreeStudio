import React from 'react'
import { Button } from '../ui/button'
import { useStore } from '../../state/store'
import { genId } from '../../utils'
import { AnyNode, Project } from '../../models'

function createPreset(type:'Converter'|'Load'|'Bus'|'Note'|'Subsystem'|'SubsystemInput'): AnyNode {
  const id = genId('n_')
  if (type==='Converter') return { id, type, name:'Buck', Vin_min:40, Vin_max:60, Vout:12, efficiency:{type:'fixed', value:0.95}, x: 320, y: 160 } as any
  if (type==='Load') return { id, type, name:'Load', Vreq:12, I_typ:1, I_idle:1, I_max:2, Utilization_typ: 100, Utilization_max: 100, numParalleledDevices: 1, x: 560, y: 240 } as any
  if (type==='Bus') return { id, type, name:'Bus', V_bus:12, x: 420, y: 220 } as any
  if (type==='Subsystem') return { id, type, name:'Subsystem', inputV_nom:12, numParalleledSystems: 1,
    project: { id: genId('p_'), name: 'Embedded', units: { voltage:'V', current:'A', power:'W', resistance:'mΩ' }, defaultMargins: { currentPct:10, powerPct:10, voltageDropPct:5, voltageMarginPct:3 }, scenarios: ['Typical','Max','Idle'], currentScenario: 'Typical', nodes: [], edges: [] }, x: 420, y: 300 } as any
  if (type==='SubsystemInput') return { id, type, name:'Subsystem Input', Vout: 12, x: 80, y: 80 } as any
  return { id, type, name:'Note', text:'...', x: 420, y: 300 } as any
}

export default function SubsystemPalette({ subsystemId, subsystemPath, project }:{ subsystemId:string, subsystemPath?: string[], project: Project }){
  const addNodeNested = useStore(s=>s.nestedSubsystemAddNode)
  const path = (subsystemPath && subsystemPath.length>0)? subsystemPath : [subsystemId]
  const onAdd = (t:any)=>{
    if (t==='Source') return // blocked in nested
    addNodeNested(path, createPreset(t))
  }
  const buttonBase = 'w-full text-slate-900 border border-slate-300'
  const styleByType: Record<string, string> = {
    Converter: '!bg-blue-50 hover:!bg-blue-100',
    Load: '!bg-orange-50 hover:!bg-orange-100',
    Bus: '!bg-white hover:!bg-slate-100',
    Note: '!bg-white hover:!bg-slate-100',
    Subsystem: '!bg-violet-50 hover:!bg-violet-100',
    SubsystemInput: '!bg-slate-50 hover:!bg-slate-100',
  }
  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-semibold text-slate-600">Embedded Palette</h2>
      <div className="grid grid-cols-1 gap-2">
        <Button variant="outline" className={`${buttonBase} ${styleByType.Converter}`} onClick={()=>onAdd('Converter')}>Converter</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.Load}`} onClick={()=>onAdd('Load')}>Load</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.Bus}`} onClick={()=>onAdd('Bus')}>Bus/Net</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.Note}`} onClick={()=>onAdd('Note')}>Note</Button>
        <div className="h-px bg-slate-200 my-1" aria-hidden="true" />
        <Button variant="outline" className={`${buttonBase} ${styleByType.Subsystem}`} onClick={()=>onAdd('Subsystem')}>Subsystem</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.SubsystemInput}`} onClick={()=>onAdd('SubsystemInput')}>Subsystem Input Port</Button>
      </div>
      <div className="text-xs text-slate-500">Sources are not allowed inside embedded subsystems. Add one or more Subsystem Inputs as needed.</div>
    </div>
  )
}
