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
import { download, importJson } from './io'
import { exportReport } from './report'

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    // You can log error info here
    console.error('ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return <div style={{padding: 32, color: 'red'}}>
        <h1>Something went wrong.</h1>
        <pre>{String(this.state.error)}</pre>
      </div>;
    }
    return this.props.children;
  }
}

export default function App(){
  const project = useStore(s=>s.project)
  const setScenario = useStore(s=>s.setScenario)
  const importedFileName = useStore(s=>s.importedFileName)
  const setProject = useStore(s=>s.setProject)
  const setImportedFileName = useStore(s=>s.setImportedFileName)
  const undo = useStore(s=>s.undo)
  const redo = useStore(s=>s.redo)
  const pastLen = useStore(s=>s.past.length)
  const futureLen = useStore(s=>s.future.length)
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
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const onExport = ()=> download(project.name.replace(/\s+/g,'_') + '.json', JSON.stringify(project, null, 2))
  const onImport = async (f:File)=>{ const data = await importJson(f); setProject(data); setImportedFileName(f.name) }
  const onReport = ()=> exportReport(project, result)
  const onClear = ()=>{
    if (!window.confirm('Clear canvas? This will remove all nodes and edges.')) return
    const cleared = { ...project, nodes: [], edges: [] }
    setProject(cleared)
    setImportedFileName(null)
  }
  React.useEffect(()=>{
    const onKeyDown = (e: KeyboardEvent)=>{
      // Prevent shortcuts if any subsystem editor is open
      if (openSubsystemIds && openSubsystemIds.length > 0) return;
      const active = document.activeElement as HTMLElement | null
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (isInput) return
      const isMetaOrCtrl = e.metaKey || e.ctrlKey
      if (!isMetaOrCtrl) return
      if (e.key === 'z' || e.key === 'Z'){
        if (e.shiftKey){ redo(); } else { undo(); }
        e.preventDefault()
      } else if (e.key === 'y' || e.key === 'Y'){
        redo();
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return ()=> window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, openSubsystemIds])
  return (
    <ErrorBoundary>
      <div className="h-screen grid" style={{gridTemplateRows:'100px 1fr 48px', gridTemplateColumns:`var(--pane) 1fr ${rightPane}px`}}>
        <div className="col-span-3 px-3 py-1 border-b bg-white">
          <div className="flex items-start h-full" style={{height: '98px'}}>
            <div className="ml-8 flex flex-col justify-center">
              <div className="font-semibold text-3xl">PowerTree Studio</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  aria-hidden="true"
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={e=>{
                    const file = e.target.files?.[0]
                    if (file) onImport(file)
                    e.currentTarget.value = ''
                  }}
                />
                <Button variant="outline" size="sm" onClick={()=>fileInputRef.current?.click()}>Import</Button>
                <Button variant="outline" size="sm" onClick={onExport}>Export</Button>
                <Button variant="outline" size="sm" onClick={undo} disabled={pastLen===0}>Undo</Button>
                <Button variant="outline" size="sm" onClick={redo} disabled={futureLen===0}>Redo</Button>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={onReport}>Report</Button>
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={onClear}>Clear</Button>
              </div>
            </div>
          </div>
        </div>
        <aside className="border-r bg-white overflow-auto pt-6"><Palette /></aside>
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
          <Inspector selected={selected} onDeleted={()=>setSelected(null)} onOpenSubsystemEditor={(id)=>setOpenSubsystemIds([...openSubsystemIds, id])} onSelect={(id)=>setSelected(id)} />
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
    </ErrorBoundary>
  )
}
