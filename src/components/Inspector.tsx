import React, { useMemo } from 'react'
import { useStore } from '../state/store'
import { CanvasMarkup, DualOutputConverterBranch, DualOutputConverterNode, Project } from '../models'
import { Tabs, TabsContent, TabsList } from './ui/tabs'
import { Button } from './ui/button'
import { ArrowDown, ArrowUp, Download, ListRestart, Trash2, Upload } from 'lucide-react'
import { Tooltip } from './ui/tooltip'
import {
  EmptyState,
  FormField,
  FormGrid,
  InlineKeyValue,
  InspectorContent,
  InspectorHeader,
  InspectorSection,
  InspectorShell,
  MetricGrid
} from './ui/inspector'
import { compute, etaFromModel } from '../calc'
import { renderPowerDisplay, formatPowerText } from './inspector/powerFormat'
import { download, importProjectFile, serializeProject } from '../io'
import { sanitizeEmbeddedProject } from '../utils/embeddedProject'
import type { InspectorSelection } from '../types/selection'
import { resolveProjectAtPath } from '../utils/subsystemPath'
import SubsystemInspector from './subsystem/SubsystemInspector'
import EfficiencyEditor from './EfficiencyEditor'
import { orderSubsystemPorts, sanitizeSubsystemHandleOrder } from './SubsystemNodeLayout'

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
  const [tab, setTab] = React.useState('props')
  if (!selection) return <EmptyState title="No item selected" description="Select a node, edge, or markup to inspect its properties." />
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
      <InspectorShell>
        <InspectorHeader title="Multiple items selected" subtitle={`${total} total items`} />
        <InspectorContent>
          <InspectorSection title="Selection Summary">
            <MetricGrid
              items={[
                { label: 'Total Items', value: total },
                { label: 'Nodes', value: selection.nodes.length, hint: listPreview(selection.nodes, resolveNodeLabel) },
                { label: 'Edges', value: selection.edges.length, hint: listPreview(selection.edges, resolveEdgeLabel) },
                { label: 'Markups', value: selection.markups.length, hint: listPreview(selection.markups, resolveMarkupLabel) }
              ]}
            />
            <p className="mt-4 text-sm text-slate-500">
              Copy, delete, or paste to duplicate the selection. Press Esc to clear.
            </p>
          </InspectorSection>
        </InspectorContent>
      </InspectorShell>
    )
  }
  if (selection.kind === 'nested-node' || selection.kind === 'nested-edge') {
    const nestedProject = resolveProjectAtPath(project, selection.subsystemPath)
    if (!nestedProject) {
      return <EmptyState title="Embedded subsystem not found" />
    }
    const subsystemId = selection.subsystemPath[selection.subsystemPath.length - 1]
    const nestedId = selection.kind === 'nested-node' ? selection.nodeId : selection.edgeId
    return (
      <InspectorShell>
        <InspectorHeader
          title="Embedded subsystem"
          subtitle={`Inspecting ${selection.kind === 'nested-node' ? 'node' : 'edge'} within ${subsystemId}`}
        />
        <div className="flex-1 overflow-y-auto">
          <SubsystemInspector
            subsystemId={subsystemId}
            subsystemPath={selection.subsystemPath}
            project={nestedProject}
            selected={nestedId}
            onDeleted={onDeleted}
          />
        </div>
      </InspectorShell>
    )
  }
  if (selection.kind === 'markup') {
    if (!markup) {
      return <EmptyState title="Markup not found" />
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
          <>
            <InspectorSection title="Content">
              <FormField label="Text">
                <textarea
                  className="input min-h-[120px] resize-y"
                  value={markup.text}
                  onChange={e => updateMarkup(markup.id, current => current.type === 'text' ? { ...current, text: e.target.value } : current)}
                />
              </FormField>
            </InspectorSection>
            <InspectorSection title="Appearance">
              <FormGrid columns={2}>
                <FormField label="Font size (px)">
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
                </FormField>
                <FormField label="Color">
                  <ColorInput
                    aria-label="Text color"
                    value={markup.color}
                    onChange={e => updateMarkup(markup.id, current => current.type === 'text' ? { ...current, color: e.target.value } : current)}
                  />
                </FormField>
              </FormGrid>
              <ToggleRow
                label="Bold"
                checked={markup.isBold === true}
                onChange={checked => updateMarkup(markup.id, current => current.type === 'text' ? { ...current, isBold: checked } : current)}
              />
            </InspectorSection>
          </>
        )
      }
      if (markup.type === 'line') {
        return (
          <InspectorSection title="Appearance">
            <FormGrid columns={2}>
              <FormField label="Color">
                <ColorInput
                  aria-label="Line color"
                  value={markup.color}
                  onChange={e => updateMarkup(markup.id, current => current.type === 'line' ? { ...current, color: e.target.value } : current)}
                />
              </FormField>
              <FormField label="Thickness (px)">
                <input
                  className="input"
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={markup.thickness}
                  onChange={e => {
                    const raw = Number(e.target.value)
                    const nextValue = Number.isFinite(raw) ? Math.max(0.5, raw) : markup.thickness
                    updateMarkup(markup.id, current => current.type === 'line' ? { ...current, thickness: nextValue } : current)
                  }}
                />
              </FormField>
            </FormGrid>
            <div className="mt-4 space-y-3">
              <ToggleRow
                label="Dotted"
                checked={markup.isDashed === true}
                onChange={checked => updateMarkup(markup.id, current => current.type === 'line' ? { ...current, isDashed: checked } : current)}
              />
              <ToggleRow
                label="Arrow head"
                checked={markup.arrowHead === 'end'}
                onChange={checked => updateMarkup(markup.id, current => current.type === 'line' ? { ...current, arrowHead: checked ? 'end' : 'none' } : current)}
              />
            </div>
          </InspectorSection>
        )
      }
      if (markup.type === 'rectangle') {
        const hasFill = typeof markup.fillColor === 'string'
        const fillColorValue = hasFill ? markup.fillColor! : '#38bdf8'
        const effectiveOpacity = typeof markup.fillOpacity === 'number' ? Math.min(1, Math.max(0, markup.fillOpacity)) : 0.18
        const isAboveNodes = (markup.zIndex ?? -10) >= 20
        return (
          <>
            <InspectorSection title="Border">
              <FormGrid columns={2}>
                <FormField label="Border color">
                  <ColorInput
                    aria-label="Rectangle border color"
                    value={markup.strokeColor}
                    onChange={e => updateMarkup(markup.id, current => current.type === 'rectangle' ? { ...current, strokeColor: e.target.value } : current)}
                  />
                </FormField>
                <FormField label="Border width (px)">
                  <input
                    className="input"
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={markup.thickness}
                    onChange={e => {
                      const raw = Number(e.target.value)
                      const nextValue = Number.isFinite(raw) ? Math.max(0.5, raw) : markup.thickness
                      updateMarkup(markup.id, current => current.type === 'rectangle' ? { ...current, thickness: nextValue } : current)
                    }}
                  />
                </FormField>
              </FormGrid>
              <div className="mt-4 space-y-3">
                <ToggleRow
                  label="Dotted border"
                  checked={markup.isDashed === true}
                  onChange={checked => updateMarkup(markup.id, current => current.type === 'rectangle' ? { ...current, isDashed: checked } : current)}
                />
                <ToggleRow
                  label="Bring to front"
                  checked={isAboveNodes}
                  onChange={checked => {
                    const nextZ = checked ? 50 : -10
                    updateMarkup(markup.id, current => current.type === 'rectangle' ? { ...current, zIndex: nextZ } : current)
                  }}
                />
              </div>
            </InspectorSection>
            <InspectorSection title="Fill">
              <ToggleRow
                label="Filled"
                checked={hasFill}
                description="Toggle to add a translucent overlay."
                onChange={checked => {
                  updateMarkup(markup.id, current => {
                    if (current.type !== 'rectangle') return current
                    if (!checked) {
                      return { ...current, fillColor: null, fillOpacity: 0 }
                    }
                    return { ...current, fillColor: fillColorValue, fillOpacity: effectiveOpacity || 0.18 }
                  })
                }}
              />
              <FormGrid columns={2}>
                <FormField label="Fill color">
                  <ColorInput
                    aria-label="Rectangle fill color"
                    disabled={!hasFill}
                    className={!hasFill ? 'opacity-50' : undefined}
                    value={fillColorValue}
                    onChange={e => updateMarkup(markup.id, current => current.type === 'rectangle' ? { ...current, fillColor: e.target.value } : current)}
                  />
                </FormField>
                <FormField label="Fill opacity">
                  <div className="flex items-center gap-3">
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
                      className="h-2 w-full cursor-pointer accent-sky-500"
                    />
                    <input
                      className="input w-20"
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
                </FormField>
              </FormGrid>
              <div className="mt-4">
                <FormGrid columns={2}>
                  <FormField label="Corner radius (px)">
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
                  </FormField>
                </FormGrid>
              </div>
            </InspectorSection>
          </>
        )
      }
      return <InspectorSection title="Unsupported markup type">Unsupported markup type.</InspectorSection>
    })()
    return (
      <InspectorShell>
        <InspectorHeader
          title={label}
          subtitle={`Markup ID ${markup.id}`}
          actions={(
            <Button variant="outline" size="icon" aria-label="Delete markup" onClick={onDeleteMarkup}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        />
        <InspectorContent>{renderControls}</InspectorContent>
      </InspectorShell>
    )
  }
  if (edge) {
    return (
      <InspectorShell>
        <InspectorHeader
          title="Edge"
          subtitle={`ID ${edge.id}`}
          actions={(
            <Button variant="outline" size="icon" aria-label="Delete edge" onClick={()=>{ removeEdge(edge.id); onDeleted && onDeleted() }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        />
        <InspectorContent>
          <InspectorSection title="Interconnect">
            <FormField label="Resistance (mΩ)">
              <input
                className="input"
                type="number"
                value={edge.interconnect?.R_milliohm ?? 0}
                onChange={e=> updateEdge && updateEdge(edge.id, { interconnect: { ...edge.interconnect, R_milliohm: parseFloat(e.target.value) } })}
              />
            </FormField>
          </InspectorSection>
          <InspectorSection title="Computed" description="Calculated from current scenario.">
            <MetricGrid items={[{ label: 'Dissipation', value: renderPowerDisplay(analysis.edges[edge.id]?.P_loss_edge) }]} />
          </InspectorSection>
        </InspectorContent>
      </InspectorShell>
    )
  }
  if (!node) return <EmptyState title="Select a node or edge to edit properties." />

  const onChange = (field:string, value:any)=>{ const patch:any = {}; patch[field] = value; update(node.id, patch) }

  const triggerEmbeddedImport = () => {
    if (node.type !== 'Subsystem') return
    fileRef.current?.click()
  }

  const handleEmbeddedFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (node.type !== 'Subsystem') return
    const file = event.target.files?.[0]
    if (!file) return
    const pj = await importProjectFile(file)
    const sanitized = sanitizeEmbeddedProject(pj)
    onChange('project', sanitized as Project)
    onChange('projectFileName', file.name)
    event.currentTarget.value = ''
  }

  const exportEmbeddedProject = () => {
    if (node.type !== 'Subsystem') return
    const embeddedProject = (node as any).project as Project | undefined
    if (!embeddedProject) return
    const fileName = (node as any).projectFileName || (node.name || 'Subsystem')
    const trimmed = String(fileName).trim()
    const base = trimmed ? trimmed.replace(/\s+/g, '_').replace(/\.[^./\\]+$/, '') : 'Subsystem'
    const downloadName = `${base || 'Subsystem'}.yaml`
    download(downloadName, serializeProject(embeddedProject))
  }

  const canExportEmbeddedProject = node.type === 'Subsystem' && !!(node as any).project

  const embeddedFileInput = node.type === 'Subsystem'
    ? (
      <input
        ref={fileRef}
        type="file"
        accept=".json,.yaml,.yml,application/json,text/yaml"
        className="hidden"
        onChange={handleEmbeddedFileChange}
      />
    )
    : null

  const tabItems = [
    { value: 'props', label: 'Properties' },
    ...((node.type !== 'Note') ? [{ value: 'warn', label: 'Node Summary' }] : []),
    ...(node.type === 'Subsystem' ? [{ value: 'embed', label: 'Embedded Tree' }] : [])
  ]

  const renderPropertiesTab = () => {
    const sections: React.ReactNode[] = []
    const identityFields: React.ReactNode[] = [
      <FormField key="name" label="Name">
        <input aria-label="name" className="input" value={node.name} onChange={e=>onChange('name', e.target.value)} />
      </FormField>
    ]
    if (node.type === 'Converter' || node.type === 'DualOutputConverter') {
      identityFields.push(
        <FormField key="controller" label="Controller Part Number">
          <input className="input" value={(node as any).controllerPartNumber || ''} onChange={e=>onChange('controllerPartNumber', e.target.value)} />
        </FormField>,
        <FormField key="powerStage" label="Power Stage Part Number">
          <input className="input" value={(node as any).powerStagePartNumber || ''} onChange={e=>onChange('powerStagePartNumber', e.target.value)} />
        </FormField>
      )
    }
    if (node.type === 'Subsystem') {
      identityFields.push(
        <FormField key="embedded-file" label="Embedded file">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input flex-1"
              value={(node as any).projectFileName || ''}
              placeholder="No file selected"
              readOnly
            />
            <Tooltip label="Import embedded project">
              <Button
                variant="outline"
                size="icon"
                aria-label="Import embedded project"
                onClick={triggerEmbeddedImport}
              >
                <Upload className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip label="Export embedded project">
              <Button
                variant="outline"
                size="icon"
                aria-label="Export embedded project"
                disabled={!canExportEmbeddedProject}
                onClick={exportEmbeddedProject}
              >
                <Download className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        </FormField>
      )
    }
    sections.push(
      <InspectorSection key="identity" title="Identity">
        <div className="space-y-4">
          {identityFields}
        </div>
      </InspectorSection>
    )

    if (node.type === 'Source') {
      sections.push(
        <InspectorSection key="source-electrical" title="Electrical">
          <FormGrid columns={2}>
            <Field label="Vout (V)" value={(node as any).Vout} onChange={v=>onChange('Vout', v)} />
          </FormGrid>
        </InspectorSection>
      )
      sections.push(
        <InspectorSection key="source-computed" title="Computed" description="Calculated for the active scenario.">
          <MetricGrid items={[{ label: 'Total output power', value: renderPowerDisplay(analysis.nodes[node.id]?.P_out) }]} />
        </InspectorSection>
      )
    }

    if (node.type === 'Converter') {
      const converterAnalysis = analysis.nodes[node.id] || {}
      const maxCurrent = (node as any).Iout_max || 1
      sections.push(
        <InspectorSection key="converter-operating" title="Electrical">
          <FormGrid columns={2}>
            <Field label="Vin_min (V)" value={(node as any).Vin_min} onChange={v=>onChange('Vin_min', v)} />
            <Field label="Vin_max (V)" value={(node as any).Vin_max} onChange={v=>onChange('Vin_max', v)} />
            <Field label="Vout (V)" value={(node as any).Vout} onChange={v=>onChange('Vout', v)} />
            <Field label="Pout_max (W)" value={(node as any).Pout_max||''} onChange={v=>onChange('Pout_max', v)} />
            <Field label="Iout_max (A)" value={(node as any).Iout_max||''} onChange={v=>onChange('Iout_max', v)} />
            <Field label="Number of phases" value={(node as any).phaseCount ?? 1} onChange={v=>onChange('phaseCount', Math.max(1, Math.round(v)))} />
          </FormGrid>
        </InspectorSection>
      )
      sections.push(
        <InspectorSection key="converter-efficiency" title="Efficiency model" description="Tune efficiency across the expected load range.">
          <EfficiencyEditor
            label="Efficiency"
            efficiency={(node as any).efficiency}
            maxCurrent={maxCurrent}
            onChange={eff=>onChange('efficiency', eff)}
            analysis={{ P_out: converterAnalysis?.P_out, I_out: converterAnalysis?.I_out }}
            modelNode={node as any}
          />
        </InspectorSection>
      )
      sections.push(
        <InspectorSection key="converter-computed" title="Computed" description="Values derived from the current scenario.">
          <MetricGrid
            items={[
              { label: 'Total input power', value: renderPowerDisplay(converterAnalysis?.P_in) },
              { label: 'Total output power', value: renderPowerDisplay(converterAnalysis?.P_out) },
              { label: 'Dissipation', value: renderPowerDisplay((converterAnalysis?.P_in ?? 0) - (converterAnalysis?.P_out ?? 0)) }
            ]}
          />
        </InspectorSection>
      )
    }

    if (node.type === 'DualOutputConverter') {
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
      sections.push(
        <InspectorSection key="dual-input" title="Input window">
          <FormGrid columns={2}>
            <Field label="Vin_min (V)" value={(dual as any).Vin_min} onChange={v=>onChange('Vin_min', v)} />
            <Field label="Vin_max (V)" value={(dual as any).Vin_max} onChange={v=>onChange('Vin_max', v)} />
          </FormGrid>
        </InspectorSection>
      )
      sections.push(
        <InspectorSection key="dual-outputs" title="Outputs">
          <div className="space-y-4">
            {outputs.map((branch, idx) => {
              const handleId = branch?.id || (idx === 0 ? fallbackHandle : `${fallbackHandle}-${idx}`)
              const metric = metrics[handleId] || {}
              const label = branch?.label || `Output ${String.fromCharCode(65 + idx)}`
              return (
                <div key={handleId} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-700">{label}</div>
                  <FormGrid columns={2}>
                    <Field label="Vout (V)" value={branch?.Vout ?? 0} onChange={v=>updateBranch(idx, { Vout: v })} />
                    <Field label="Pout_max (W)" value={branch?.Pout_max ?? ''} onChange={v=>updateBranch(idx, { Pout_max: v })} />
                    <Field label="Iout_max (A)" value={branch?.Iout_max ?? ''} onChange={v=>updateBranch(idx, { Iout_max: v })} />
                    <Field label="Number of phases" value={branch?.phaseCount ?? 1} onChange={v=>updateBranch(idx, { phaseCount: Math.max(1, Math.round(v)) })} />
                  </FormGrid>
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
          </div>
        </InspectorSection>
      )
      sections.push(
        <InspectorSection key="dual-computed" title="Computed">
          <MetricGrid
            items={[
              { label: 'Total input power', value: renderPowerDisplay(analysisEntry?.P_in) },
              { label: 'Total output power', value: renderPowerDisplay(analysisEntry?.P_out) },
              { label: 'Dissipation', value: renderPowerDisplay((analysisEntry?.P_in ?? 0) - (analysisEntry?.P_out ?? 0)) }
            ]}
          />
        </InspectorSection>
      )
    }

    if (node.type === 'Load') {
      sections.push(
        <InspectorSection key="load-profile" title="Electrical profile">
          <FormGrid columns={2}>
            <Field label="Vreq (V)" value={(node as any).Vreq} onChange={v=>onChange('Vreq', v)} />
            <Field label="I_typ (A)" value={(node as any).I_typ} onChange={v=>onChange('I_typ', v)} />
            <Field label="I_max (A)" value={(node as any).I_max} onChange={v=>onChange('I_max', v)} />
            <Field label="I_idle (A)" value={(node as any).I_idle} onChange={v=>onChange('I_idle', v)} />
            <Field label="Utilization_typ (%)" value={(node as any).Utilization_typ ?? 100} onChange={v=>onChange('Utilization_typ', Math.max(0, Math.min(100, v)))} />
            <Field label="Utilization_max (%)" value={(node as any).Utilization_max ?? 100} onChange={v=>onChange('Utilization_max', Math.max(0, Math.min(100, v)))} />
            <Field label="Number of Paralleled Devices" value={(node as any).numParalleledDevices ?? 1} onChange={v=>onChange('numParalleledDevices', Math.max(1, Math.round(v)))} />
          </FormGrid>
          <div className="mt-4">
            <ToggleRow
              label="Critical load"
              checked={(node as any).critical !== false}
              onChange={checked=>onChange('critical', checked)}
            />
          </div>
        </InspectorSection>
      )
      sections.push(
        <InspectorSection key="load-computed" title="Computed">
          <MetricGrid items={[{ label: 'Total input power', value: renderPowerDisplay(analysis.nodes[node.id]?.P_in) }]} />
        </InspectorSection>
      )
    }

    if (node.type === 'Bus') {
      sections.push(
        <InspectorSection key="bus" title="Bus">
          <FormGrid columns={2}>
            <Field label="V_bus (V)" value={(node as any).V_bus} onChange={v=>onChange('V_bus', v)} />
          </FormGrid>
        </InspectorSection>
      )
    }

    if (node.type === 'Note') {
      sections.push(
        <InspectorSection key="note" title="Content">
          <FormField label="Text">
            <textarea className="input min-h-[120px] resize-y" value={(node as any).text || ''} onChange={e=>onChange('text', e.target.value)} />
          </FormField>
        </InspectorSection>
      )
    }

    if (node.type === 'Subsystem') {
      const embedded = (node as any).project
      const embeddedInputs = embedded?.nodes?.filter((n:any)=> n.type==='SubsystemInput') || []
      const embeddedInputIds = embeddedInputs
        .map((input:any)=> typeof input?.id === 'string' ? input.id : '')
        .filter((id:string)=> id.length > 0)
      const storedOrder = (node as any).inputHandleOrder
      const handleOrder = sanitizeSubsystemHandleOrder(embeddedInputIds, storedOrder)
      const orderedEmbeddedInputs = orderSubsystemPorts(embeddedInputs, handleOrder)
      const pickName = (value: unknown): string | undefined => {
        if (typeof value !== 'string') return undefined
        const trimmed = value.trim()
        return trimmed.length ? trimmed : undefined
      }
      const handleDisplayItems = orderedEmbeddedInputs
        .map((input:any) => {
          const id = typeof input?.id === 'string' ? input.id : ''
          if (!id) return null
          const orderIndex = handleOrder.indexOf(id)
          if (orderIndex === -1) return null
          const baseLabel = pickName(input?.name) ?? pickName(input?.label) ?? `Input ${orderIndex + 1}`
          const voltageValue = Number(input?.Vout)
          const voltageText = Number.isFinite(voltageValue) ? `${voltageValue} V` : null
          const metaParts: string[] = []
          if (voltageText) metaParts.push(voltageText)
          metaParts.push(`ID: ${id}`)
          return {
            id,
            label: baseLabel,
            meta: metaParts.length ? metaParts.join(' • ') : null,
            orderIndex,
          }
        })
        .filter((item): item is { id: string; label: string; meta: string | null; orderIndex: number } => !!item)
        .sort((a, b) => a.orderIndex - b.orderIndex)
      const handleCount = handleDisplayItems.length
      const canManageOrder = handleCount > 1
      const arraysEqualLocal = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, idx) => value === b[idx])
      const moveHandle = (handleId: string, delta: number) => {
        if (!canManageOrder) return
        const currentIndex = handleOrder.indexOf(handleId)
        if (currentIndex === -1) return
        const targetIndex = currentIndex + delta
        if (targetIndex < 0 || targetIndex >= handleOrder.length) return
        const nextOrder = [...handleOrder]
        const [moved] = nextOrder.splice(currentIndex, 1)
        nextOrder.splice(targetIndex, 0, moved)
        if (arraysEqualLocal(handleOrder, nextOrder)) return
        update(node.id, { inputHandleOrder: nextOrder })
      }
      const syncFromEmbeddedLayout = () => {
        if (!canManageOrder) return
        const sortable = embeddedInputs.filter((input:any)=> typeof input?.id === 'string' && input.id.length > 0)
        if (sortable.length <= 1) return
        const handleOrderMap = new Map(handleOrder.map((id, idx) => [id, idx]))
        const defaultOrderMap = new Map<string, number>()
        sortable.forEach((input:any, idx:number)=>{
          if (typeof input?.id === 'string') defaultOrderMap.set(input.id, idx)
        })
        const sorted = [...sortable].sort((a:any, b:any)=>{
          const idA = typeof a?.id === 'string' ? a.id : ''
          const idB = typeof b?.id === 'string' ? b.id : ''
          const yA = Number.isFinite(Number(a?.y)) ? Number(a.y) : null
          const yB = Number.isFinite(Number(b?.y)) ? Number(b.y) : null
          if (yA !== null && yB !== null && yA !== yB) return yA - yB
          if (yA !== null && yB === null) return -1
          if (yA === null && yB !== null) return 1
          const fallbackA = handleOrderMap.has(idA) ? handleOrderMap.get(idA)! : (defaultOrderMap.get(idA) ?? Number.POSITIVE_INFINITY)
          const fallbackB = handleOrderMap.has(idB) ? handleOrderMap.get(idB)! : (defaultOrderMap.get(idB) ?? Number.POSITIVE_INFINITY)
          if (fallbackA !== fallbackB) return fallbackA - fallbackB
          const xA = Number.isFinite(Number(a?.x)) ? Number(a.x) : 0
          const xB = Number.isFinite(Number(b?.x)) ? Number(b.x) : 0
          if (xA !== xB) return xA - xB
          return 0
        })
        const nextOrderRaw = sorted
          .map((input:any)=> typeof input?.id === 'string' ? input.id : '')
          .filter((id:string)=> id.length > 0)
        const sanitizedNextOrder = sanitizeSubsystemHandleOrder(embeddedInputIds, nextOrderRaw)
        if (!sanitizedNextOrder.length || arraysEqualLocal(handleOrder, sanitizedNextOrder)) return
        update(node.id, { inputHandleOrder: sanitizedNextOrder })
      }
      sections.push(
        <InspectorSection key="subsystem-config" title="Configuration">
          <FormGrid columns={2}>
            <Field label="Number of Paralleled Systems" value={(node as any).numParalleledSystems ?? 1} onChange={v=>onChange('numParalleledSystems', Math.max(1, Math.round(v)))} />
          </FormGrid>
        </InspectorSection>
      )
      sections.push(
        <InspectorSection
          key="subsystem-handles"
          title="Input handles"
          description="Arrange how inputs appear on the subsystem node."
        >
          {handleCount ? (
            canManageOrder ? (
              <>
                <div className="space-y-2">
                  {handleDisplayItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-700">{`${idx + 1}. ${item.label}`}</div>
                        {item.meta ? <div className="text-xs text-slate-500">{item.meta}</div> : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={`Move ${item.label} up`}
                          disabled={idx === 0}
                          onClick={()=>moveHandle(item.id, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={`Move ${item.label} down`}
                          disabled={idx === handleDisplayItems.length - 1}
                          onClick={()=>moveHandle(item.id, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button variant="outline" size="sm" onClick={syncFromEmbeddedLayout}>
                    <ListRestart className="mr-2 h-4 w-4" />
                    Sync from embedded layout
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Add at least two subsystem inputs to manage handle order.</p>
            )
          ) : (
            <p className="text-sm text-slate-500">Define subsystem input ports inside the embedded project to expose handles.</p>
          )}
        </InspectorSection>
      )
      const inputValue = (() => {
        if (!embeddedInputs.length) return '—'
        if (embeddedInputs.length === 1) return Number(embeddedInputs[0]?.Vout || 0)
        return embeddedInputs.map((i:any)=>i.Vout).join(', ')
      })()
      const computedNumberClass = 'text-base font-semibold text-slate-900 tabular-nums'
      const renderScalar = (value: React.ReactNode) => (
        <span className={computedNumberClass}>{value}</span>
      )
      const renderEta = () => (
        <span className={computedNumberClass}>
          {((analysis.nodes[node.id]?.P_in||0)>0 ? ((analysis.nodes[node.id]?.P_out||0)/(analysis.nodes[node.id]?.P_in||1))*100 : 0).toFixed(2)}
        </span>
      )
      sections.push(
        <InspectorSection key="subsystem-computed" title="Computed (embedded)" description="Aggregated from the embedded subsystem.">
          <MetricGrid
            items={[
              { label: 'Inputs (V)', value: renderScalar(inputValue) },
              { label: 'Σ Loads', value: renderPowerDisplay(analysis.nodes[node.id]?.P_out, computedNumberClass) },
              { label: 'Σ Sources', value: renderPowerDisplay(analysis.nodes[node.id]?.P_in, computedNumberClass) },
              { label: 'η (%)', value: renderEta() },
              { label: 'Dissipation', value: renderPowerDisplay((analysis.nodes[node.id]?.P_in||0) - (analysis.nodes[node.id]?.P_out||0), computedNumberClass) }
            ]}
          />
        </InspectorSection>
      )
    }

    if (node.type === 'SubsystemInput') {
      sections.push(
        <InspectorSection key="subsystem-input" title="Subsystem input">
          <FormGrid columns={2}>
            <Field label="Vout (V)" value={(node as any).Vout} onChange={v=>onChange('Vout', v)} />
          </FormGrid>
          <p className="mt-3 text-sm text-slate-500">Used as upstream voltage for currents to downstream nodes.</p>
        </InspectorSection>
      )
    }

    return <div className="space-y-6">{sections}</div>
  }

  const renderSummaryTab = () => {
    if (node.type === 'Note') return null
    const warnings = analysis.nodes[node.id]?.warnings || []
    const copyWarnings = () => {
      const text = warnings.join('\n')
      try {
        navigator.clipboard.writeText(text)
      } catch (e) {
        console.warn('Copy warnings failed', e)
      }
    }
    const overview = (
      <InspectorSection key="overview" title="Scenario overview">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium tracking-wide text-slate-600">Scenario</span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600">{project.currentScenario}</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Warnings: <b>{warnings.length}</b></span>
            <Button size="sm" variant="outline" onClick={()=>setTab('props')}>Edit properties</Button>
          </div>
        </div>
      </InspectorSection>
    )
    const warningsSection = (
      <InspectorSection
        key="warnings"
        title="Warnings"
        actions={warnings.length ? <Button size="sm" variant="outline" onClick={copyWarnings}>Copy warnings</Button> : undefined}
      >
        {warnings.length ? (
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
            {warnings.map((w:string,i:number)=>(<li key={i}>{w}</li>))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No warnings</p>
        )}
      </InspectorSection>
    )
    const contextSection = (
      <InspectorSection key="context" title="Context">
        {(() => {
          const res = analysis.nodes[node.id] as any
          if (!res) return null
          if (node.type === 'Converter' || node.type === 'DualOutputConverter') {
            const eff = (node as any).efficiency
            const eta = (()=>{ try{ return etaFromModel(eff, res.P_out||0, res.I_out||0, node as any) }catch(e){ return 0 } })()
            return (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <InlineKeyValue label="P_in" value={renderPowerDisplay(res.P_in)} />
                <InlineKeyValue label="P_out" value={renderPowerDisplay(res.P_out)} />
                <InlineKeyValue label="I_in" value={`${(res.I_in||0).toFixed(3)} A`} />
                <InlineKeyValue label="I_out" value={`${(res.I_out||0).toFixed(3)} A`} />
                <InlineKeyValue label="Loss" value={renderPowerDisplay(res.loss)} />
                <InlineKeyValue label="η (at op)" value={eta.toFixed(4)} />
              </div>
            )
          }
          if (node.type === 'Load') {
            const up = (res.V_upstream ?? (node as any).Vreq) as number
            const allow = (node as any).Vreq * (1 - project.defaultMargins.voltageMarginPct/100)
            return (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <InlineKeyValue label="V_upstream" value={`${(up||0).toFixed(3)} V`} />
                <InlineKeyValue label="Allow ≥" value={`${allow.toFixed(3)} V`} />
                <InlineKeyValue label="P_in" value={renderPowerDisplay(res.P_in)} />
                <InlineKeyValue label="I_in" value={`${(res.I_in||0).toFixed(3)} A`} />
              </div>
            )
          }
          if (node.type === 'Source' || node.type === 'SubsystemInput') {
            return (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <InlineKeyValue label="P_out" value={renderPowerDisplay(res.P_out)} />
                <InlineKeyValue label="I_out" value={`${(res.I_out||0).toFixed(3)} A`} />
              </div>
            )
          }
          if (node.type === 'Subsystem') {
            return (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <InlineKeyValue label="Vin (resolved)" value={`${((res as any).inputV_nom||0).toFixed(3)} V`} />
                <InlineKeyValue label="Paralleled" value={`${((node as any).numParalleledSystems ?? 1)}`} />
                <InlineKeyValue label="P_in" value={renderPowerDisplay(res.P_in)} />
                <InlineKeyValue label="P_out" value={renderPowerDisplay(res.P_out)} />
                <InlineKeyValue label="Loss" value={renderPowerDisplay(res.loss)} />
              </div>
            )
          }
          if (node.type === 'Bus') {
            return (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <InlineKeyValue label="V_bus" value={`${((node as any).V_bus||0).toFixed(3)} V`} />
              </div>
            )
          }
          return null
        })()}
      </InspectorSection>
    )
    const powerSection = (
      <InspectorSection key="power" title="Power integrity check">
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
            const plText = formatPowerText(Pl)
            return (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700" key={edgeId}>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-800">{displayName}</span>
                  <span className="ml-2 text-sm text-slate-500">{Rm} mΩ • I {I.toFixed(3)} A • ΔV {Vd.toFixed(4)} V • P_loss {plText}</span>
                </div>
                {onSelect && <Button size="sm" variant="outline" onClick={()=>onSelect({ kind: 'edge', id: edgeId })}>Select</Button>}
              </div>
            )
          }
          return (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold tracking-wide text-slate-600">Incoming connections</h4>
                <div className="mt-2 space-y-2">
                  {incoming.length ? incoming.map(e=> <Item key={e.id} edgeId={e.id} direction="incoming" />) : <p className="text-sm text-slate-400">None</p>}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold tracking-wide text-slate-600">Outgoing connections</h4>
                <div className="mt-2 space-y-2">
                  {outgoing.length ? outgoing.map(e=> <Item key={e.id} edgeId={e.id} direction="outgoing" />) : <p className="text-sm text-slate-400">None</p>}
                </div>
              </div>
            </div>
          )
        })()}
      </InspectorSection>
    )
    return <div className="space-y-6">{[overview, warningsSection, contextSection, powerSection]}</div>
  }

  const renderEmbeddedTab = () => {
    if (node.type !== 'Subsystem') return null
    const subsystem = node as any
    const color = subsystem.embeddedViewColor || '#e0f2fe'
    const isExpanded = !!expandedSubsystemViews[subsystem.id]
    return (
      <div className="space-y-6">
        <InspectorSection title="Embedded project" description="Manage the linked subsystem file and colors.">
          <div className="space-y-4 text-base text-slate-600">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Embedded project: <span className="font-semibold text-slate-800">{subsystem.projectFileName || 'None'}</span></span>
              <div className="flex flex-wrap items-center gap-2">
                <Tooltip label="Import embedded project">
                  <Button variant="outline" size="sm" onClick={triggerEmbeddedImport}>
                    <Upload className="mr-2 h-4 w-4" />
                    Import
                  </Button>
                </Tooltip>
                <Tooltip label="Export embedded project">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canExportEmbeddedProject}
                    onClick={exportEmbeddedProject}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </Tooltip>
                <Button size="sm" onClick={()=> onOpenSubsystemEditor && onOpenSubsystemEditor(node.id)}>Open Editor</Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ColorInput
                aria-label="Embedded view color"
                value={color}
                onChange={e=>onChange('embeddedViewColor', e.target.value)}
              />
              <span className="text-sm text-slate-500">Overlay uses ~20% opacity.</span>
            </div>
          </div>
        </InspectorSection>
        <InspectorSection title="View options">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span>Drag the container to move all embedded nodes together.</span>
            {isExpanded ? (
              <Button size="sm" variant="outline" onClick={()=>collapseSubsystemView(subsystem.id)}>Hide embedded view</Button>
            ) : (
              <Button size="sm" onClick={()=>expandSubsystemView(subsystem.id)}>Expand embedded view</Button>
            )}
          </div>
          <p className="mt-3 text-sm text-slate-500">Double-click the Subsystem node on canvas to open it in the editor.</p>
        </InspectorSection>
      </div>
    )
  }

  return (
    <InspectorShell>
      {embeddedFileInput}
      <InspectorHeader
        title={node.name || 'Untitled'}
        subtitle={`ID ${node.id}`}
        actions={(
          <Button variant="outline" size="icon" aria-label="Delete node" onClick={()=>{ removeNode(node.id); onDeleted && onDeleted() }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      />
      <InspectorContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList items={tabItems} className="mb-6" />
          <TabsContent value={tab} when="props">
            {renderPropertiesTab()}
          </TabsContent>
          {node.type !== 'Note' && (
            <TabsContent value={tab} when="warn">
              {renderSummaryTab()}
            </TabsContent>
          )}
          {node?.type === 'Subsystem' && (
            <TabsContent value={tab} when="embed">
              {renderEmbeddedTab()}
            </TabsContent>
          )}
        </Tabs>
      </InspectorContent>
    </InspectorShell>
  )
}
function Field({label, value, onChange}:{label:string, value:any, onChange:(v:number)=>void}){
  const displayValue = Number.isFinite(value) ? value : ''
  return (
    <FormField label={label}>
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
    </FormField>
  )
}
function ColorInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="color"
      className={[
        'h-10 w-16 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-100',
        className
      ].filter(Boolean).join(' ')}
      {...props}
    />
  )
}
function ToggleRow({ label, description, checked, onChange }: { label: React.ReactNode; description?: React.ReactNode; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-medium text-slate-700">{label}</span>
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={checked}
          onChange={e=>onChange(e.target.checked)}
        />
      </div>
      {description ? <p className="mt-2 text-sm text-slate-500">{description}</p> : null}
    </div>
  )
}
