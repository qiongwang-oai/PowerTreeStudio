import React from 'react'
import { useStore } from '../../state/store'
import SubsystemPalette from './SubsystemPalette'
import SubsystemCanvas from './SubsystemCanvas'
import SubsystemInspector from './SubsystemInspector'
import { Button } from '../ui/button'

export default function SubsystemEditor({ subsystemId, onClose, onOpenSubsystem }:{ subsystemId:string, onClose:()=>void, onOpenSubsystem:(id:string)=>void }){
  const root = useStore(s=>s.project)
  const subsystem = root.nodes.find(n=>n.id===subsystemId && (n as any).type==='Subsystem') as any
  const [selected, setSelected] = React.useState<string|null>(null)
  if (!subsystem) return null
  const embedded = subsystem.project
  const inputCount = embedded.nodes.filter((n:any)=>n.type==='SubsystemInput').length
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white shadow-xl border w-[95vw] h-[90vh] mt-[5vh] rounded-lg overflow-hidden grid" style={{gridTemplateRows:'48px 1fr', gridTemplateColumns:'260px 1fr 320px'}}>
        <div className="col-span-3 flex items-center justify-between px-3 border-b bg-white">
          <div className="flex items-center gap-3">
            <div className="font-semibold">Subsystem: {subsystem.name}</div>
            <div className={"text-xs px-2 py-0.5 rounded-full " + (inputCount===1? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}>{inputCount===1? '1 input ok' : `${inputCount} inputs`}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
        <aside className="border-r bg-white overflow-auto"><SubsystemPalette subsystemId={subsystemId} project={embedded} /></aside>
        <main className="overflow-hidden">
          <SubsystemCanvas subsystemId={subsystemId} project={embedded} onSelect={setSelected} onOpenNested={onOpenSubsystem} />
        </main>
        <aside className="border-l bg-white overflow-auto">
          <SubsystemInspector subsystemId={subsystemId} project={embedded} selected={selected} onDeleted={()=>setSelected(null)} />
        </aside>
      </div>
    </div>
  )
}


