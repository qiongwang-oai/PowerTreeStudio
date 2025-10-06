import React from 'react'
import { BookmarkPlus, Settings2 } from 'lucide-react'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import { useStore } from '../state/store'
import { createNodePreset, NODE_PRESET_MIME, type NodePresetDescriptor, serializePresetDescriptor } from '../utils/nodePresets'
import QuickPresetTile from './quick-presets/QuickPresetTile'
import { QUICK_PRESET_MIME, buildQuickPresetDragData } from '../utils/quickPresets'
import { useQuickPresetDialogs } from './quick-presets/QuickPresetDialogsContext'

export default function Palette(){
  const addNode = useStore(s=>s.addNode)
  const quickPresets = useStore(s => s.quickPresets)
  const applyQuickPreset = useStore(s => s.applyQuickPreset)
  const quickPresetDialogs = useQuickPresetDialogs()
  const onAdd = (descriptor: NodePresetDescriptor)=> {
    addNode(createNodePreset(descriptor as any))
  }
  const onDragStart = (e: React.DragEvent<HTMLElement>, descriptor: NodePresetDescriptor) => {
    if (!e.dataTransfer) return
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData(NODE_PRESET_MIME, serializePresetDescriptor(descriptor))
    e.dataTransfer.setData('text/plain', descriptor.type)
  }
  const buttonBase = 'w-full text-slate-900 border border-slate-300'
  const styleByType: Record<string, string> = {
    Source: '!bg-green-50 hover:!bg-green-100',
    Converter: '!bg-blue-50 hover:!bg-blue-100',
    DualOutputConverter: '!bg-sky-50 hover:!bg-sky-100',
    Load: '!bg-orange-50 hover:!bg-orange-100',
    Bus: '!bg-white hover:!bg-slate-100',
    Subsystem: '!bg-violet-50 hover:!bg-violet-100',
    SubsystemInput: '!bg-slate-50 hover:!bg-slate-100',
  }
  return (
    <div className="p-3 space-y-3">
      <h2 className="text-lg font-semibold text-black">Palette</h2>
      <div className="grid grid-cols-1 gap-2">
        <Button variant="outline" className={`${buttonBase} ${styleByType.Source}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Source' })} onClick={()=>onAdd({ type: 'Source' })}>Source</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.Converter}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Converter' })} onClick={()=>onAdd({ type: 'Converter' })}>Converter</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.DualOutputConverter}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'DualOutputConverter' })} onClick={()=>onAdd({ type: 'DualOutputConverter' })}>Dual-output Converter</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.Load}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Load' })} onClick={()=>onAdd({ type: 'Load' })}>Load</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.Bus}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Bus' })} onClick={()=>onAdd({ type: 'Bus' })}>Bus/Net</Button>
        <div className="h-px bg-slate-200 my-1" aria-hidden="true" />
        <Button variant="outline" className={`${buttonBase} ${styleByType.Subsystem}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Subsystem' })} onClick={()=>onAdd({ type: 'Subsystem' })}>Subsystem</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.SubsystemInput}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'SubsystemInput' })} onClick={()=>onAdd({ type: 'SubsystemInput' })}>Subsystem Input Port</Button>
      </div>
      <div>
        <h3 className="text-lg mt-3 font-semibold">Quick presets</h3>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Tooltip label="Save selection as preset">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9"
              onClick={()=>quickPresetDialogs.openCaptureDialog({ kind: 'selection' })}
              aria-label="Save selection as preset"
            >
              <BookmarkPlus className="h-5 w-5" />
            </Button>
          </Tooltip>
          <Tooltip label="Manage presets">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9"
              onClick={()=>quickPresetDialogs.openManager()}
              aria-label="Manage presets"
            >
              <Settings2 className="h-5 w-5" />
            </Button>
          </Tooltip>
        </div>
        <div className="grid grid-cols-1 gap-2 mt-3">
          {quickPresets.map(preset => (
            <QuickPresetTile
              key={preset.id}
              preset={preset}
              onClick={() => {
                const node = applyQuickPreset(preset.id)
                if (!node) {
                  window.alert('Unable to apply quick preset. It may be invalid.')
                }
              }}
              onDragStart={(event) => {
                if (!event.dataTransfer) return
                event.dataTransfer.effectAllowed = 'copy'
                event.dataTransfer.setData(QUICK_PRESET_MIME, buildQuickPresetDragData({ presetId: preset.id }))
                event.dataTransfer.setData('text/plain', preset.name)
              }}
            />
          ))}
          {quickPresets.length === 0 && (
            <div className="border border-dashed border-slate-300 rounded-lg p-4 text-sm text-slate-500">
              No quick presets yet. Select a node and choose “Save as quick preset…” from the canvas or inspector.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
