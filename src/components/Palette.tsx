import React from 'react'
import { Button } from './ui/button'
import { useStore } from '../state/store'
import { createNodePreset, NODE_PRESET_MIME, type NodePresetDescriptor, serializePresetDescriptor } from '../utils/nodePresets'

export default function Palette(){
  const addNode = useStore(s=>s.addNode)
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
    Note: '!bg-white hover:!bg-slate-100',
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
        <Button variant="outline" className={`${buttonBase} ${styleByType.Note}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Note' })} onClick={()=>onAdd({ type: 'Note' })}>Note</Button>
        <div className="h-px bg-slate-200 my-1" aria-hidden="true" />
        <Button variant="outline" className={`${buttonBase} ${styleByType.Subsystem}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'Subsystem' })} onClick={()=>onAdd({ type: 'Subsystem' })}>Subsystem</Button>
        <Button variant="outline" className={`${buttonBase} ${styleByType.SubsystemInput}`} draggable onDragStart={(e)=>onDragStart(e, { type: 'SubsystemInput' })} onClick={()=>onAdd({ type: 'SubsystemInput' })}>Subsystem Input Port</Button>
      </div>
      <div>
        <h3 className="text-lg mt-3 font-semibold">Quick presets</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Button
            variant="outline"
            className={`${buttonBase} ${styleByType.Source}`}
            draggable
            onDragStart={(e)=>onDragStart(e, { type: 'Source' })}
            onClick={()=>addNode(createNodePreset({ type: 'Source' }))}
          >
            48V Source
          </Button>
          <Button
            variant="outline"
            className={`${buttonBase} ${styleByType.Converter}`}
            draggable
            onDragStart={(e)=>onDragStart(e, { type: 'Converter' })}
            onClick={()=>addNode(createNodePreset({ type: 'Converter' }))}
          >
            12V Buck 95%
          </Button>
          <Button
            variant="outline"
            className={`${buttonBase} ${styleByType.Converter}`}
            draggable
            onDragStart={(e)=>onDragStart(e, { type: 'Converter', variant: 'vrm-0p9-92' })}
            onClick={()=>addNode(createNodePreset({ type: 'Converter', variant: 'vrm-0p9-92' }))}
          >
            VRM 0.9V 92%
          </Button>
          <Button
            variant="outline"
            className={`${buttonBase} ${styleByType.DualOutputConverter}`}
            draggable
            onDragStart={(e)=>onDragStart(e, { type: 'DualOutputConverter', variant: 'dual-default' })}
            onClick={()=>addNode(createNodePreset({ type: 'DualOutputConverter', variant: 'dual-default' }))}
          >
            Dual-output default
          </Button>
        </div>
      </div>
    </div>
  )
}
