import React, { useMemo } from 'react'
import { useStore } from '../../state/store'
import { AnyNode, ConverterNode, Edge, Project } from '../../models'
import { Card, CardContent, CardHeader } from '../ui/card'
import { Tabs, TabsContent, TabsList } from '../ui/tabs'
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceDot } from 'recharts'
import { Button } from '../ui/button'
import { compute, etaFromModel } from '../../calc'
import { fmt, genId } from '../../utils'
import { importJson } from '../../io'

function sanitizeImportedProject(pj: Project): Project {
  let p: Project = JSON.parse(JSON.stringify(pj))
  // Remove sources; replace with a note
  const sources = p.nodes.filter(n=> (n as any).type==='Source')
  if (sources.length>0){
    const note: AnyNode = { id: genId('n_'), type:'Note' as any, name:'Import Notice', text:`${sources.length} Source node(s) removed during import. Use Subsystem Input as upstream.` } as any
    p.nodes = [note, ...p.nodes.filter(n=> (n as any).type!=='Source')]
    const removedIds = new Set(sources.map(s=>s.id))
    p.edges = p.edges.filter(e=>!removedIds.has(e.from) && !removedIds.has(e.to))
  }
  // Ensure exactly one SubsystemInput
  const inputs = p.nodes.filter(n=> (n as any).type==='SubsystemInput')
  if (inputs.length===0){
    const inputNode: AnyNode = { id: genId('n_'), type:'SubsystemInput' as any, name:'Subsystem Input', x:80, y:80 } as any
    p.nodes = [inputNode, ...p.nodes]
  }
  if (inputs.length>1){
    const [keep, ...rest] = inputs
    const restIds = new Set(rest.map(r=>r.id))
    const notice: AnyNode = { id: genId('n_'), type:'Note' as any, name:'Import Notice', text:`Multiple Subsystem Inputs found. Kept one (${keep.name || keep.id}); converted ${rest.length} to notes.` } as any
    const converted: AnyNode[] = rest.map(r=>({ id: genId('n_'), type:'Note' as any, name:'Extra Input', text:`Extra input ${r.name || r.id} removed.` } as any))
    p.nodes = [notice, ...p.nodes.filter(n=> (n as any).type!=='SubsystemInput' || n.id===keep.id), ...converted]
    p.edges = p.edges.filter(e=> !restIds.has(e.from) && !restIds.has(e.to))
  }
  return p
}

