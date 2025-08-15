import React from 'react'
import { Project } from '../../models'
import SubsystemPalette from './SubsystemPalette'
import SubsystemCanvas from './SubsystemCanvas'
import SubsystemInspector from './SubsystemInspector'
import { Button } from '../ui/button'
import { ReactFlowProvider } from 'reactflow'

export default function SubsystemEditor({ subsystemId, subsystemPath, projectContext, onClose, onOpenSubsystem }:{ subsystemId:string, subsystemPath: string[], projectContext: Project, onClose:()=>void, onOpenSubsystem:(id:string)=>void }){
  const subsystem = projectContext.nodes.find(n=>n.id===subsystemId && (n as any).type==='Subsystem') as any
  const [selected, setSelected] = React.useState<string|null>(null)
  const [inspectorWidth, setInspectorWidth] = React.useState<number>(320)
  const [isResizing, setIsResizing] = React.useState<boolean>(false)
  const startXRef = React.useRef<number>(0)
  const startWRef = React.useRef<number>(320)
  const containerRef = React.useRef<HTMLDivElement>(null)
  if (!subsystem) return null
  const embedded = subsystem.project
  const inputCount = embedded.nodes.filter((n:any)=>n.type==='SubsystemInput').length

  React.useEffect(()=>{
    const handleMove = (e: MouseEvent)=>{
      if (!isResizing) return
      const dx = e.clientX - startXRef.current
      let next = startWRef.current - dx
      const min = 240
      const rect = containerRef.current?.getBoundingClientRect()
      const totalWidth = rect?.width ?? 1200
      const minMain = 400
      // palette(260) + resizer(6) + main(minMain) + inspector(next) <= totalWidth
      const max = Math.max(240, totalWidth - 260 - 6 - minMain)
      if (Number.isFinite(max)) next = Math.min(next, max)
      next = Math.max(min, next)
      setInspectorWidth(next)
    }
    const handleUp = ()=>{
      if (isResizing) setIsResizing(false)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return ()=>{
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isResizing])

  const onResizerMouseDown = (e: React.MouseEvent)=>{
    e.preventDefault()
    startXRef.current = e.clientX
    startWRef.current = inspectorWidth
    setIsResizing(true)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div ref={containerRef} className="relative bg-white shadow-xl border w-[95vw] h-[90vh] mt-[5vh] rounded-lg overflow-hidden grid" style={{gridTemplateRows:'48px 1fr', gridTemplateColumns:`260px 1fr 6px ${inspectorWidth}px`}}>
        <div className="col-span-4 flex items-center justify-between px-3 border-b bg-white">
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
          <ReactFlowProvider>
            <SubsystemCanvas subsystemId={subsystemId} subsystemPath={subsystemPath} project={embedded} onSelect={setSelected} onOpenNested={onOpenSubsystem} />
          </ReactFlowProvider>
        </main>
        <div
          className={`bg-slate-200 cursor-col-resize ${isResizing? 'opacity-100' : 'opacity-70'}`}
          onMouseDown={onResizerMouseDown}
          aria-label="Resize inspector"
          role="separator"
        />
        <aside className="border-l bg-white overflow-auto">
          <SubsystemInspector subsystemId={subsystemId} subsystemPath={subsystemPath} project={embedded} selected={selected} onDeleted={()=>setSelected(null)} />
        </aside>
      </div>
    </div>
  )
}


