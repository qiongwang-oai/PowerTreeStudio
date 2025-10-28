import React, { useMemo } from 'react'
import { useStore } from '../../state/store'
import { DualOutputConverterBranch, DualOutputConverterNode, Edge, Project } from '../../models'
import { Tabs, TabsContent, TabsList } from '../ui/tabs'
import { Button } from '../ui/button'
import { ArrowDown, ArrowUp, Download, ListRestart, Trash2, Upload } from 'lucide-react'
import { Tooltip } from '../ui/tooltip'
import { compute, etaFromModel } from '../../calc'
import { orderSubsystemPorts, sanitizeSubsystemHandleOrder } from '../SubsystemNodeLayout'
import { download, importProjectFile, serializeProject } from '../../io'
import { sanitizeEmbeddedProject } from '../../utils/embeddedProject'
import EfficiencyEditor from '../EfficiencyEditor'
import { renderPowerDisplay, formatPowerText } from '../inspector/powerFormat'
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
} from '../ui/inspector'
import { PartNumberField } from '../inspector/PartNumberField'
import { voltageToEdgeColor } from '../../utils/color'
import {
  clampEdgeStrokeWidth,
  DEFAULT_EDGE_STROKE_WIDTH,
  MAX_EDGE_STROKE_WIDTH,
  MIN_EDGE_STROKE_WIDTH,
  resolveEdgeStrokeColor,
  resolveEdgeStrokeWidth,
} from '../../utils/edgeAppearance'
import { edgeGroupKey } from '../../utils/edgeGroups'

const EDGE_MISMATCH_COLOR = '#ef4444'

const formatThicknessValue = (value: number): string => {
  if (Number.isInteger(value)) return value.toFixed(0)
  const text = value.toFixed(2)
  return text.replace(/0+$/, '').replace(/\.$/, '')
}

const computeEdgeBaseColor = (edge: Edge, project: Project): { color: string; mismatch: boolean } => {
  const parent = project.nodes.find(n => n.id === edge.from) as any
  const child = project.nodes.find(n => n.id === edge.to) as any

  let parentV: number | undefined
  if (parent?.type === 'Source') parentV = parent?.Vout
  else if (parent?.type === 'Converter') parentV = parent?.Vout
  else if (parent?.type === 'DualOutputConverter') {
    const outputs = Array.isArray(parent?.outputs) ? parent.outputs : []
    const fallback = outputs.length > 0 ? outputs[0] : undefined
    const handleId = (edge as any).fromHandle as string | undefined
    const branch = handleId ? outputs.find((b: any) => b?.id === handleId) : undefined
    parentV = (branch || fallback)?.Vout
  }
  else if (parent?.type === 'Bus') parentV = parent?.V_bus
  else if (parent?.type === 'SubsystemInput') parentV = parent?.Vout

  const childRange = (child?.type === 'Converter' || child?.type === 'DualOutputConverter')
    ? { min: child?.Vin_min, max: child?.Vin_max }
    : undefined

  const childDirectVin = child?.type === 'Load'
    ? child?.Vreq
    : child?.type === 'Subsystem'
      ? (() => {
          const portId = (edge as any).toHandle as string | undefined
          if (portId) {
            const port = (child as any)?.project?.nodes?.find((x: any) => x.id === portId)
            return port?.Vout
          }
          const ports = (child as any)?.project?.nodes?.filter((x: any) => x.type === 'SubsystemInput')
          return ports?.length === 1 ? ports[0]?.Vout : undefined
        })()
      : undefined

  const convRangeViolation = (parentV !== undefined && childRange !== undefined)
    ? !(parentV >= childRange.min && parentV <= childRange.max)
    : false
  const eqViolation = (parentV !== undefined && childDirectVin !== undefined)
    ? parentV !== childDirectVin
    : false
  const mismatch = convRangeViolation || eqViolation
  const color = mismatch ? EDGE_MISMATCH_COLOR : voltageToEdgeColor(parentV)
  return { color, mismatch }
}

