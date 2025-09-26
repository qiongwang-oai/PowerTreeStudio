import React from 'react'
import { useStore } from './state/store'
import Palette from './components/Palette'
import Canvas, { CanvasHandle } from './components/Canvas'
import Inspector from './components/Inspector'
import { Button } from './components/ui/button'
import SubsystemEditor from './components/subsystem/SubsystemEditor'
import { ReactFlowProvider } from 'reactflow'
import { compute } from './calc'
import { validate } from './rules'
import { download, importProjectFile, serializeProject } from './io'
import { exportReport } from './report'
import ReportDialog from './components/report/ReportDialog'
import AutoAlignPrompt from './components/AutoAlignPrompt'
import type { InspectorSelection } from './types/selection'
import { QuickPresetDialogsProvider } from './components/quick-presets/QuickPresetDialogsContext'
import MarkupToolbar from './components/markups/MarkupToolbar'
import type { MarkupTool } from './components/markups/MarkupLayer'

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
  const autoAlign = useStore(s=>s.autoAlign)
  const pastLen = useStore(s=>s.past.length)
  const futureLen = useStore(s=>s.future.length)
  const [selected, setSelected] = React.useState<InspectorSelection | null>(null)
  const [rightPane, setRightPane] = React.useState<number>(300)
  const [reportOpen, setReportOpen] = React.useState<boolean>(false)
  const [autoAlignPromptOpen, setAutoAlignPromptOpen] = React.useState<boolean>(false)
  const [autoAlignHorizontalInput, setAutoAlignHorizontalInput] = React.useState<string>('500')
  const [autoAlignVerticalInput, setAutoAlignVerticalInput] = React.useState<string>('100')
  const [autoAlignError, setAutoAlignError] = React.useState<string|null>(null)
  const [autoAlignAnchor, setAutoAlignAnchor] = React.useState<DOMRect|null>(null)
  const openSubsystemIds = useStore(s => s.openSubsystemIds);
  const setOpenSubsystemIds = useStore(s => s.setOpenSubsystemIds);
  const quickPresets = useStore(s => s.quickPresets)
  const [markupTool, setMarkupTool] = React.useState<MarkupTool | null>(null)
  const minRight = 220, maxRight = 640
  const autoAlignButtonRef = React.useRef<HTMLButtonElement|null>(null)
  const canvasRef = React.useRef<CanvasHandle | null>(null)
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
  const onExport = ()=> download(project.name.replace(/\s+/g,'_'), serializeProject({ ...project, quickPresets }))
  const onExportPdf = React.useCallback(async () => {
    try {
      await canvasRef.current?.exportToPdf()
    } catch (err) {
      console.error('Failed to export canvas PDF', err)
    }
  }, [])
  const onImport = async (f:File)=>{ const data = await importProjectFile(f); setProject(data); setImportedFileName(f.name) }
  const onReport = ()=> setReportOpen(true)
  const openAutoAlignPrompt = React.useCallback(() => {
    setAutoAlignAnchor(autoAlignButtonRef.current?.getBoundingClientRect() ?? null)
    setAutoAlignHorizontalInput(prev => (prev.trim().length > 0 ? prev : '500'))
    setAutoAlignVerticalInput(prev => (prev.trim().length > 0 ? prev : '100'))
    setAutoAlignError(null)
    setAutoAlignPromptOpen(true)
  }, [])
  const closeAutoAlignPrompt = React.useCallback(() => {
    setAutoAlignPromptOpen(false)
    setAutoAlignError(null)
  }, [])
  const applyAutoAlign = React.useCallback(() => {
    const horizontalTrimmed = autoAlignHorizontalInput.trim()
    const verticalTrimmed = autoAlignVerticalInput.trim()

    let columnSpacing: number | undefined
    if (horizontalTrimmed !== '') {
      const parsed = Number(horizontalTrimmed)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setAutoAlignError('Please enter a positive horizontal spacing.')
        return
      }
      columnSpacing = parsed
    }

    let rowSpacing: number | undefined
    if (verticalTrimmed !== '') {
      const parsed = Number(verticalTrimmed)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setAutoAlignError('Please enter a positive vertical spacing.')
        return
      }
      rowSpacing = parsed
    }

    if (columnSpacing === undefined && rowSpacing === undefined) {
      autoAlign()
      setAutoAlignHorizontalInput('500')
      setAutoAlignVerticalInput('100')
      closeAutoAlignPrompt()
      return
    }

    const options: { columnSpacing?: number; rowSpacing?: number } = {}
    if (columnSpacing !== undefined) options.columnSpacing = columnSpacing
    if (rowSpacing !== undefined) options.rowSpacing = rowSpacing

    autoAlign(options)

    if (columnSpacing !== undefined) {
      setAutoAlignHorizontalInput(String(columnSpacing))
    }
    if (rowSpacing !== undefined) {
      setAutoAlignVerticalInput(String(rowSpacing))
    }

    closeAutoAlignPrompt()
  }, [
    autoAlign,
    autoAlignHorizontalInput,
    autoAlignVerticalInput,
    closeAutoAlignPrompt,
  ])
  const onClear = ()=>{
    if (!window.confirm('Clear canvas? This will remove all nodes and edges.')) return
    const cleared = { ...project, nodes: [], edges: [], markups: [] }
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
      <QuickPresetDialogsProvider getCurrentSelection={() => selected}>
        <div className="h-screen grid" style={{gridTemplateRows:'76px 1fr', gridTemplateColumns:`var(--pane) 1fr ${rightPane}px`}}>
          <div className="col-span-3 px-3 py-1 border-b bg-white">
          <div className="flex items-center h-full" style={{height: '76px'}}>
            <div className="ml-8 flex flex-1 items-end justify-between gap-4">
              <div className="flex flex-row items-end gap-6">
                <div className="flex flex-col justify-center">
                  <div className="text-[28px] font-semibold tracking-tight text-slate-900">
                    <span className="bg-gradient-to-r from-emerald-500 via-sky-500 to-violet-500 bg-clip-text text-transparent drop-shadow-sm">PowerTree Studio</span>
                  </div>
                  <div className="mt-0.5 h-px w-16 bg-gradient-to-r from-emerald-400 via-sky-400 to-transparent" />
                </div>
                <div className="flex flex-wrap items-center gap-2" style={{marginBottom: '3px'}}>
                  <input
                    ref={fileInputRef}
                    aria-hidden="true"
                    type="file"
                    accept=".json,.yaml,.yml,application/json,text/yaml"
                    className="hidden"
                    onChange={e=>{
                      const file = e.target.files?.[0]
                      if (file) onImport(file)
                      e.currentTarget.value = ''
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={()=>fileInputRef.current?.click()}>Open</Button>
                  <Button variant="outline" size="sm" onClick={onExport}>Save</Button>
                  <Button variant="outline" size="sm" onClick={onExportPdf}>Export PDF</Button>
                  <Button variant="outline" size="sm" onClick={undo} disabled={pastLen===0}>Undo</Button>
                  <Button variant="outline" size="sm" onClick={redo} disabled={futureLen===0}>Redo</Button>
                  <Button
                    ref={autoAlignButtonRef}
                    variant="outline"
                    size="sm"
                    onClick={openAutoAlignPrompt}
                  >
                    Auto Alignment
                  </Button>
                  <Button size="sm" variant="success" onClick={onReport}>Report</Button>
                  <Button size="sm" variant="danger" onClick={onClear}>Clear</Button>
                <div className="h-6 w-px bg-slate-300 mx-2" aria-hidden="true" />
                <MarkupToolbar activeTool={markupTool} onSelectTool={setMarkupTool} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <div className="flex-1" />
              </div>
            </div>
          </div>
        </div>
        <aside className="border-r bg-white overflow-auto pt-6"><Palette /></aside>
        <main className="overflow-hidden"><ReactFlowProvider><Canvas ref={canvasRef} onSelect={setSelected} onOpenSubsystem={(id)=>setOpenSubsystemIds([...openSubsystemIds, id])} markupTool={markupTool} onMarkupToolChange={setMarkupTool} /></ReactFlowProvider></main>
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
          <Inspector selection={selected} onDeleted={()=>setSelected(null)} onOpenSubsystemEditor={(id)=>setOpenSubsystemIds([...openSubsystemIds, id])} onSelect={setSelected} />
        </aside>
        {/* TotalsBar removed; metrics shown in Canvas banner */}
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
        {reportOpen && (
          <ReportDialog project={project} result={result} onClose={()=>setReportOpen(false)} />
        )}
        {autoAlignPromptOpen && (
          <AutoAlignPrompt
            anchorRect={autoAlignAnchor}
            horizontalValue={autoAlignHorizontalInput}
            verticalValue={autoAlignVerticalInput}
            onHorizontalChange={setAutoAlignHorizontalInput}
            onVerticalChange={setAutoAlignVerticalInput}
            onConfirm={applyAutoAlign}
            onCancel={closeAutoAlignPrompt}
            error={autoAlignError}
          />
        )}
        </div>
      </QuickPresetDialogsProvider>
    </ErrorBoundary>
  )
}
