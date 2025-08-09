import React from 'react'
import { useStore } from './state/store'
import Palette from './components/Palette'
import Canvas from './components/Canvas'
import Inspector from './components/Inspector'
import TotalsBar from './components/TotalsBar'
import { Button } from './components/ui/button'

export default function App(){
  const project = useStore(s=>s.project)
  const setScenario = useStore(s=>s.setScenario)
  const [selected, setSelected] = React.useState<string|null>(null)
  return (
    <div className="h-screen grid" style={{gridTemplateRows:'48px 1fr 48px', gridTemplateColumns:'var(--pane) 1fr var(--pane)'}}>
      <div className="col-span-3 flex items-center justify-between px-3 border-b bg-white">
        <div className="flex items-center gap-2">
          <div className="font-semibold">PowerTree Studio</div>
          <div className="text-xs text-slate-500">Scenario:</div>
          <div className="flex gap-1" role="tablist" aria-label="Scenario">
            {['Typical','Max','Idle'].map(s=>(
              <Button key={s} variant={project.currentScenario===s?'default':'outline'} size="sm" aria-selected={project.currentScenario===s} onClick={()=>setScenario(s as any)}>{s}</Button>
            ))}
          </div>
        </div>
        <div className="text-xs text-slate-500">Project: {project.name}</div>
      </div>
      <aside className="border-r bg-white overflow-auto"><Palette /></aside>
      <main className="overflow-hidden"><Canvas onSelect={setSelected} /></main>
      <aside className="border-l bg-white overflow-auto"><Inspector selected={selected} onDeleted={()=>setSelected(null)} /></aside>
      <div className="col-span-3"><TotalsBar /></div>
    </div>
  )
}
