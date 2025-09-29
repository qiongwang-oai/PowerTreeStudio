import React from 'react'
import { Button } from '../ui/button'
import { useStore } from '../../state/store'
import { Project } from '../../models'
import { createNodePreset, NODE_PRESET_MIME, type NodePresetDescriptor, serializePresetDescriptor } from '../../utils/nodePresets'
import QuickPresetTile from '../quick-presets/QuickPresetTile'
import { QUICK_PRESET_MIME, buildQuickPresetDragData } from '../../utils/quickPresets'
import { useQuickPresetDialogs } from '../quick-presets/QuickPresetDialogsContext'

export default function SubsystemPalette({ subsystemId, subsystemPath, project }:{ subsystemId:string, subsystemPath?: string[], project: Project }){
  const addNodeNested = useStore(s=>s.nestedSubsystemAddNode)
  const quickPresets = useStore(s => s.quickPresets)
  const applyQuickPreset = useStore(s => s.applyQuickPreset)
  const quickPresetDialogs = useQuickPresetDialogs()
  const savePresetButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const [manageButtonWidth, setManageButtonWidth] = React.useState<number | null>(null)
  const path = React.useMemo(() => (subsystemPath && subsystemPath.length>0)? subsystemPath : [subsystemId], [subsystemPath, subsystemId])
  const availableQuickPresets = React.useMemo(() => quickPresets.filter(preset => preset.nodeType !== 'Source'), [quickPresets])
  const blockedPresetCount = quickPresets.length - availableQuickPresets.length

  React.useEffect(() => {
    const button = savePresetButtonRef.current
    if (!button) return

    const updateWidth = () => {
      const rect = button.getBoundingClientRect()
      setManageButtonWidth(rect.width)
    }

    updateWidth()

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => updateWidth())
      observer.observe(button)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const onAdd = (descriptor: NodePresetDescriptor)=>{
    if (descriptor.type==='Source') return // blocked in nested
    addNodeNested(path, createNodePreset(descriptor))
  }
  const onDragStart = (e: React.DragEvent<HTMLElement>, descriptor: NodePresetDescriptor) => {
    if (descriptor.type==='Source') return
    if (!e.dataTransfer) return
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData(NODE_PRESET_MIME, serializePresetDescriptor(descriptor))
    e.dataTransfer.setData('text/plain', descriptor.type)
  }
  const handleQuickPresetClick = React.useCallback((presetId: string) => {
    const node = applyQuickPreset(presetId, { subsystemPath: path })
    if (!node) {
      window.alert('Unable to apply quick preset inside this subsystem. It may be invalid or not allowed.')
    }
  }, [applyQuickPreset, path])
  const buttonBase = 'w-full text-slate-900 border border-slate-300'
  const styleByType: Record<string, string> = {
    Converter: '!bg-blue-50 hover:!bg-blue-100',
    DualOutputConverter: '!bg-sky-50 hover:!bg-sky-100',
    Load: '!bg-orange-50 hover:!bg-orange-100',
    Bus: '!bg-white hover:!bg-slate-100',
    Note: '!bg-white hover:!bg-slate-100',
    Subsystem: '!bg-violet-50 hover:!bg-violet-100',
    SubsystemInput: '!bg-slate-50 hover:!bg-slate-100',
  }
  return (
    <div className="p-3 space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">Embedded Palette</h2>
        <div className="grid grid-cols-1 gap-2">
          <Button variant="outline" className={`${buttonBase} ${styleByType.Converter}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Converter' })} onClick={()=>onAdd({ type: 'Converter' })}>Converter</Button>
          <Button variant="outline" className={`${buttonBase} ${styleByType.DualOutputConverter}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'DualOutputConverter' })} onClick={()=>onAdd({ type: 'DualOutputConverter' })}>Dual-output Converter</Button>
          <Button variant="outline" className={`${buttonBase} ${styleByType.Load}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Load' })} onClick={()=>onAdd({ type: 'Load' })}>Load</Button>
          <Button variant="outline" className={`${buttonBase} ${styleByType.Bus}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Bus' })} onClick={()=>onAdd({ type: 'Bus' })}>Bus/Net</Button>
          <Button variant="outline" className={`${buttonBase} ${styleByType.Note}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Note' })} onClick={()=>onAdd({ type: 'Note' })}>Note</Button>
          <div className="h-px bg-slate-200 my-1" aria-hidden="true" />
          <Button variant="outline" className={`${buttonBase} ${styleByType.Subsystem}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Subsystem' })} onClick={()=>onAdd({ type: 'Subsystem' })}>Subsystem</Button>
          <Button variant="outline" className={`${buttonBase} ${styleByType.SubsystemInput}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'SubsystemInput' })} onClick={()=>onAdd({ type: 'SubsystemInput' })}>Subsystem Input Port</Button>
        </div>
        <div className="text-xs text-slate-500">Sources are not allowed inside embedded subsystems. Add one or more Subsystem Inputs as needed.</div>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-slate-600">Quick presets</h3>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Button
            ref={savePresetButtonRef}
            size="sm"
            variant="outline"
            onClick={()=>quickPresetDialogs.openCaptureDialog({ kind: 'selection' })}
          >
            Save selection as preset
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={()=>quickPresetDialogs.openManager()}
            style={manageButtonWidth ? { width: manageButtonWidth } : undefined}
          >
            Manage presets
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 mt-3">
          {availableQuickPresets.map(preset => (
            <QuickPresetTile
              key={preset.id}
              preset={preset}
              onClick={() => handleQuickPresetClick(preset.id)}
              onDragStart={(event) => {
                if (!event.dataTransfer) return
                event.dataTransfer.effectAllowed = 'copy'
                event.dataTransfer.setData(QUICK_PRESET_MIME, buildQuickPresetDragData({ presetId: preset.id }))
                event.dataTransfer.setData('text/plain', preset.name)
              }}
            />
          ))}
          {availableQuickPresets.length === 0 && (
            <div className="border border-dashed border-slate-300 rounded-lg p-4 text-sm text-slate-500">
              {quickPresets.length === 0
                ? 'No quick presets yet. Select a node and choose “Save as quick preset…” to add one.'
                : 'Quick presets that create Sources are hidden here because embedded subsystems cannot contain Sources.'}
            </div>
          )}
        </div>
        {blockedPresetCount > 0 && availableQuickPresets.length > 0 && (
          <div className="mt-2 text-xs text-slate-500">
            {blockedPresetCount} preset{blockedPresetCount === 1 ? '' : 's'} that create Sources are unavailable inside subsystems.
          </div>
        )}
      </section>
    </div>
  )
}
