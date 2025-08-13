import React from 'react'
import { Button } from './ui/button'
import { useStore } from '../state/store'
import { genId } from '../utils'
import { AnyNode } from '../models'
import { Alert } from './ui/alert'
function createPreset(type:'Source'|'Converter'|'Load'|'Bus'|'Note'|'Subsystem'|'SubsystemInput'): AnyNode {
  const id = genId('n_')
  if (type==='Source') return { id, type, name:'Source', V_nom:48, x: 80, y: 80 } as any
  if (type==='Converter') return { id, type, name:'Buck', Vin_min:40, Vin_max:60, Vout:12, efficiency:{type:'fixed', value:0.95}, x: 320, y: 160 } as any
  if (type==='Load') return { id, type, name:'Load', Vreq:12, I_typ:1, I_max:2, x: 560, y: 240 } as any
  if (type==='Bus') return { id, type, name:'Bus', V_bus:12, x: 420, y: 220 } as any
  if (type==='Subsystem') return { id, type, name:'Subsystem', inputV_nom:12,
    project: { id: genId('p_'), name: 'Embedded', units: { voltage:'V', current:'A', power:'W', resistance:'mΩ' }, defaultMargins: { currentPct:10, powerPct:10, voltageDropPct:5, voltageMarginPct:3 }, scenarios: ['Typical','Max','Idle'], currentScenario: 'Typical', nodes: [], edges: [] }, x: 420, y: 300 } as any
  if (type==='SubsystemInput') return { id, type, name:'Subsystem Input', x: 80, y: 80 } as any
  return { id, type, name:'Note', text:'...', x: 420, y: 300 } as any
}
export default function Palette(){
  const addNode = useStore(s=>s.addNode)
  const onAdd = (t:any)=> addNode(createPreset(t))
  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-semibold text-slate-600">Palette</h2>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={()=>onAdd('Source')}>Source</Button>
        <Button onClick={()=>onAdd('Converter')}>Converter</Button>
        <Button onClick={()=>onAdd('Load')}>Load</Button>
        <Button onClick={()=>onAdd('Bus')}>Bus/Net</Button>
        <Button variant="outline" onClick={()=>onAdd('Note')}>Note</Button>
        <div className="col-span-2 h-px bg-slate-200 my-1" aria-hidden="true" />
        <Button onClick={()=>onAdd('Subsystem')}>Subsystem</Button>
        <Button onClick={()=>onAdd('SubsystemInput')}>Subsystem Input Port</Button>
      </div>
      <Alert>Drag from node handle to connect. DAG enforced.</Alert>
      <div>
        <h3 className="text-sm mt-3 font-semibold">Quick presets</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Button variant="outline" onClick={()=>addNode(createPreset('Source'))}>48V Source</Button>
          <Button variant="outline" onClick={()=>addNode(createPreset('Converter'))}>12V Buck 95%</Button>
          <Button variant="outline" onClick={()=>addNode({id:genId('n_'), type:'Converter', name:'VRM 0.9V 92%', Vin_min:10, Vin_max:13, Vout:0.9, efficiency:{type:'fixed', value:0.92}, x: 640, y: 160 } as any)}>VRM 0.9V 92%</Button>
        </div>
      </div>
    </div>
  )
}
