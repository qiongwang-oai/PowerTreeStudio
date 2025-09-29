import React, { useMemo } from 'react'
import { useStore } from '../state/store'
import { CanvasMarkup, DualOutputConverterBranch, DualOutputConverterNode, Project } from '../models'
import { Card, CardContent, CardHeader } from './ui/card'
import { Tabs, TabsContent, TabsList } from './ui/tabs'
import { Button } from './ui/button'
import { compute, etaFromModel } from '../calc'
import { fmt } from '../utils'
import { download, importProjectFile, serializeProject } from '../io'
import { sanitizeEmbeddedProject } from '../utils/embeddedProject'
import type { InspectorSelection } from '../types/selection'
import { resolveProjectAtPath } from '../utils/subsystemPath'
import SubsystemInspector from './subsystem/SubsystemInspector'
import EfficiencyEditor from './EfficiencyEditor'
import { useQuickPresetDialogs } from './quick-presets/QuickPresetDialogsContext'

export default function Inspector({selection, onDeleted, onOpenSubsystemEditor, onSelect}:{selection:InspectorSelection|null, onDeleted?:()=>void, onOpenSubsystemEditor?:(id:string)=>void, onSelect?:(selection:InspectorSelection)=>void}){
  const project = useStore(s=>s.project)
  const update = useStore(s=>s.updateNode)
  const removeNode = useStore(s=>s.removeNode)
  const updateEdge = useStore(s=>s.updateEdge as any)
  const removeEdge = useStore(s=>s.removeEdge)
  const updateMarkup = useStore(s=>s.updateMarkup)
  const removeMarkup = useStore(s=>s.removeMarkup)
  const expandedSubsystemViews = useStore(s=>s.expandedSubsystemViews)
  const expandSubsystemView = useStore(s=>s.expandSubsystemView)
  const collapseSubsystemView = useStore(s=>s.collapseSubsystemView)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const markups = project.markups ?? []
  const edge = useMemo(()=> (selection && selection.kind==='edge') ? (project.edges.find(e=>e.id===selection.id) || null) : null, [project.edges, selection])
  const markup = useMemo(()=> (selection && selection.kind==='markup') ? (markups.find(m=>m.id===selection.id) || null) : null, [markups, selection])
  const analysis = compute(project)
  const node = useMemo(()=> (selection && selection.kind==='node') ? (project.nodes.find(n=>n.id===selection.id) || null) : null, [project.nodes, selection])
  const quickPresetDialogs = useQuickPresetDialogs()
  const [tab, setTab] = React.useState('props')
  if (!selection) return <div className="p-3 text-sm text-slate-500">Select a node, edge, or markup to edit properties.</div>
  if (selection.kind === 'multi') {
    const total = selection.nodes.length + selection.edges.length + selection.markups.length
    const resolveNodeLabel = (id: string) => project.nodes.find(n => n.id === id)?.name || id
    const resolveEdgeLabel = (id: string) => {
      const match = project.edges.find(e => e.id === id)
      if (!match) return id
      const from = project.nodes.find(n => n.id === match.from)?.name || match.from
      const to = project.nodes.find(n => n.id === match.to)?.name || match.to
      return `${from} → ${to}`
    }
    const resolveMarkupLabel = (id: string) => {
      const m = markups.find(x => x.id === id)
      if (!m) return id
      if (m.type === 'text') return `Text: ${(m.text || '').slice(0, 24) || 'Untitled'}`
      if (m.type === 'line') return 'Line / Arrow'
      if (m.type === 'rectangle') return 'Box'
      return id
    }
    const listPreview = <T,>(items: T[], formatter: (item: T) => string) => {
      if (!items.length) return 'None'
      if (items.length > 4) {
        const preview = items.slice(0, 3).map(formatter)
        return `${preview.join(', ')} … (+${items.length - 3} more)`
      }
      return items.map(formatter).join(', ')
    }
    return (
      <div className="p-4 space-y-3 text-sm text-slate-600">
        <div className="text-base font-semibold text-slate-800">Multiple items selected</div>
        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Total</span>
            <span className="font-medium">{total}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Nodes</span>
            <span className="font-medium">{selection.nodes.length}</span>
          </div>
          <div className="text-xs text-slate-500">{listPreview(selection.nodes, resolveNodeLabel)}</div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Edges</span>
            <span className="font-medium">{selection.edges.length}</span>
          </div>
          <div className="text-xs text-slate-500">{listPreview(selection.edges, resolveEdgeLabel)}</div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Markups</span>
            <span className="font-medium">{selection.markups.length}</span>
          </div>
          <div className="text-xs text-slate-500">{listPreview(selection.markups, resolveMarkupLabel)}</div>
        </div>
        <div className="text-xs text-slate-500">
          Copy, delete, or paste to duplicate the selection. Press Esc to clear.
        </div>
      </div>
    )
  }
  if (selection.kind === 'nested-node' || selection.kind === 'nested-edge') {
    const nestedProject = resolveProjectAtPath(project, selection.subsystemPath)
    if (!nestedProject) {
      return <div className="p-3 text-sm text-slate-500">Embedded subsystem not found.</div>
    }
    const subsystemId = selection.subsystemPath[selection.subsystemPath.length - 1]
    const nestedId = selection.kind === 'nested-node' ? selection.nodeId : selection.edgeId
    return (
      <SubsystemInspector
        subsystemId={subsystemId}
        subsystemPath={selection.subsystemPath}
        project={nestedProject}
        selected={nestedId}
        onDeleted={onDeleted}
      />
    )
  }
  if (selection.kind === 'markup') {
    if (!markup) {
      return <div className="p-3 text-sm text-slate-500">Markup not found.</div>
    }
    const label = markup.type === 'text' ? 'Text markup'
      : markup.type === 'line' ? 'Line / arrow markup'
      : 'Rectangle markup'
    const onDeleteMarkup = () => {
      removeMarkup(markup.id)
      onDeleted && onDeleted()
    }
    const renderControls = (() => {
      if (markup.type === 'text') {
        return (
          <div className="space-y-3 text-sm">
            <label className="flex flex-col gap-1">
              <span>Content</span>
              <textarea
                className="input"
                rows={4}
                value={markup.text}
                onChange={e => updateMarkup(markup.id, current => current.type === 'text' ? { ...current, text: e.target.value } : current)}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Font size (px)</span>
              <input
                className="input"
                type="number"
                min={8}
                value={markup.fontSize}
                onChange={e => {
                  const raw = Number(e.target.value)
                  const nextSize = Number.isFinite(raw) ? Math.max(8, raw) : markup.fontSize
                  updateMarkup(markup.id, current => current.type === 'text' ? { ...current, fontSize: nextSize } : current)
                }}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Color</span>
              <input
                aria-label="Text color"
                type="color"
                className="h-8 w-12 cursor-pointer border border-slate-300 rounded"
                value={markup.color}
                onChange={e => updateMarkup(markup.id, current => current.type === 'text' ? { ...current, color: e.target.value } : current)}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Bold</span>
              <input
                type="checkbox"
                checked={markup.isBold === true}
                onChange={e => updateMarkup(markup.id, current => current.type === 'text' ? { ...current, isBold: e.target.checked } : current)}
              />
            </label>
          </div>
        )
      }
      if (markup.type === 'line') {
        return (
          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between gap-2">
              <span>Color</span>
              <input
                aria-label="Line color"
                type="color"
                className="h-8 w-12 cursor-pointer border border-slate-300 rounded"
                value={markup.color}
                onChange={e => updateMarkup(markup.id, current => current.type === 'line' ? { ...current, color: e.target.value } : current)}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Thickness (px)</span>
              <input
                className="input"
                type="number"
                min={1}
                step={0.5}
                value={markup.thickness}
                onChange={e => {
                  const raw = Number(e.target.value)
                  const nextValue = Number.isFinite(raw) ? Math.max(0.5, raw) : markup.thickness
                  updateMarkup(markup.id, current => current.type === 'line' ? { ...current, thickness: nextValue } : current)
                }}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Dotted</span>
              <input
                type="checkbox"
                checked={markup.isDashed === true}
                onChange={e => updateMarkup(markup.id, current => current.type === 'line' ? { ...current, isDashed: e.target.checked } : current)}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Arrow head</span>
              <input
                type="checkbox"
                checked={markup.arrowHead === 'end'}
                onChange={e => updateMarkup(markup.id, current => current.type === 'line' ? { ...current, arrowHead: e.target.checked ? 'end' : 'none' } : current)}
              />
            </label>
          </div>
        )
      }
      if (markup.type === 'rectangle') {
        const hasFill = typeof markup.fillColor === 'string'
        const fillColorValue = hasFill ? markup.fillColor! : '#38bdf8'
        const effectiveOpacity = typeof markup.fillOpacity === 'number' ? Math.min(1, Math.max(0, markup.fillOpacity)) : 0.18
        const isAboveNodes = (markup.zIndex ?? -10) >= 20
        return (
          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between gap-2">
              <span>Border color</span>
              <input
                aria-label="Rectangle border color"
                type="color"
                className="h-8 w-12 cursor-pointer border border-slate-300 rounded"
                value={markup.strokeColor}
                onChange={e => updateMarkup(markup.id, current => current.type === 'rectangle' ? { ...current, strokeColor: e.target.value } : current)}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Border width (px)</span>
              <input
                className="input"
                type="number"
                min={1}
                step={0.5}
                value={markup.thickness}
                onChange={e => {
                  const raw = Number(e.target.value)
                  const nextValue = Number.isFinite(raw) ? Math.max(0.5, raw) : markup.thickness
                  updateMarkup(markup.id, current => current.type === 'rectangle' ? { ...current, thickness: nextValue } : current)
                }}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Dotted border</span>
              <input
                type="checkbox"
                checked={markup.isDashed === true}
                onChange={e => updateMarkup(markup.id, current => current.type === 'rectangle' ? { ...current, isDashed: e.target.checked } : current)}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Filled</span>
              <input
                type="checkbox"
                checked={hasFill}
                onChange={e => {
                  const shouldFill = e.target.checked
                  updateMarkup(markup.id, current => {
                    if (current.type !== 'rectangle') return current
                    if (!shouldFill) {
                      return { ...current, fillColor: null, fillOpacity: 0 }
                    }
                    return { ...current, fillColor: fillColorValue, fillOpacity: effectiveOpacity || 0.18 }
                  })
                }}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Fill color</span>
              <input
                aria-label="Rectangle fill color"
                type="color"
                disabled={!hasFill}
                className={`h-8 w-12 cursor-pointer border border-slate-300 rounded ${hasFill ? '' : 'opacity-50'}`}
                value={fillColorValue}
                onChange={e => updateMarkup(markup.id, current => current.type === 'rectangle' ? { ...current, fillColor: e.target.value } : current)}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Fill opacity</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={effectiveOpacity}
                  disabled={!hasFill}
                  onChange={e => {
                    const raw = Number(e.target.value)
                    const nextOpacity = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : effectiveOpacity
                    updateMarkup(markup.id, current => current.type === 'rectangle' ? { ...current, fillOpacity: nextOpacity } : current)
                  }}
                />
                <input
                  className="w-16 border border-slate-300 rounded px-1 py-0.5 text-right text-xs"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={effectiveOpacity.toFixed(2)}
                  disabled={!hasFill}
                  onChange={e => {
                    const raw = Number(e.target.value)
                    const nextOpacity = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : effectiveOpacity
                    updateMarkup(markup.id, current => current.type === 'rectangle' ? { ...current, fillOpacity: nextOpacity } : current)
                  }}
                />
              </div>
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Corner radius (px)</span>
              <input
                className="input"
                type="number"
                min={0}
                step={1}
                value={markup.cornerRadius ?? 0}
                onChange={e => {
                  const raw = Number(e.target.value)
                  const nextRadius = Number.isFinite(raw) ? Math.max(0, raw) : (markup.cornerRadius ?? 0)
                  updateMarkup(markup.id, current => current.type === 'rectangle' ? { ...current, cornerRadius: nextRadius } : current)
                }}
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Bring to front</span>
              <input
                type="checkbox"
                checked={isAboveNodes}
                onChange={e => {
                  const nextZ = e.target.checked ? 50 : -10
                  updateMarkup(markup.id, current => current.type === 'rectangle' ? { ...current, zIndex: nextZ } : current)
                }}
              />
            </label>
          </div>
        )
      }
      return null
    })()
    return (
      <div className="h-full flex flex-col">
        <Card className="flex-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="font-semibold">{label}</div>
              <Button variant="outline" size="sm" onClick={onDeleteMarkup}>Delete</Button>
            </div>
          </CardHeader>
          <CardContent>
            {renderControls ?? <div className="text-sm text-slate-500">Unsupported markup type.</div>}
          </CardContent>
        </Card>
      </div>
    )
  }
  if (edge) {
    return (
      <div className="h-full flex flex-col">
        <Card className="flex-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="font-semibold">Edge <span className="text-xs text-slate-500">({edge.id})</span></div>
              <Button variant="outline" size="sm" onClick={()=>{ removeEdge(edge.id); onDeleted && onDeleted() }}>Delete</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <label className="flex items-center justify-between gap-2">
                <span>Resistance (mΩ)</span>
                <input
                  className="input"
                  type="number"
                  value={edge.interconnect?.R_milliohm ?? 0}
                  onChange={e=> updateEdge && updateEdge(edge.id, { interconnect: { ...edge.interconnect, R_milliohm: parseFloat(e.target.value) } })}
                />
              </label>
              <ReadOnlyRow label="Dissipation (W)" value={fmt(analysis.edges[edge.id]?.P_loss_edge ?? 0, 4)} />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
  if (!node) return <div className="p-3 text-sm text-slate-500">Select a node or edge to edit properties.</div>
  const onChange = (field:string, value:any)=>{ const patch:any = {}; patch[field] = value; update(node.id, patch) }
  return (
    <div className="h-full flex flex-col">
      <Card className="flex-1">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="font-semibold">{node.name} <span className="text-xs text-slate-500">({node.type})</span></div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const snapshot = JSON.parse(JSON.stringify(node)) as any
                  quickPresetDialogs.openCaptureDialog({ kind: 'node', node: snapshot })
                }}
              >
                Save as preset
              </Button>
              <Button variant="outline" size="sm" onClick={()=>{ removeNode(node.id); onDeleted && onDeleted() }}>Delete</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList
              value={tab}
              onValueChange={setTab}
              items={[
                { value: 'props', label: 'Properties' },
                ...((node!.type !== 'Note') ? [{ value: 'warn', label: 'Node Summary' }] : []),
                ...(node!.type === 'Subsystem' ? [{ value: 'embed', label: 'Embedded Tree' }] : [])
              ]}
            />
            <TabsContent value={tab} when="props">
              <div className="space-y-2 text-sm">
                <div className="text-base text-slate-600 font-medium mb-1">Editable Properties</div>
                <label className="flex items-center justify-between gap-2"><span>Name</span><input aria-label="name" className="input" value={node.name} onChange={e=>onChange('name', e.target.value)} /></label>
                {(node.type==='Converter' || node.type==='DualOutputConverter') && (
                  <>
                    <label className="flex items-center justify-between gap-2"><span>Controller Part Number</span><input className="input" value={(node as any).controllerPartNumber || ''} onChange={e=>onChange('controllerPartNumber', e.target.value)} /></label>
                    <label className="flex items-center justify-between gap-2"><span>Power Stage Part Number</span><input className="input" value={(node as any).powerStagePartNumber || ''} onChange={e=>onChange('powerStagePartNumber', e.target.value)} /></label>
                  </>
                )}
                {node.type==='Source' && <>
                  <Field label="Vout (V)" value={(node as any).Vout} onChange={v=>onChange('Vout', v)} />
                  <div className="border-t mt-4 pt-2">
                    <div className="text-base text-slate-600 font-medium mb-1">Computed</div>
                    <ReadOnlyRow label="Total output power (W)" value={fmt(analysis.nodes[node.id]?.P_out ?? 0, 3)} />
                  </div>
                </>}
                {node.type==='Converter' && (() => {
                  const converterAnalysis = analysis.nodes[node.id] || {}
                  const maxCurrent = (node as any).Iout_max || 1
                  return (
                    <>
                      <Field label="Vin_min (V)" value={(node as any).Vin_min} onChange={v=>onChange('Vin_min', v)} />
                      <Field label="Vin_max (V)" value={(node as any).Vin_max} onChange={v=>onChange('Vin_max', v)} />
                      <Field label="Vout (V)" value={(node as any).Vout} onChange={v=>onChange('Vout', v)} />
                      <Field label="Pout_max (W)" value={(node as any).Pout_max||''} onChange={v=>onChange('Pout_max', v)} />
                      <Field label="Iout_max (A)" value={(node as any).Iout_max||''} onChange={v=>onChange('Iout_max', v)} />
                      <Field label="Number of phases" value={(node as any).phaseCount ?? 1} onChange={v=>onChange('phaseCount', Math.max(1, Math.round(v)))} />
                      <EfficiencyEditor
                        label="Efficiency"
                        efficiency={(node as any).efficiency}
                        maxCurrent={maxCurrent}
                        onChange={eff=>onChange('efficiency', eff)}
                        analysis={{ P_out: converterAnalysis?.P_out, I_out: converterAnalysis?.I_out }}
                        modelNode={node as any}
                      />
                      <div className="border-t mt-4 pt-2">
                        <div className="text-base text-slate-600 font-medium mb-1">Computed</div>
                        <ReadOnlyRow label="Total input power (W)" value={fmt(converterAnalysis?.P_in ?? 0, 3)} />
                        <ReadOnlyRow label="Total output power (W)" value={fmt(converterAnalysis?.P_out ?? 0, 3)} />
                        <ReadOnlyRow label="Dissipation (W)" value={fmt((converterAnalysis?.P_in ?? 0) - (converterAnalysis?.P_out ?? 0), 3)} />
                      </div>
                    </>
                  )
                })()}
                {node.type==='DualOutputConverter' && (() => {
                  const dual = node as any as DualOutputConverterNode
                  const outputs: DualOutputConverterBranch[] = Array.isArray(dual.outputs) ? dual.outputs : []
                  const analysisEntry = analysis.nodes[node.id] as any
                  const metrics: Record<string, any> = analysisEntry?.__outputs || {}
                  const fallbackHandle = outputs.length > 0 && outputs[0]?.id ? outputs[0]!.id : 'outputA'
                  const updateBranch = (idx: number, patch: Partial<DualOutputConverterBranch>) => {
                    const next = outputs.length ? [...outputs] : []
                    const existing = next[idx] || { id: `output${idx+1}`, efficiency: { type: 'fixed', value: 0.9 } }
                    next[idx] = { ...existing, ...patch }
                    onChange('outputs', next as any)
                  }
                  return (
                    <>
                      <Field label="Vin_min (V)" value={(dual as any).Vin_min} onChange={v=>onChange('Vin_min', v)} />
                      <Field label="Vin_max (V)" value={(dual as any).Vin_max} onChange={v=>onChange('Vin_max', v)} />
                      {outputs.map((branch, idx) => {
                        const handleId = branch?.id || (idx === 0 ? fallbackHandle : `${fallbackHandle}-${idx}`)
                        const metric = metrics[handleId] || {}
                        const label = branch?.label || `Output ${String.fromCharCode(65 + idx)}`
                        return (
                          <div key={handleId} className="border rounded-md p-3 space-y-2 mt-3">
                            <div className="text-sm font-semibold text-slate-600">{label}</div>
                            <Field label="Vout (V)" value={branch?.Vout ?? 0} onChange={v=>updateBranch(idx, { Vout: v })} />
                            <Field label="Pout_max (W)" value={branch?.Pout_max ?? ''} onChange={v=>updateBranch(idx, { Pout_max: v })} />
                            <Field label="Iout_max (A)" value={branch?.Iout_max ?? ''} onChange={v=>updateBranch(idx, { Iout_max: v })} />
                            <Field label="Number of phases" value={branch?.phaseCount ?? 1} onChange={v=>updateBranch(idx, { phaseCount: Math.max(1, Math.round(v)) })} />
                            <EfficiencyEditor
                              label="Efficiency"
                              efficiency={branch?.efficiency}
                              maxCurrent={branch?.Iout_max || 1}
                              onChange={eff=>updateBranch(idx, { efficiency: eff })}
                              analysis={{ P_out: metric?.P_out, I_out: metric?.I_out }}
                              modelNode={branch as any}
                            />
                          </div>
                        )
                      })}
                      <div className="border-t mt-4 pt-2">
                        <div className="text-base text-slate-600 font-medium mb-1">Computed</div>
                        <ReadOnlyRow label="Total input power (W)" value={fmt(analysisEntry?.P_in ?? 0, 3)} />
                        <ReadOnlyRow label="Total output power (W)" value={fmt(analysisEntry?.P_out ?? 0, 3)} />
                        <ReadOnlyRow label="Dissipation (W)" value={fmt((analysisEntry?.P_in ?? 0) - (analysisEntry?.P_out ?? 0), 3)} />
                      </div>
                    </>
                  )
                })()}
                {node.type==='Load' && <>
                  <Field label="Vreq (V)" value={(node as any).Vreq} onChange={v=>onChange('Vreq', v)} />
                  <Field label="I_typ (A)" value={(node as any).I_typ} onChange={v=>onChange('I_typ', v)} />
                  <Field label="I_max (A)" value={(node as any).I_max} onChange={v=>onChange('I_max', v)} />
                  <Field label="I_idle (A)" value={(node as any).I_idle} onChange={v=>onChange('I_idle', v)} />
                  <Field label="Utilization_typ (%)" value={(node as any).Utilization_typ ?? 100} onChange={v=>onChange('Utilization_typ', Math.max(0, Math.min(100, v)))} />
                  <Field label="Utilization_max (%)" value={(node as any).Utilization_max ?? 100} onChange={v=>onChange('Utilization_max', Math.max(0, Math.min(100, v)))} />
                  <Field label="Number of Paralleled Devices" value={(node as any).numParalleledDevices ?? 1} onChange={v=>onChange('numParalleledDevices', Math.max(1, Math.round(v)))} />
                  <label className="flex items-center justify-between gap-2">
                    <span>Critical Load</span>
                    <input
                      type="checkbox"
                      checked={(node as any).critical !== false}
                      onChange={e=>onChange('critical', e.target.checked)}
                    />
                  </label>
                  <div className="border-t mt-4 pt-2">
                    <div className="text-base text-slate-600 font-medium mb-1">Computed</div>
                    <ReadOnlyRow label="Total input power (W)" value={fmt(analysis.nodes[node.id]?.P_in ?? 0, 3)} />
                  </div>
                </>}
                {node.type==='Bus' && <Field label="V_bus (V)" value={(node as any).V_bus} onChange={v=>onChange('V_bus', v)} />}
                {node.type==='Note' && <label className="flex items-center justify-between gap-2"><span>Text</span><textarea className="input" value={(node as any).text || ''} onChange={e=>onChange('text', e.target.value)} /></label>}
                {node.type==='Subsystem' && <>
                  <Field label="Number of Paralleled Systems" value={(node as any).numParalleledSystems ?? 1} onChange={v=>onChange('numParalleledSystems', Math.max(1, Math.round(v)))} />
                  <div className="flex items-start justify-between gap-3">
                    <span>Embedded Project: <b>{(node as any).projectFileName || 'None'}</b></span>
                    <div className="flex flex-col gap-2">
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".json,.yaml,.yml,application/json,text/yaml"
                        className="hidden"
                        onChange={async e=>{
                          const file = e.target.files?.[0]
                          if (!file) return
                          const pj = await importProjectFile(file)
                          const sanitized = sanitizeEmbeddedProject(pj)
                          onChange('project', sanitized as Project)
                          onChange('projectFileName', file.name)
                          e.currentTarget.value = ''
                        }}
                      />
                      <Button variant="outline" size="sm" onClick={()=>fileRef.current?.click()}>Import</Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!(node as any).project}
                        onClick={()=>{
                          const embeddedProject = (node as any).project as Project | undefined
                          if (!embeddedProject) return
                          const fileName = (node as any).projectFileName || (node.name || 'Subsystem')
                          const trimmed = String(fileName).trim()
                          const base = trimmed ? trimmed.replace(/\s+/g, '_').replace(/\.[^./\\]+$/, '') : 'Subsystem'
                          const downloadName = `${base || 'Subsystem'}.yaml`
                          download(downloadName, serializeProject(embeddedProject))
                        }}
                      >
                        Export
                      </Button>
                    </div>
                  </div>
                  <div className="border-t mt-4 pt-2">
                    <div className="text-base text-slate-600 font-medium mb-1">Computed (embedded)</div>
                    <ReadOnlyRow label="Inputs (V)" value={(() => {
                    const embedded = (node as any).project
                    const inputs = embedded?.nodes?.filter((n:any)=> n.type==='SubsystemInput') || []
                    if (inputs.length===0) return '—'
                    if (inputs.length===1) return Number(inputs[0]?.Vout || 0)
                    return inputs.map((i:any)=>i.Vout).join(', ')
                  })()} />
                    <ReadOnlyRow label="Σ Loads (W)" value={fmt(analysis.nodes[node.id]?.P_out ?? 0, 3)} />
                    <ReadOnlyRow label="Σ Sources (W)" value={fmt(analysis.nodes[node.id]?.P_in ?? 0, 3)} />
                    <ReadOnlyRow label="η (%)" value={((analysis.nodes[node.id]?.P_in||0)>0 ? ((analysis.nodes[node.id]?.P_out||0)/(analysis.nodes[node.id]?.P_in||1))*100 : 0).toFixed(2)} />
                    <ReadOnlyRow label="Dissipation (W)" value={fmt(((analysis.nodes[node.id]?.P_in||0) - (analysis.nodes[node.id]?.P_out||0)), 3)} />
                  </div>
                </>}
                {node.type==='SubsystemInput' && <>
                  <Field label="Vout (V)" value={(node as any).Vout} onChange={v=>onChange('Vout', v)} />
                  <div className="text-xs text-slate-500">Used as upstream voltage for currents to downstream nodes.</div>
                </>}
              </div>
            </TabsContent>
            {(node.type !== 'Note') && (
              <TabsContent value={tab} when="warn">
                <div className="text-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-slate-500 mr-2">Scenario</span>
                      <span className="inline-block text-sm px-2 py-0.5 rounded border bg-slate-50">{project.currentScenario}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm text-slate-600">Warnings: <b>{(analysis.nodes[node.id]?.warnings || []).length}</b></div>
                      <Button size="sm" variant="outline" onClick={()=>setTab('props')}>Edit Properties</Button>
                    </div>
                  </div>
                  <div className="border-t pt-2">
                    <div className="text-base text-slate-600 font-medium mb-1">Warnings</div>
                    {(() => {
                      const warns = analysis.nodes[node.id]?.warnings || []
                      if (warns.length) {
                        const text = warns.join('\n')
                        return (
                          <>
                            <ul className="list-disc pl-5">{warns.map((w:string,i:number)=><li key={i}>{w}</li>)}</ul>
                            <div className="pt-1">
                              <Button size="sm" variant="outline" onClick={()=>{ try{ navigator.clipboard.writeText(text) }catch(e){} }}>Copy warnings</Button>
                            </div>
                          </>
                        )
                      }
                      return <div className="text-sm text-slate-500">No warnings</div>
                    })()}
                  </div>
                  <div className="border-t pt-2">
                    <div className="text-base text-slate-600 font-medium mb-1">Context</div>
                    {(() => {
                      const res = analysis.nodes[node.id] as any
                      if (!res) return null
                      if (node.type === 'Converter' || node.type === 'DualOutputConverter') {
                        const eff = (node as any).efficiency
                        const eta = (()=>{ try{ return etaFromModel(eff, res.P_out||0, res.I_out||0, node as any) }catch(e){ return 0 } })()
                        return (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <div>P_in: <b>{(res.P_in||0).toFixed(3)} W</b></div>
                            <div>P_out: <b>{(res.P_out||0).toFixed(3)} W</b></div>
                            <div>I_in: <b>{(res.I_in||0).toFixed(3)} A</b></div>
                            <div>I_out: <b>{(res.I_out||0).toFixed(3)} A</b></div>
                            <div>Loss: <b>{(res.loss||0).toFixed(3)} W</b></div>
                            <div>η(at op): <b>{eta.toFixed(4)}</b></div>
                          </div>
                        )
                      }
                      if (node.type === 'Load') {
                        const up = (res.V_upstream ?? (node as any).Vreq) as number
                        const allow = (node as any).Vreq * (1 - project.defaultMargins.voltageMarginPct/100)
                        return (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <div>V_upstream: <b>{(up||0).toFixed(3)} V</b></div>
                            <div>Allow ≥ <b>{allow.toFixed(3)} V</b></div>
                            <div>P_in: <b>{(res.P_in||0).toFixed(3)} W</b></div>
                            <div>I_in: <b>{(res.I_in||0).toFixed(3)} A</b></div>
                          </div>
                        )
                      }
                      if (node.type === 'Source' || node.type === 'SubsystemInput') {
                        return (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <div>P_out: <b>{(res.P_out||0).toFixed(3)} W</b></div>
                            <div>I_out: <b>{(res.I_out||0).toFixed(3)} A</b></div>
                          </div>
                        )
                      }
                      if (node.type === 'Subsystem') {
                        return (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <div>Vin (resolved): <b>{((res as any).inputV_nom||0).toFixed(3)} V</b></div>
                            <div>Paralleled: <b>{(((node as any).numParalleledSystems ?? 1))}</b></div>
                            <div>P_in: <b>{(res.P_in||0).toFixed(3)} W</b></div>
                            <div>P_out: <b>{(res.P_out||0).toFixed(3)} W</b></div>
                            <div>Loss: <b>{(res.loss||0).toFixed(3)} W</b></div>
                          </div>
                        )
                      }
                      if (node.type === 'Bus') {
                        return (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <div>V_bus: <b>{((node as any).V_bus||0).toFixed(3)} V</b></div>
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                  <div className="border-t pt-2">
                    <div className="text-base text-slate-600 font-medium mb-1">Power integrity check</div>
                    {(() => {
                      const emap = analysis.edges
                      const incoming = [...project.edges.filter(e=>e.to===node.id)].sort((a,b)=>{
                        const va = (emap[a.id]?.V_drop || 0)
                        const vb = (emap[b.id]?.V_drop || 0)
                        return vb - va
                      })
                      const outgoing = [...project.edges.filter(e=>e.from===node.id)].sort((a,b)=>{
                        const va = (emap[a.id]?.V_drop || 0)
                        const vb = (emap[b.id]?.V_drop || 0)
                        return vb - va
                      })
                      const Item = ({edgeId, direction}:{edgeId:string, direction:'incoming'|'outgoing'}) => {
                        const e = project.edges.find(x=>x.id===edgeId)
                        if (!e) return null
                        const ce = emap[edgeId] || {}
                        const I = (ce.I_edge||0)
                        const Vd = (ce.V_drop||0)
                        const Pl = (ce.P_loss_edge||0)
                        const Rm = (e.interconnect?.R_milliohm ?? 0)
                        const otherNodeId = direction==='incoming' ? e.from : e.to
                        const otherNode = project.nodes.find(n=>n.id===otherNodeId)
                        const displayName = otherNode?.name || otherNodeId
                        return (
                          <div className="flex items-center justify-between gap-2 py-0.5">
                            <div className="text-sm">
                              <b>{displayName}</b> — {Rm} mΩ | I {I.toFixed(3)} A | ΔV {Vd.toFixed(4)} V | P_loss {Pl.toFixed(4)} W
                            </div>
                            {onSelect && <Button size="sm" variant="outline" onClick={()=>onSelect({ kind: 'edge', id: edgeId })}>Select</Button>}
                          </div>
                        )
                      }
                      return (
                        <div className="space-y-2">
                          <div>
                            <div className="text-sm text-slate-600 mb-1">Incoming connections</div>
                            {incoming.length? incoming.map(e=> <Item key={e.id} edgeId={e.id} direction="incoming" />) : <div className="text-sm text-slate-400">None</div>}
                          </div>
                          <div>
                            <div className="text-sm text-slate-600 mb-1">Outgoing connections</div>
                            {outgoing.length? outgoing.map(e=> <Item key={e.id} edgeId={e.id} direction="outgoing" />) : <div className="text-sm text-slate-400">None</div>}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                  
                </div>
              </TabsContent>
            )}
            {node?.type==='Subsystem' && (
              <TabsContent value={tab} when="embed">
                {(() => {
                  const subsystem = node as any
                  const color = subsystem.embeddedViewColor || '#e0f2fe'
                  const isExpanded = !!expandedSubsystemViews[subsystem.id]
                  return (
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <div>Embedded project: <b>{subsystem.projectFileName || 'None'}</b></div>
                        <Button size="sm" onClick={()=> onOpenSubsystemEditor && onOpenSubsystemEditor(node.id)}>Open Editor</Button>
                      </div>
                      <div className="grid grid-cols-[auto,1fr] items-center gap-x-3 gap-y-2">
                        <label className="text-xs uppercase tracking-wide text-slate-500">Container Color</label>
                        <div className="flex items-center gap-3">
                          <input
                            aria-label="Embedded view color"
                            type="color"
                            className="h-8 w-12 cursor-pointer border border-slate-300 rounded"
                            value={color}
                            onChange={e=>onChange('embeddedViewColor', e.target.value)}
                          />
                          <span className="text-xs text-slate-500">Overlay uses ~20% opacity.</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs text-slate-500">Drag the container to move all embedded nodes together.</div>
                        </div>
                        {isExpanded ? (
                          <Button size="sm" variant="outline" onClick={()=>collapseSubsystemView(subsystem.id)}>Hide Embedded View</Button>
                        ) : (
                          <Button size="sm" onClick={()=>expandSubsystemView(subsystem.id)}>Expand Embedded View</Button>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">Double-click the Subsystem node on canvas to open in the editor.</div>
                    </div>
                  )
                })()}
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
function Field({label, value, onChange}:{label:string, value:any, onChange:(v:number)=>void}){
  const displayValue = Number.isFinite(value) ? value : ''
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <input
        className="input"
        type="number"
        value={displayValue as any}
        onChange={e=>{
          const raw = e.target.value
          const n = Number(raw)
          onChange(Number.isFinite(n) ? n : 0)
        }}
      />
    </label>
  )
}
function ReadOnlyRow({label, value}:{label:string, value:any}){
  return (<div className="flex items-center justify-between gap-2"><span>{label}</span><span>{value}</span></div>)
}