export default function SubsystemInspector({ subsystemId, subsystemPath, project, selected, onDeleted }:{ subsystemId:string, subsystemPath?: string[], project: Project, selected:string|null, onDeleted?:()=>void }){
  const nestedUpdateNode = useStore(s=>s.nestedSubsystemUpdateNode)
  const nestedRemoveNode = useStore(s=>s.nestedSubsystemRemoveNode)
  const nestedUpdateEdge = useStore(s=>s.nestedSubsystemUpdateEdge)
  const nestedRemoveEdge = useStore(s=>s.nestedSubsystemRemoveEdge)
  // project import will be applied directly to the selected subsystem node via nestedSubsystemUpdateNode
  const fileRef = React.useRef<HTMLInputElement>(null)

  const edge = useMemo(()=> project.edges.find(e=>e.id===selected) || null, [project.edges, selected])
  const analysis = compute(project)
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
  const curve = (node as any as ConverterNode)?.efficiency
  const isCurve = curve && curve.type === 'curve'
  const maxCurrent = (node as any).Iout_max || 1
  // --- Efficiency curve points: use 'current' for UI, store as {loadPct, eta} ---
  const points = isCurve ? (curve.points || []) : []
  // Read: support both 'current' and 'loadPct' for backward compatibility
  const currentPoints = isCurve
    ? points.map(p => {
        let current = 0;
        if ('current' in p && typeof (p as any).current === 'number') current = (p as any).current
        else if ('loadPct' in p && typeof (p as any).loadPct === 'number') current = (maxCurrent * (p as any).loadPct / 100)
        return { current, eta: (p as any).eta }
      })
    : []
  currentPoints.sort((a, b) => a.current - b.current)
  const graphData = (() => {
    if (!isCurve || currentPoints.length === 0) return []
    const min = 0
    const max = maxCurrent
    const pts = [...currentPoints]
    if (pts[0].current > min) pts.unshift({ current: min, eta: pts[0].eta })
    if (pts[pts.length - 1].current < max) pts.push({ current: max, eta: pts[pts.length - 1].eta })
    return pts
  })()
  // Write: always store as { loadPct, eta }
  function updateCurvePoints(newPoints: { current: number, eta: number }[]) {
    const pts = newPoints.map(p => ({ loadPct: Math.round(100 * p.current / maxCurrent), eta: p.eta }))
    nestedUpdateNode((subsystemPath||[subsystemId]), node!.id, { efficiency: { ...curve, type: 'curve', base: 'Iout_max', points: pts } } as any)
  }
  function handlePointChange(idx: number, field: 'current' | 'eta', value: number) {
    const newPoints = currentPoints.map((p, i) => i === idx ? { ...p, [field]: value } : p)
    updateCurvePoints(newPoints)
  }
  function handleAddPoint() {
    const mid = maxCurrent / 2
    const avgEta = currentPoints.reduce((a, b) => a + b.eta, 0) / (currentPoints.length || 1)
    updateCurvePoints([...currentPoints, { current: mid, eta: avgEta }])
  }
  function handleDeletePoint(idx: number) {
    if (currentPoints.length <= 1) return
    const newPoints = currentPoints.filter((_, i) => i !== idx)
    updateCurvePoints(newPoints)
  }
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
                ...((node!.type !== 'Note') ? [{ value: 'warn', label: 'Node Summary' }] : []),
                ...((!['Subsystem', 'Source', 'SubsystemInput', 'Note'].includes(node!.type)) ? [{ value: 'eta', label: 'Efficiency Curve' }] : [])
              ]}
            />
            <TabsContent value={tab} when="props">
              <div className="space-y-2 text-sm">
                <label className="flex items-center justify-between gap-2"><span>Name</span><input aria-label="name" className="input" value={node.name} onChange={e=>onChange('name', e.target.value)} /></label>
                {node.type==='Source' && <>
                  <Field label="Vout (V)" value={(node as any).Vout} onChange={v=>onChange('Vout', v)} />
                  <ReadOnlyRow label="Total output power (W)" value={fmt(analysis.nodes[node.id]?.P_out ?? 0, 3)} />
                </>}
                {node.type==='Converter' && <>
                  <Field label="Vin_min (V)" value={(node as any).Vin_min} onChange={v=>onChange('Vin_min', v)} />
                  <Field label="Vin_max (V)" value={(node as any).Vin_max} onChange={v=>onChange('Vin_max', v)} />
                  <Field label="Vout (V)" value={(node as any).Vout} onChange={v=>onChange('Vout', v)} />
                  <Field label="Pout_max (W)" value={(node as any).Pout_max||''} onChange={v=>onChange('Pout_max', v)} />
                  <Field label="Iout_max (A)" value={(node as any).Iout_max||''} onChange={v=>onChange('Iout_max', v)} />
                  <label className="flex items-center justify-between gap-2"><span>Efficiency</span>
                    <select
                      className="input"
                      value={(node as any).efficiency?.type || 'fixed'}
                      onChange={e => {
                        const prev = (node as any).efficiency || {};
                        if (e.target.value === 'fixed') {
                          // Save previous curve points in _lastCurve
                          onChange('efficiency', {
                            type: 'fixed',
                            value: typeof prev.value === 'number' ? prev.value : 0.92,
                            _lastCurve: prev.type === 'curve' ? { base: prev.base, points: prev.points } : prev._lastCurve
                          });
                        } else if (e.target.value === 'curve') {
                          // Restore previous curve points if available
                          const lastCurve = prev._lastCurve || (prev.type === 'curve' ? { base: prev.base, points: prev.points } : null);
                          onChange('efficiency', {
                            type: 'curve',
                            base: (lastCurve && lastCurve.base) || prev.base || 'Iout_max',
                            points: (lastCurve && lastCurve.points && lastCurve.points.length > 0)
                              ? lastCurve.points
                              : [{ current: 0, eta: 0.85 }, { current: ((node as any).Iout_max || 1) / 2, eta: 0.92 }, { current: (node as any).Iout_max || 1, eta: 0.9 }]
                          } as any);
                        }
                      }}
                    >
                      <option value="fixed">fixed</option><option value="curve">curve</option>
                    </select>
                  </label>
                  {(node as any).efficiency?.type === 'curve' && (
                    (() => {
                      const eff = (node as any).efficiency;
                      const Iout = (analysis.nodes[node.id]?.I_out) ?? 0;
                      const Pout = (analysis.nodes[node.id]?.P_out) ?? 0;
                      let eta = 0;
                      try {
                        eta = etaFromModel(eff, Pout, Iout, node as any);
                      } catch (e) { eta = 0; }
                      return (
                        <>
                          <div className="text-xs text-slate-600 mt-1">
                            I<sub>out</sub> (computed): <b>{Iout.toFixed(4)} A</b>
                          </div>
                          <div className="text-xs text-slate-600 mt-1">
                            η (at I<sub>out</sub> = {Iout.toFixed(3)} A): <b>{eta.toFixed(4)}</b>
                          </div>
                        </>
                      );
                    })()
                  )}
                  {(node as any).efficiency?.type==='fixed' && <Field label="η value (0-1)" value={(node as any).efficiency.value} onChange={v=>onChange('efficiency',{type:'fixed', value:v})} />}
                  <div className="mt-3 text-xs text-slate-500">Computed</div>
                  <ReadOnlyRow label="Total input power (W)" value={fmt(analysis.nodes[node.id]?.P_in ?? 0, 3)} />
                  <ReadOnlyRow label="Total output power (W)" value={fmt(analysis.nodes[node.id]?.P_out ?? 0, 3)} />
                  <ReadOnlyRow label="Dissipation (W)" value={fmt((analysis.nodes[node.id]?.P_in ?? 0) - (analysis.nodes[node.id]?.P_out ?? 0), 3)} />
                </>}
                {node.type==='Load' && <>
                  <Field label="Vreq (V)" value={(node as any).Vreq} onChange={v=>onChange('Vreq', v)} />
                  <Field label="I_typ (A)" value={(node as any).I_typ} onChange={v=>onChange('I_typ', v)} />
                  <Field label="I_max (A)" value={(node as any).I_max} onChange={v=>onChange('I_max', v)} />
                  <Field label="I_idle (A)" value={(node as any).I_idle} onChange={v=>onChange('I_idle', v)} />
                  <label className="flex items-center justify-between gap-2">
                    <span>Critical Load</span>
                    <input
                      type="checkbox"
                      checked={(node as any).critical !== false}
                      onChange={e=>onChange('critical', e.target.checked)}
                    />
                  </label>
                  <div className="mt-3 text-xs text-slate-500">Computed</div>
                  <ReadOnlyRow label="Total input power (W)" value={fmt(analysis.nodes[node.id]?.P_in ?? 0, 3)} />
                </>}
                {node.type==='Bus' && <Field label="V_bus (V)" value={(node as any).V_bus} onChange={v=>onChange('V_bus', v)} />}
                {node.type==='Note' && <label className="flex items-center justify-between gap-2"><span>Text</span><textarea className="input" value={(node as any).text || ''} onChange={e=>onChange('text', e.target.value)} /></label>}
                {node.type==='Subsystem' && <>
                  <Field label="Number of Paralleled Systems" value={(node as any).numParalleledSystems ?? 1} onChange={v=>onChange('numParalleledSystems', Math.max(1, Math.round(v)))} />
                  <div className="flex items-center justify-between gap-2">
                    <span>Embedded Project: <b>{(node as any).projectFileName || 'None'}</b></span>
                    <>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={async e=>{
                          const file = e.target.files?.[0]
                          if (!file) return
                          const pj = await importJson(file)
                          const sanitized = sanitizeImportedProject(pj)
                          nestedUpdateNode((subsystemPath||[subsystemId]), node.id, { project: sanitized, projectFileName: file.name } as any)
                          e.currentTarget.value = ''
                        }}
                      />
                      <Button variant="outline" size="sm" onClick={()=>fileRef.current?.click()}>Choose File</Button>
                    </>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">Computed (embedded)</div>
                  <ReadOnlyRow label="Vin (V)" value={(() => {
                    const embedded = (node as any).project
                    const input = embedded?.nodes?.find((n:any)=> n.type==='SubsystemInput')
                    const vin = Number(input?.Vout)
                    const fallback = (analysis.nodes[node.id]?.inputV_nom as any) ?? (node as any).inputV_nom
                    return Number.isFinite(vin) && vin>0 ? vin : fallback
                  })()} />
                  <ReadOnlyRow label="Σ Loads (W)" value={fmt(analysis.nodes[node.id]?.P_out ?? 0, 3)} />
                  <ReadOnlyRow label="Σ Sources (W)" value={fmt(analysis.nodes[node.id]?.P_in ?? 0, 3)} />
                  <ReadOnlyRow label="η (%)" value={((analysis.nodes[node.id]?.P_in||0)>0 ? ((analysis.nodes[node.id]?.P_out||0)/(analysis.nodes[node.id]?.P_in||1))*100 : 0).toFixed(2)} />
                  <ReadOnlyRow label="Dissipation (W)" value={fmt(((analysis.nodes[node.id]?.P_in||0) - (analysis.nodes[node.id]?.P_out||0)), 3)} />
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
                      <span className="text-xs text-slate-500 mr-2">Scenario</span>
                      <span className="inline-block text-xs px-2 py-0.5 rounded border bg-slate-50">{project.currentScenario}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-slate-600">Warnings: <b>{(analysis.nodes[node.id]?.warnings || []).length}</b></div>
                      <Button size="sm" variant="outline" onClick={()=>setTab('props')}>Edit Properties</Button>
                    </div>
                  </div>
                  {(() => {
                    const warns = analysis.nodes[node.id]?.warnings || []
                    return warns.length
                      ? <ul className="list-disc pl-5">{warns.map((w:string,i:number)=><li key={i}>{w}</li>)}</ul>
                      : <div className="text-slate-500">No warnings</div>
                  })()}
                  <div className="border-t pt-2">
                    <div className="font-medium mb-1">Context</div>
                    {(() => {
                      const res = analysis.nodes[node.id] as any
                      if (!res) return null
                      if (node.type === 'Converter') {
                        const eff = (node as any).efficiency
                        const eta = (()=>{ try{ return etaFromModel(eff, res.P_out||0, res.I_out||0, node as any) }catch(e){ return 0 } })()
                        return (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
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
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
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
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            {node.type !== 'Load' && <div>P_out: <b>{(res.P_out||0).toFixed(3)} W</b></div>}
                            <div>I_out: <b>{(res.I_out||0).toFixed(3)} A</b></div>
                          </div>
                        )
                      }
                      if (node.type === 'Bus') {
                        return (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div>V_bus: <b>{((node as any).V_bus||0).toFixed(3)} V</b></div>
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                  <div className="border-t pt-2">
                    <div className="font-medium mb-1">Edge impact</div>
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
                            <div className="text-xs">
                              <b>{displayName}</b> — {Rm} mΩ | I {I.toFixed(3)} A | ΔV {Vd.toFixed(4)} V | P_loss {Pl.toFixed(4)} W
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div className="space-y-2">
                          <div>
                            <div className="text-xs text-slate-600 mb-1">Incoming</div>
                            {incoming.length? incoming.map(e=> <Item key={e.id} edgeId={e.id} direction="incoming" />) : <div className="text-xs text-slate-400">None</div>}
                          </div>
                          <div>
                            <div className="text-xs text-slate-600 mb-1">Outgoing</div>
                            {outgoing.length? outgoing.map(e=> <Item key={e.id} edgeId={e.id} direction="outgoing" />) : <div className="text-xs text-slate-400">None</div>}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                  {(() => {
                    const warns = analysis.nodes[node.id]?.warnings || []
                    if (!warns.length) return null
                    const text = warns.join('\n')
                    return (
                      <div className="pt-1">
                        <Button size="sm" variant="outline" onClick={()=>{ try{ navigator.clipboard.writeText(text) }catch(e){} }}>Copy warnings</Button>
                      </div>
                    )
                  })()}
                </div>
              </TabsContent>
            )}
            {(!['Subsystem', 'Source', 'SubsystemInput', 'Note'].includes(node.type)) && (
              <TabsContent value={tab} when="eta">
                {isCurve ? (
                  <div className="mt-4">
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={graphData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="current" unit="A" type="number" domain={[0, maxCurrent]} />
                          <YAxis domain={[0, 1]} />
                          <Tooltip formatter={(v: any, n: string) => n === 'eta' ? (v as number).toFixed(3) : v} />
                          <Line type="monotone" dataKey="eta" dot />
                          {(() => {
                            const eff = (node as any).efficiency
                            const Iout = Math.max(0, Math.min(maxCurrent, (analysis.nodes[node.id]?.I_out) ?? 0))
                            const Pout = (analysis.nodes[node.id]?.P_out) ?? 0
                            let eta = 0
                            try { eta = etaFromModel(eff, Pout, Iout, node as any) } catch (e) { eta = 0 }
                            eta = Math.max(0, Math.min(1, eta))
                            return <ReferenceDot x={Iout} y={eta} r={4} fill="#ef4444" stroke="none" />
                          })()}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4">
                      <div className="flex flex-col gap-2">
                        {currentPoints.map((pt, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <label className="flex items-center gap-1 text-xs">
                              <span>Current (A):</span>
                              <input
                                type="number"
                                className="input w-20"
                                value={pt.current}
                                min={0}
                                max={maxCurrent}
                                step={0.01}
                                onChange={e => handlePointChange(idx, 'current', Math.max(0, Math.min(maxCurrent, Number(e.target.value))))}
                              />
                            </label>
                            <label className="flex items-center gap-1 text-xs">
                              <span>Efficiency:</span>
                              <input
                                type="number"
                                className="input w-16"
                                value={pt.eta}
                                min={0}
                                max={1}
                                step={0.001}
                                onChange={e => handlePointChange(idx, 'eta', Math.max(0, Math.min(1, Number(e.target.value))))}
                              />
                            </label>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeletePoint(idx)}
                              disabled={currentPoints.length <= 1}
                              title={currentPoints.length <= 1 ? 'At least one point required' : 'Delete point'}
                            >
                              Delete
                            </Button>
                          </div>
                        ))}
                        <Button size="sm" variant="default" onClick={handleAddPoint} className="w-fit mt-2">Add Point</Button>
                      </div>
                    </div>
                  </div>
                ) : <div className="text-sm text-slate-500">Switch to curve to edit points.</div>}
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


