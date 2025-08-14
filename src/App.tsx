import React from 'react'
import { useStore } from './state/store'
import Palette from './components/Palette'
import Canvas from './components/Canvas'
import Inspector from './components/Inspector'
import TotalsBar from './components/TotalsBar'
import { Button } from './components/ui/button'
import SubsystemEditor from './components/subsystem/SubsystemEditor'
import { ReactFlowProvider } from 'reactflow'
import { compute } from './calc'
import { validate } from './rules'

export default function App(){
  const project = useStore(s=>s.project)
  const setScenario = useStore(s=>s.setScenario)
  const importedFileName = useStore(s=>s.importedFileName)
  const [selected, setSelected] = React.useState<string|null>(null)
  const [rightPane, setRightPane] = React.useState<number>(300)
  const openSubsystemIds = useStore(s => s.openSubsystemIds);
  const setOpenSubsystemIds = useStore(s => s.setOpenSubsystemIds);
  const minRight = 220, maxRight = 640
  const onDragStart = (e: React.MouseEvent)=>{
    e.preventDefault()
    const startX = e.clientX
    const startW = rightPane
    const onMove = (me: MouseEvent)=>{
      const dx = me.clientX - startX
      const next = Math.min(maxRight, Math.max(minRight, startW - dx))
      setRightPane(next)
    }
    const onUp = ()=>{
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  const result = compute(project)
  const warns = [...validate(project), ...result.globalWarnings]
  return (
    <div className="h-screen grid" style={{gridTemplateRows:'56px 1fr 48px', gridTemplateColumns:`var(--pane) 1fr ${rightPane}px`}}>
      <div className="col-span-3 px-3 py-1 border-b bg-white">
        <div className="flex items-center h-full" style={{height: '54px'}}>
          <div className="font-semibold text-3xl ml-8">PowerTree Studio</div>
        </div>
      </div>
      <aside className="border-r bg-white overflow-auto"><Palette /></aside>
      <main className="overflow-hidden"><ReactFlowProvider><Canvas onSelect={setSelected} onOpenSubsystem={(id)=>setOpenSubsystemIds([...openSubsystemIds, id])} /></ReactFlowProvider></main>
      <aside className="relative border-l bg-white overflow-auto">
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={onDragStart}
          className="absolute left-0 top-0 bottom-0 w-2 -ml-1 cursor-col-resize z-10"
          style={{
            // subtle hit area with hover affordance
            background: 'transparent'
          }}
        />
        <Inspector selected={selected} onDeleted={()=>setSelected(null)} onOpenSubsystemEditor={(id)=>setOpenSubsystemIds([...openSubsystemIds, id])} />
      </aside>
      <div className="col-span-3"><TotalsBar /></div>
      {openSubsystemIds.map((id, idx)=>{
        let ctx = project
        for (let j=0; j<idx; j++){
          const parentId = openSubsystemIds[j]
          const parentNode = ctx.nodes.find(n=>n.id===parentId && (n as any).type==='Subsystem') as any
          if (parentNode && parentNode.project){ ctx = parentNode.project } else { break }
        }
        return (
          <SubsystemEditor
            key={`${idx}-${id}`}
            subsystemId={id}
            subsystemPath={openSubsystemIds.slice(0, idx+1)}
            projectContext={ctx}
            onClose={()=>setOpenSubsystemIds(openSubsystemIds.slice(0, -1))}
            onOpenSubsystem={(nextId)=>setOpenSubsystemIds([...openSubsystemIds, nextId])}
          />
        )
      })}
    </div>
  )
}
