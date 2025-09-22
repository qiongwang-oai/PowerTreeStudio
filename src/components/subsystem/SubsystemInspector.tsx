import React, { useMemo } from 'react'
import { useStore } from '../../state/store'
import { DualOutputConverterBranch, DualOutputConverterNode, Edge, Project } from '../../models'
import { Card, CardContent, CardHeader } from '../ui/card'
import { Tabs, TabsContent, TabsList } from '../ui/tabs'
import { Button } from '../ui/button'
import { compute, etaFromModel } from '../../calc'
import { fmt } from '../../utils'
import { download, importProjectFile, serializeProject } from '../../io'
import { sanitizeEmbeddedProject } from '../../utils/embeddedProject'
import EfficiencyEditor from '../EfficiencyEditor'

export default function SubsystemInspector({ subsystemId, subsystemPath, project, selected, onDeleted }:{ subsystemId:string, subsystemPath?: string[], project: Project, selected:string|null, onDeleted?:()=>void }){
  const nestedUpdateNode = useStore(s=>s.nestedSubsystemUpdateNode)
  const nestedRemoveNode = useStore(s=>s.nestedSubsystemRemoveNode)
  const nestedUpdateEdge = useStore(s=>s.nestedSubsystemUpdateEdge)
  const nestedRemoveEdge = useStore(s=>s.nestedSubsystemRemoveEdge)
  const rootScenario = useStore(s=>s.project.currentScenario)
  // project import will be applied directly to the selected subsystem node via nestedSubsystemUpdateNode
  const fileRef = React.useRef<HTMLInputElement>(null)

  const edge = useMemo(()=> project.edges.find(e=>e.id===selected) || null, [project.edges, selected])
  const projectForAnalysis = React.useMemo(()=>{
    const cloned: Project = JSON.parse(JSON.stringify(project))
    cloned.currentScenario = rootScenario as any
    return cloned
  }, [project, rootScenario])
  const analysis = compute(projectForAnalysis)
  const node = useMemo(()=> project.nodes.find(n=>n.id===selected) || null, [project.nodes, selected])
  const [tab, setTab] = React.useState('props')

  if (edge) {
    return (
      <div className="h-full flex flex-col">
        <Card className="flex-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="font-semibold">Edge <span className="text-xs text-slate-500">({edge.id})</span></div>
              <Button variant="outline" size="sm" onClick={()=>{ nestedRemoveEdge((subsystemPath||[subsystemId]), edge.id); onDeleted && onDeleted() }}>Delete</Button>
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
                  onChange={e=> nestedUpdateEdge((subsystemPath||[subsystemId]), edge.id, { interconnect: { ...edge.interconnect, R_milliohm: parseFloat(e.target.value) } })}
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
  const onChange = (field:string, value:any)=>{ const patch:any = {}; patch[field] = value; nestedUpdateNode((subsystemPath||[subsystemId]), node.id, patch) }
  return (
    <div className="h-full flex flex-col">
      <Card className="flex-1">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="font-semibold">{node.name} <span className="text-xs text-slate-500">({node.type})</span></div>
            <Button variant="outline" size="sm" onClick={()=>{ nestedRemoveNode((subsystemPath||[subsystemId]), node.id); onDeleted && onDeleted() }}>Delete</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList
              value={tab}
              onValueChange={setTab}
              items={[
                { value: 'props', label: 'Properties' },
                ...((node!.type !== 'Note') ? [{ value: 'warn', label: 'Node Summary' }] : [])
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
                          nestedUpdateNode((subsystemPath||[subsystemId]), node.id, { project: sanitized, projectFileName: file.name } as any)
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
                      <span className="inline-block text-sm px-2 py-0.5 rounded border bg-slate-50">{rootScenario}</span>
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
                      if (node.type === 'Subsystem' || node.type === 'SubsystemInput' || node.type === 'Source') {
                        // Source nodes are not expected inside embedded, but handle generically
                        return (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            {node.type !== 'Load' && <div>P_out: <b>{(res.P_out||0).toFixed(3)} W</b></div>}
                            <div>I_out: <b>{(res.I_out||0).toFixed(3)} A</b></div>
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
                        const I = (ce as any).I_edge||0
                        const Vd = (ce as any).V_drop||0
                        const Pl = (ce as any).P_loss_edge||0
                        const Rm = (e.interconnect?.R_milliohm ?? 0)
                        const otherNodeId = direction==='incoming' ? e.from : e.to
                        const otherNode = project.nodes.find(n=>n.id===otherNodeId)
                        const displayName = otherNode?.name || otherNodeId
                        return (
                          <div className="flex items-center justify-between gap-2 py-0.5">
                            <div className="text-sm">
                              <b>{displayName}</b> — {Rm} mΩ | I {I.toFixed(3)} A | ΔV {Vd.toFixed(4)} V | P_loss {Pl.toFixed(4)} W
                            </div>
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
