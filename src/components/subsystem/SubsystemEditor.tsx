import React from 'react'
import { Project } from '../../models'
import SubsystemPalette from './SubsystemPalette'
import SubsystemCanvas from './SubsystemCanvas'
import SubsystemInspector from './SubsystemInspector'
import { Button } from '../ui/button'
import { useStore } from '../../state/store'
import { ReactFlowProvider } from 'reactflow'
import AutoAlignPrompt from '../AutoAlignPrompt'

export default function SubsystemEditor({ subsystemId, subsystemPath, projectContext, onClose, onOpenSubsystem }:{ subsystemId:string, subsystemPath: string[], projectContext: Project, onClose:()=>void, onOpenSubsystem:(id:string)=>void }){
  const subsystem = projectContext.nodes.find(n=>n.id===subsystemId && (n as any).type==='Subsystem') as any
  const [selected, setSelected] = React.useState<string|null>(null)
  const [inspectorWidth, setInspectorWidth] = React.useState<number>(320)
  const [isResizing, setIsResizing] = React.useState<boolean>(false)
  const startXRef = React.useRef<number>(0)
  const startWRef = React.useRef<number>(320)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const embedded = subsystem?.project
  const inputCount = embedded?.nodes?.filter((n:any)=>n.type==='SubsystemInput').length ?? 0
  const undo = useStore(s=>s.undo)
  const redo = useStore(s=>s.redo)
  const pastLen = useStore(s=>s.past.length)
  const futureLen = useStore(s=>s.future.length)
  const autoAlignNested = useStore(s=>s.nestedSubsystemAutoAlign)
  const clearNested = useStore(s=>s.nestedSubsystemClear)
  const [autoAlignPromptOpen, setAutoAlignPromptOpen] = React.useState<boolean>(false)
  const [autoAlignHorizontalInput, setAutoAlignHorizontalInput] = React.useState<string>('500')
  const [autoAlignVerticalInput, setAutoAlignVerticalInput] = React.useState<string>('100')
  const [autoAlignError, setAutoAlignError] = React.useState<string|null>(null)
  const [autoAlignAnchor, setAutoAlignAnchor] = React.useState<DOMRect|null>(null)
  const autoAlignButtonRef = React.useRef<HTMLButtonElement|null>(null)

  React.useEffect(()=>{
    const handleMove = (e: MouseEvent)=>{
      if (!isResizing) return
      const dx = e.clientX - startXRef.current
      let next = startWRef.current - dx
      const min = 240
      const rect = containerRef.current?.getBoundingClientRect()
      const totalWidth = rect?.width ?? 1200
      const minMain = 400
      // palette(250) + resizer(6) + main(minMain) + inspector(next) <= totalWidth
      const max = Math.max(240, totalWidth - 250 - 6 - minMain)
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
  if (!subsystem || !embedded) return null

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
      autoAlignNested(subsystemPath)
      setAutoAlignHorizontalInput('500')
      setAutoAlignVerticalInput('100')
      closeAutoAlignPrompt()
      return
    }

    const options: { columnSpacing?: number; rowSpacing?: number } = {}
    if (columnSpacing !== undefined) options.columnSpacing = columnSpacing
    if (rowSpacing !== undefined) options.rowSpacing = rowSpacing

    autoAlignNested(subsystemPath, options)

    if (columnSpacing !== undefined) {
      setAutoAlignHorizontalInput(String(columnSpacing))
    }
    if (rowSpacing !== undefined) {
      setAutoAlignVerticalInput(String(rowSpacing))
    }

    closeAutoAlignPrompt()
  }, [
    autoAlignHorizontalInput,
    autoAlignNested,
    autoAlignVerticalInput,
    subsystemPath,
    closeAutoAlignPrompt,
  ])

  const handleClear = () => {
    if (!window.confirm('Clear this subsystem canvas? This will remove all nodes except inputs.')) return
    clearNested(subsystemPath)
    setSelected(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div ref={containerRef} className="relative bg-white shadow-xl border w-[95vw] h-[90vh] mt-[5vh] rounded-lg overflow-hidden grid" style={{gridTemplateRows:'48px 1fr', gridTemplateColumns:`250px 1fr 6px ${inspectorWidth}px`}}>
        <div className="col-span-4 flex items-center justify-between px-3 border-b bg-white">
          <div className="flex items-center gap-3">
            <div className="font-semibold">Subsystem: {subsystem.name}</div>
            <div className={"text-xs px-2 py-0.5 rounded-full " + (inputCount===1? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}>{inputCount===1? '1 input ok' : `${inputCount} inputs`}</div>
          </div>
          <div className="flex items-center gap-2 toolbar-buttons">
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
            <Button size="sm" variant="danger" onClick={handleClear}>Clear</Button>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
        <aside className="border-r bg-white overflow-auto side-panel"><SubsystemPalette subsystemId={subsystemId} subsystemPath={subsystemPath} project={embedded} /></aside>
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
        <aside className="border-l bg-white overflow-auto side-panel">
          <SubsystemInspector subsystemId={subsystemId} subsystemPath={subsystemPath} project={embedded} selected={selected} onDeleted={()=>setSelected(null)} />
        </aside>
      </div>
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
  )
}
