import React from 'react'
import { Button } from '../ui/button'
import { useStore } from '../../state/store'
import { Project } from '../../models'
import { createNodePreset, NODE_PRESET_MIME, type NodePresetDescriptor, serializePresetDescriptor } from '../../utils/nodePresets'

export default function SubsystemPalette({ subsystemId, subsystemPath, project }:{ subsystemId:string, subsystemPath?: string[], project: Project }){
  const addNodeNested = useStore(s=>s.nestedSubsystemAddNode)
  const path = (subsystemPath && subsystemPath.length>0)? subsystemPath : [subsystemId]
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
  const buttonBase = 'w-full text-slate-900 border border-slate-300'
  const styleByType: Record<string, string> = {
    Converter: '!bg-blue-50 hover:!bg-blue-100',
    Load: '!bg-orange-50 hover:!bg-orange-100',
    Bus: '!bg-white hover:!bg-slate-100',
    Note: '!bg-white hover:!bg-slate-100',
    Subsystem: '!bg-violet-50 hover:!bg-violet-100',
    SubsystemInput: '!bg-slate-50 hover:!bg-slate-100',
  }
  return (
    <div className="p-3 space-y-3">
      <h2 className="text-sm font-semibold text-slate-600">Embedded Palette</h2>
      <div className="grid grid-cols-1 gap-2">
        <Button variant="outline" className={`${buttonBase} ${styleByType.Converter}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Converter' })} onClick={()=>onAdd({ type: 'Converter' })}>Converter</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.Load}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Load' })} onClick={()=>onAdd({ type: 'Load' })}>Load</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.Bus}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Bus' })} onClick={()=>onAdd({ type: 'Bus' })}>Bus/Net</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.Note}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Note' })} onClick={()=>onAdd({ type: 'Note' })}>Note</Button>
        <div className="h-px bg-slate-200 my-1" aria-hidden="true" />
        <Button variant="outline" className={`${buttonBase} ${styleByType.Subsystem}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Subsystem' })} onClick={()=>onAdd({ type: 'Subsystem' })}>Subsystem</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.SubsystemInput}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'SubsystemInput' })} onClick={()=>onAdd({ type: 'SubsystemInput' })}>Subsystem Input Port</Button>
      </div>
      <div className="text-xs text-slate-500">Sources are not allowed inside embedded subsystems. Add one or more Subsystem Inputs as needed.</div>
    </div>
  )
}
