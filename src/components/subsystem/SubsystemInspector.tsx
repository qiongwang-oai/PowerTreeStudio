import React, { useMemo } from 'react'
import { useStore } from '../../state/store'
import { DualOutputConverterBranch, DualOutputConverterNode, Edge, Project } from '../../models'
import { Tabs, TabsContent, TabsList } from '../ui/tabs'
import { Button } from '../ui/button'
import { Trash2 } from 'lucide-react'
import { compute, etaFromModel } from '../../calc'
import { fmt } from '../../utils'
import { download, importProjectFile, serializeProject } from '../../io'
import { sanitizeEmbeddedProject } from '../../utils/embeddedProject'
import EfficiencyEditor from '../EfficiencyEditor'
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

export default function SubsystemInspector({ subsystemId, subsystemPath, project, selected, onDeleted }:{ subsystemId:string, subsystemPath?: string[], project: Project, selected:string|null, onDeleted?:()=>void }){
  const nestedUpdateNode = useStore(s=>s.nestedSubsystemUpdateNode)
  const nestedRemoveNode = useStore(s=>s.nestedSubsystemRemoveNode)
  const nestedUpdateEdge = useStore(s=>s.nestedSubsystemUpdateEdge)
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
  const path = subsystemPath || [subsystemId]

  if (edge) {
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
          <InspectorSection title="Computed" description="Calculated from the active scenario.">
            <MetricGrid items={[{ label: 'Dissipation (W)', value: fmt(analysis.edges[edge.id]?.P_loss_edge ?? 0, 4) }]} />
          </InspectorSection>
        </InspectorContent>
      </InspectorShell>
    )
  }

  if (!node) return <EmptyState title="Select a node or edge to edit properties." />
  const onChange = (field:string, value:any)=>{ const patch:any = {}; patch[field] = value; nestedUpdateNode(path, node.id, patch) }

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
        <FormField key="controller" label="Controller Part Number">
          <input className="input" value={(node as any).controllerPartNumber || ''} onChange={e=>onChange('controllerPartNumber', e.target.value)} />
        </FormField>,
        <FormField key="powerStage" label="Power Stage Part Number">
          <input className="input" value={(node as any).powerStagePartNumber || ''} onChange={e=>onChange('powerStagePartNumber', e.target.value)} />
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
          <MetricGrid items={[{ label: 'Total output power (W)', value: fmt(analysis.nodes[node.id]?.P_out ?? 0, 3) }]} />
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
              { label: 'Total input power (W)', value: fmt(converterAnalysis?.P_in ?? 0, 3) },
              { label: 'Total output power (W)', value: fmt(converterAnalysis?.P_out ?? 0, 3) },
              { label: 'Dissipation (W)', value: fmt((converterAnalysis?.P_in ?? 0) - (converterAnalysis?.P_out ?? 0), 3) }
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
              { label: 'Total input power (W)', value: fmt(analysisEntry?.P_in ?? 0, 3) },
              { label: 'Total output power (W)', value: fmt(analysisEntry?.P_out ?? 0, 3) },
              { label: 'Dissipation (W)', value: fmt((analysisEntry?.P_in ?? 0) - (analysisEntry?.P_out ?? 0), 3) }
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
          <MetricGrid items={[{ label: 'Total input power (W)', value: fmt(analysis.nodes[node.id]?.P_in ?? 0, 3) }]} />
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
      const embeddedInputValue = (() => {
        if (!embeddedInputs.length) return '—'
        if (embeddedInputs.length === 1) return Number(embeddedInputs[0]?.Vout || 0)
        return embeddedInputs.map((i:any)=>i.Vout).join(', ')
      })()
      sections.push(
        <InspectorSection key="subsystem-config" title="Configuration">
          <FormGrid columns={2}>
            <Field label="Number of Paralleled Systems" value={(node as any).numParalleledSystems ?? 1} onChange={v=>onChange('numParalleledSystems', Math.max(1, Math.round(v)))} />
          </FormGrid>
        </InspectorSection>
      )
      sections.push(
        <InspectorSection key="subsystem-embedded" title="Embedded project">
          <EmbeddedProjectControls node={node} onChange={onChange} />
        </InspectorSection>
      )
      sections.push(
        <InspectorSection key="subsystem-computed" title="Computed (embedded)" description="Aggregated from the embedded subsystem.">
          <MetricGrid
            items={[
              { label: 'Inputs (V)', value: embeddedInputValue },
              { label: 'Σ Loads (W)', value: fmt(analysis.nodes[node.id]?.P_out ?? 0, 3) },
              { label: 'Σ Sources (W)', value: fmt(analysis.nodes[node.id]?.P_in ?? 0, 3) },
              { label: 'η (%)', value: ((analysis.nodes[node.id]?.P_in||0)>0 ? ((analysis.nodes[node.id]?.P_out||0)/(analysis.nodes[node.id]?.P_in||1))*100 : 0).toFixed(2) },
              { label: 'Dissipation (W)', value: fmt(((analysis.nodes[node.id]?.P_in||0) - (analysis.nodes[node.id]?.P_out||0)), 3) }
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
                <InlineKeyValue label="P_in" value={`${(res.P_in||0).toFixed(3)} W`} />
                <InlineKeyValue label="P_out" value={`${(res.P_out||0).toFixed(3)} W`} />
                <InlineKeyValue label="I_in" value={`${(res.I_in||0).toFixed(3)} A`} />
                <InlineKeyValue label="I_out" value={`${(res.I_out||0).toFixed(3)} A`} />
                <InlineKeyValue label="Loss" value={`${(res.loss||0).toFixed(3)} W`} />
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
                <InlineKeyValue label="P_in" value={`${(res.P_in||0).toFixed(3)} W`} />
                <InlineKeyValue label="I_in" value={`${(res.I_in||0).toFixed(3)} A`} />
              </div>
            )
          }
          if (node.type === 'Subsystem' || node.type === 'SubsystemInput' || node.type === 'Source') {
            return (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <InlineKeyValue label="P_out" value={`${(res.P_out||0).toFixed(3)} W`} />
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
                  return (
                    <div key={e.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <span className="font-semibold text-slate-800">{displayName}</span>
                      <span className="ml-2 text-xs text-slate-500">{(e.interconnect?.R_milliohm ?? 0)} mΩ • I {(ce as any).I_edge?.toFixed?.(3) ?? '0.000'} A • ΔV {(ce as any).V_drop?.toFixed?.(4) ?? '0.0000'} V • P_loss {(ce as any).P_loss_edge?.toFixed?.(4) ?? '0.0000'} W</span>
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

function EmbeddedProjectControls({ node, onChange }:{ node:any, onChange:(field:string,value:any)=>void }){
  const fileRef = React.useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-4 text-sm text-slate-600">
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>Embedded project: <span className="font-semibold text-slate-800">{node.projectFileName || 'None'}</span></span>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={()=>fileRef.current?.click()}>Import</Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!node.project}
            onClick={()=>{
              const embeddedProject = node.project as Project | undefined
              if (!embeddedProject) return
              const fileName = node.projectFileName || (node.name || 'Subsystem')
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
      <p className="text-sm text-slate-500">Import a project to embed it within this subsystem, or export the current embedded project.</p>
    </div>
  )
}