export default function SubsystemInspector({ subsystemId, subsystemPath, project, selected, onDeleted }:{ subsystemId:string, subsystemPath?: string[], project: Project, selected:string|null, onDeleted?:()=>void }){
  const nestedUpdateNode = useStore(s=>s.nestedSubsystemUpdateNode)
  const nestedRemoveNode = useStore(s=>s.nestedSubsystemRemoveNode)
  const nestedUpdateEdge = useStore(s=>s.nestedSubsystemUpdateEdge)
  const nestedUpdateEdgeGroup = useStore(s=>s.nestedSubsystemUpdateEdges)
  const nestedRemoveEdge = useStore(s=>s.nestedSubsystemRemoveEdge)
  const rootScenario = useStore(s=>s.project.currentScenario)
  const edge = useMemo(()=> project.edges.find(e=>e.id===selected) || null, [project.edges, selected])
  const projectForAnalysis = React.useMemo(()=>{
    const cloned: Project = JSON.parse(JSON.stringify(project))
    cloned.currentScenario = rootScenario as any
    return cloned
  }, [project, rootScenario])
  const analysis = compute(projectForAnalysis)
  const node = useMemo(()=> project.nodes.find(n=>n.id===selected) || null, [project.nodes, selected])
  const [tab, setTab] = React.useState('props')
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const path = subsystemPath || [subsystemId]

  const groupKeyValue = edge ? edgeGroupKey({ from: edge.from, fromHandle: edge.fromHandle }) : null
  const groupedEdges = groupKeyValue ? project.edges.filter(e => edgeGroupKey({ from: e.from, fromHandle: e.fromHandle }) === groupKeyValue) : []
  const edgeGroupIds = groupedEdges.map(e => e.id)
  const applyEdgeGroupPatch = (patch: Partial<Edge>) => {
    if (!edgeGroupIds.length) return
    if (nestedUpdateEdgeGroup) {
      nestedUpdateEdgeGroup(path, edgeGroupIds, patch)
    } else if (nestedUpdateEdge) {
      edgeGroupIds.forEach(id => nestedUpdateEdge(path, id, patch))
    }
  }

  const groupHasColorOverride = groupedEdges.some(item => typeof item.strokeColor === 'string' && item.strokeColor.trim().length > 0)
  const groupHasThicknessOverride = groupedEdges.some(item => item.strokeWidth !== undefined)

  if (edge) {
    const { color: baseColor } = computeEdgeBaseColor(edge, project)
    const effectiveColor = resolveEdgeStrokeColor(edge, baseColor)
    const colorOverrideRaw = typeof edge.strokeColor === 'string' ? edge.strokeColor.trim() : ''
    const hasColorOverride = colorOverrideRaw.length > 0
    const colorInputValue = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorOverrideRaw) ? colorOverrideRaw : '#64748b'
    const effectiveThickness = resolveEdgeStrokeWidth(edge)
    const thicknessInputValue = edge.strokeWidth ?? ''
    const effectiveThicknessText = formatThicknessValue(effectiveThickness)
    return (
      <InspectorShell>
        <InspectorHeader
          title="Edge"
          subtitle={`ID ${edge.id}`}
          actions={(
            <Button variant="outline" size="icon" aria-label="Delete edge" onClick={()=>{ nestedRemoveEdge(path, edge.id); onDeleted && onDeleted() }}>
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
                onChange={e=> nestedUpdateEdge(path, edge.id, { interconnect: { ...edge.interconnect, R_milliohm: parseFloat(e.target.value) } })}
              />
            </FormField>
          </InspectorSection>
          <InspectorSection title="Appearance" description="Overrides apply within this embedded subsystem only.">
            <FormGrid columns={2}>
              <FormField label="Color override">
                <div className="flex items-center gap-3">
                  <ColorInput
                    aria-label="Edge color override"
                    value={colorInputValue}
                    onChange={e => {
                      const next = e.target.value
                      if (colorOverrideRaw === next) return
                      applyEdgeGroupPatch({ strokeColor: next })
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!groupHasColorOverride}
                    onClick={() => applyEdgeGroupPatch({ strokeColor: undefined })}
                  >
                    Reset
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <span className="inline-flex h-4 w-4 rounded border border-slate-300" style={{ background: effectiveColor }} />
                  <span>{groupHasColorOverride ? 'Override active' : 'Using voltage-based color'}</span>
                </div>
                {!groupHasColorOverride && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex h-4 w-4 rounded border border-slate-300" style={{ background: baseColor }} />
                    <span>{baseColor}</span>
                  </div>
                )}
                {hasColorOverride && colorOverrideRaw && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorOverrideRaw) && (
                  <p className="mt-1 text-xs text-amber-600">Custom value: {colorOverrideRaw}</p>
                )}
              </FormField>
              <FormField label="Thickness (px)">
                <div className="flex items-center gap-3">
                  <input
                    className="input"
                    type="number"
                    min={MIN_EDGE_STROKE_WIDTH}
                    max={MAX_EDGE_STROKE_WIDTH}
                    step={0.5}
                    value={thicknessInputValue}
                    placeholder={DEFAULT_EDGE_STROKE_WIDTH.toString()}
                    onChange={e => {
                      const rawValue = e.target.value
                      if (rawValue === '') {
                        applyEdgeGroupPatch({ strokeWidth: undefined })
                        return
                      }
                      const parsed = Number(rawValue)
                      if (!Number.isFinite(parsed)) return
                      const clamped = clampEdgeStrokeWidth(parsed)
                      if (edge.strokeWidth === clamped) return
                      applyEdgeGroupPatch({ strokeWidth: clamped })
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!groupHasThicknessOverride}
                    onClick={() => applyEdgeGroupPatch({ strokeWidth: undefined })}
                  >
                    Reset
                  </Button>
                </div>
                <p className="mt-2 text-xs text-slate-500">Current effective thickness: {effectiveThicknessText} px</p>
              </FormField>
            </FormGrid>
          </InspectorSection>
          <InspectorSection title="Computed" description="Calculated from the active scenario.">
            <MetricGrid items={[{ label: 'Dissipation', value: renderPowerDisplay(analysis.edges[edge.id]?.P_loss_edge) }]} />
          </InspectorSection>
        </InspectorContent>
      </InspectorShell>
    )
  }

  if (!node) return <EmptyState title="Select a node or edge to edit properties." />
  const onChange = (field:string, value:any)=>{ const patch:any = {}; patch[field] = value; nestedUpdateNode(path, node.id, patch) }

  const triggerEmbeddedImport = () => {
    if (node.type !== 'Subsystem') return
    fileInputRef.current?.click()
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
        ref={fileInputRef}
        type="file"
        accept=".json,.yaml,.yml,application/json,text/yaml"
        className="hidden"
        onChange={handleEmbeddedFileChange}
      />
    )
    : null

  const tabItems = [
    { value: 'props', label: 'Properties' },
    ...((node.type !== 'Note') ? [{ value: 'warn', label: 'Node Summary' }] : [])
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
        <FormField key="controller" label="Controller Part Number" htmlFor="embedded-controller-part-number">
          <PartNumberField
            id="embedded-controller-part-number"
            value={(node as any).controllerPartNumber || ''}
            onValueChange={v => onChange('controllerPartNumber', v)}
            datasheetRef={(node as any).controllerDatasheetRef}
            onDatasheetChange={v => onChange('controllerDatasheetRef', v)}
            partLabel="Controller"
          />
        </FormField>,
        <FormField key="powerStage" label="Power Stage Part Number" htmlFor="embedded-power-stage-part-number">
          <PartNumberField
            id="embedded-power-stage-part-number"
            value={(node as any).powerStagePartNumber || ''}
            onValueChange={v => onChange('powerStagePartNumber', v)}
            datasheetRef={(node as any).powerStageDatasheetRef}
            onDatasheetChange={v => onChange('powerStageDatasheetRef', v)}
            partLabel="Power Stage"
          />
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
        <InspectorSection key="source-computed" title="Computed">
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
            efficiency={(node as any).efficiency}
            maxCurrent={maxCurrent}
            onChange={eff=>onChange('efficiency', eff)}
            analysis={{ P_out: converterAnalysis?.P_out, I_out: converterAnalysis?.I_out }}
            modelNode={node as any}
          />
        </InspectorSection>
      )
      sections.push(
        <InspectorSection key="converter-computed" title="Computed">
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
      const busAnalysis = analysis.nodes[node.id] as any
      sections.push(
        <InspectorSection key="bus" title="Efuse/Resistor">
          <FormGrid columns={2}>
            <Field label="V_bus (V)" value={(node as any).V_bus} onChange={v=>onChange('V_bus', v)} />
            <Field label="R (mΩ)" value={(node as any).R_milliohm ?? 0} onChange={v=>onChange('R_milliohm', Math.max(0, v))} />
          </FormGrid>
        </InspectorSection>
      )
      sections.push(
        <InspectorSection key="bus-computed" title="Computed">
          <MetricGrid
            items={[
              { label: 'Input power', value: renderPowerDisplay(busAnalysis?.P_in) },
              { label: 'Output power', value: renderPowerDisplay(busAnalysis?.P_out) },
              { label: 'Dissipation', value: renderPowerDisplay(busAnalysis?.loss) },
            ]}
          />
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
        .map((input:any, index:number) => {
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
        nestedUpdateNode(path, node.id, { inputHandleOrder: nextOrder })
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
        nestedUpdateNode(path, node.id, { inputHandleOrder: sanitizedNextOrder })
      }
      const embeddedInputValue = (() => {
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
          description="Arrange how inputs appear on the subsystem node in the parent canvas."
        >
          {canManageOrder ? (
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
                        disabled={idx === handleCount - 1}
                        onClick={()=>moveHandle(item.id, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncFromEmbeddedLayout}
                >
                  <ListRestart className="mr-2 h-4 w-4" />
                  Sync from embedded layout
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Add at least two subsystem inputs to manage handle order.</p>
          )}
        </InspectorSection>
      )
      sections.push(
        <InspectorSection key="subsystem-embedded" title="Embedded project">
          <EmbeddedProjectControls
            node={node}
            onImport={triggerEmbeddedImport}
            onExport={exportEmbeddedProject}
            canExport={canExportEmbeddedProject}
          />
        </InspectorSection>
      )
      sections.push(
        <InspectorSection key="subsystem-computed" title="Computed (embedded)" description="Aggregated from the embedded subsystem.">
          <MetricGrid
            items={[
              { label: 'Inputs (V)', value: renderScalar(embeddedInputValue) },
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
    const overview = (
      <InspectorSection key="overview" title="Scenario overview">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium tracking-wide text-slate-600">Scenario</span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600">{rootScenario}</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Warnings: <b>{warnings.length}</b></span>
            <Button size="sm" variant="outline" onClick={()=>setTab('props')}>Edit properties</Button>
          </div>
        </div>
      </InspectorSection>
    )
    const warningsSection = (
      <InspectorSection key="warnings" title="Warnings">
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
          if (node.type === 'Subsystem' || node.type === 'SubsystemInput' || node.type === 'Source') {
            return (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <InlineKeyValue label="P_out" value={renderPowerDisplay(res.P_out)} />
                <InlineKeyValue label="I_out" value={`${(res.I_out||0).toFixed(3)} A`} />
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
      <InspectorSection key="power" title="Power integrity">
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
          const renderList = (items: Edge[], direction: 'incoming'|'outgoing') => (
            items.length ? (
              <div className="space-y-1">
                {items.map(e => {
                  const ce = emap[e.id] || {}
                  const otherNodeId = direction === 'incoming' ? e.from : e.to
                  const otherNode = project.nodes.find(n=>n.id===otherNodeId)
                  const displayName = otherNode?.name || otherNodeId
                  const lossText = formatPowerText((ce as any).P_loss_edge)
                  return (
                    <div key={e.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <span className="font-semibold text-slate-800">{displayName}</span>
                      <span className="ml-2 text-xs text-slate-500">{(e.interconnect?.R_milliohm ?? 0)} mΩ • I {(ce as any).I_edge?.toFixed?.(3) ?? '0.000'} A • ΔV {(ce as any).V_drop?.toFixed?.(4) ?? '0.0000'} V • P_loss {lossText}</span>
                    </div>
                  )
                })}
              </div>
            ) : <p className="text-sm text-slate-400">None</p>
          )
          return (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-slate-600">Incoming connections</div>
                <div className="mt-2">{renderList(incoming, 'incoming')}</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-600">Outgoing connections</div>
                <div className="mt-2">{renderList(outgoing, 'outgoing')}</div>
              </div>
            </div>
          )
        })()}
      </InspectorSection>
    )
    return <div className="space-y-6">{[overview, warningsSection, contextSection, powerSection]}</div>
  }

  return (
    <InspectorShell>
      {embeddedFileInput}
      <InspectorHeader
        title={node.name || 'Untitled'}
        subtitle={`ID ${node.id}`}
        actions={(
          <Button variant="outline" size="icon" aria-label="Delete node" onClick={()=>{ nestedRemoveNode(path, node.id); onDeleted && onDeleted() }}>
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

function EmbeddedProjectControls({ node, onImport, onExport, canExport }:{ node:any, onImport:()=>void, onExport:()=>void, canExport:boolean }){
  return (
    <div className="space-y-4 text-sm text-slate-600">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>Embedded project: <span className="font-semibold text-slate-800">{node.projectFileName || 'None'}</span></span>
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip label="Import embedded project">
            <Button variant="outline" size="sm" onClick={onImport}>
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
          </Tooltip>
          <Tooltip label="Export embedded project">
            <Button variant="outline" size="sm" disabled={!canExport} onClick={onExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </Tooltip>
        </div>
      </div>
      <p className="text-sm text-slate-500">Import a project to embed it within this subsystem, or export the current embedded project.</p>
    </div>
  )
}
