import React from 'react'
import { useStore } from './state/store'
import Palette from './components/Palette'
import Canvas from './components/Canvas'
import Inspector from './components/Inspector'
import TotalsBar from './components/TotalsBar'
import { Button } from './components/ui/button'
import SubsystemEditor from './components/subsystem/SubsystemEditor'

export default function App(){
  const project = useStore(s=>s.project)
  const setScenario = useStore(s=>s.setScenario)
  const importedFileName = useStore(s=>s.importedFileName)
  const [selected, setSelected] = React.useState<string|null>(null)
  const [rightPane, setRightPane] = React.useState<number>(300)
  const [openSubsystemIds, setOpenSubsystemIds] = React.useState<string[]>([])
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
  return (
    <div className="h-screen grid" style={{gridTemplateRows:'88px 1fr 48px', gridTemplateColumns:`var(--pane) 1fr ${rightPane}px`}}>
      <div className="col-span-3 px-3 py-2 border-b bg-white">
        <div className="flex items-center">
          <div className="font-semibold text-3xl">PowerTree Studio</div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            <div className="text-sm text-slate-600 font-medium">Scenario:</div>
            <div className="flex gap-1" role="tablist" aria-label="Scenario">
              {['Typical','Max','Idle'].map(s=>(
                <Button key={s} variant={project.currentScenario===s?'default':'outline'} size="sm" className="px-2 py-1 text-xs" aria-selected={project.currentScenario===s} onClick={()=>setScenario(s as any)}>{s}</Button>
              ))}
            </div>
          </div>
          <div className="text-xs text-slate-500">Project: {importedFileName || 'New Project'}</div>
        </div>
      </div>
      <aside className="border-r bg-white overflow-auto"><Palette /></aside>
      <main className="overflow-hidden"><Canvas onSelect={setSelected} onOpenSubsystem={(id)=>setOpenSubsystemIds(ids=>[...ids, id])} /></main>
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
        <Inspector selected={selected} onDeleted={()=>setSelected(null)} onOpenSubsystemEditor={(id)=>setOpenSubsystemIds(ids=>[...ids, id])} />
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
            onClose={()=>setOpenSubsystemIds(ids=>ids.slice(0, -1))}
            onOpenSubsystem={(nextId)=>setOpenSubsystemIds(ids=>[...ids, nextId])}
          />
        )
      })}
    </div>
  )
}
