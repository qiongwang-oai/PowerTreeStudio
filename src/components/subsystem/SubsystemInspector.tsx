import React, { useMemo } from 'react'
import { useStore } from '../../state/store'
import { AnyNode, ConverterNode, Edge, Project } from '../../models'
import { Card, CardContent, CardHeader } from '../ui/card'
import { Tabs, TabsContent, TabsList } from '../ui/tabs'
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'
import { Button } from '../ui/button'
import { compute } from '../../calc'
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
  const points = (curve && curve.type==='curve') ? curve.points : []
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
            <TabsList value={tab} onValueChange={setTab} items={[{ value:'props', label:'Properties' }, { value:'warn', label:'Warnings' }, { value:'eta', label:'Efficiency Curve' }]} />
            <TabsContent value={tab} when="props">
              <div className="space-y-2 text-sm">
                <label className="flex items-center justify-between gap-2"><span>Name</span><input aria-label="name" className="input" value={node.name} onChange={e=>onChange('name', e.target.value)} /></label>
                {node.type==='Converter' && <>
                  <Field label="Vin_min (V)" value={(node as any).Vin_min} onChange={v=>onChange('Vin_min', v)} />
                  <Field label="Vin_max (V)" value={(node as any).Vin_max} onChange={v=>onChange('Vin_max', v)} />
                  <Field label="Vout (V)" value={(node as any).Vout} onChange={v=>onChange('Vout', v)} />
                  <Field label="Pout_max (W)" value={(node as any).Pout_max||''} onChange={v=>onChange('Pout_max', v)} />
                  <Field label="Iout_max (A)" value={(node as any).Iout_max||''} onChange={v=>onChange('Iout_max', v)} />
                  <label className="flex items-center justify-between gap-2"><span>Efficiency</span>
                    <select className="input" value={(node as any).efficiency?.type || 'fixed'} onChange={e=>onChange('efficiency',{type:e.target.value, value:0.92, base:'Pout_max', points:[{loadPct:10,eta:0.85},{loadPct:50,eta:0.92},{loadPct:100,eta:0.9}]} as any)}>
                      <option value="fixed">fixed</option><option value="curve">curve</option>
                    </select>
                  </label>
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
            <TabsContent value={tab} when="warn">
              <div className="text-sm">{(node as any).warnings?.length? <ul className="list-disc pl-5">{(node as any).warnings!.map((w:string,i:number)=><li key={i}>{w}</li>)}</ul> : 'No warnings'}</div>
            </TabsContent>
            <TabsContent value={tab} when="eta">
              {curve && curve.type==='curve' ? (
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="loadPct" unit="%" /><YAxis domain={[0,1]} /><Tooltip /><Line type="monotone" dataKey="eta" dot /></LineChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="text-sm text-slate-500">Switch to curve to edit points.</div>}
            </TabsContent>
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


