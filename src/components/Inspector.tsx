import React, { useMemo } from 'react'
import { useStore } from '../state/store'
import { ConverterNode } from '../models'
import { Card, CardContent, CardHeader } from './ui/card'
import { Tabs, TabsContent, TabsList } from './ui/tabs'
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'
import { Button } from './ui/button'

export default function Inspector({selected, onDeleted}:{selected:string|null, onDeleted?:()=>void}){
  const project = useStore(s=>s.project)
  const update = useStore(s=>s.updateNode)
  const removeNode = useStore(s=>s.removeNode)
  const updateEdge = useStore(s=>s.updateEdge as any)
  const removeEdge = useStore(s=>s.removeEdge)
  const edge = useMemo(()=> project.edges.find(e=>e.id===selected) || null, [project.edges, selected])
  const node = useMemo(()=> project.nodes.find(n=>n.id===selected) || null, [project.nodes, selected])
  const [tab, setTab] = React.useState('props')
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
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
  if (!node) return <div className="p-3 text-sm text-slate-500">Select a node or edge to edit properties.</div>
  const onChange = (field:string, value:any)=>{ const patch:any = {}; patch[field] = value; update(node.id, patch) }
  const curve = (node as any as ConverterNode)?.efficiency
  const points = (curve && curve.type==='curve') ? curve.points : []
  return (
    <div className="h-full flex flex-col">
      <Card className="flex-1">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="font-semibold">{node.name} <span className="text-xs text-slate-500">({node.type})</span></div>
            <Button variant="outline" size="sm" onClick={()=>{ removeNode(node.id); onDeleted && onDeleted() }}>Delete</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList value={tab} onValueChange={setTab} items={[{ value:'props', label:'Properties' }, { value:'warn', label:'Warnings' }, { value:'eta', label:'Efficiency Curve' }]} />
            <TabsContent value={tab} when="props">
              <div className="space-y-2 text-sm">
                <label className="flex items-center justify-between gap-2"><span>Name</span><input aria-label="name" className="input" value={node.name} onChange={e=>onChange('name', e.target.value)} /></label>
                {node.type==='Source' && <>
                  <Field label="V_nom (V)" value={(node as any).V_nom} onChange={v=>onChange('V_nom', v)} />
                  <Field label="I_max (A)" value={(node as any).I_max||''} onChange={v=>onChange('I_max', v)} />
                  <Field label="P_max (W)" value={(node as any).P_max||''} onChange={v=>onChange('P_max', v)} />
                </>}
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
                </>}
                {node.type==='Load' && <>
                  <Field label="Vreq (V)" value={(node as any).Vreq} onChange={v=>onChange('Vreq', v)} />
                  <Field label="I_typ (A)" value={(node as any).I_typ} onChange={v=>onChange('I_typ', v)} />
                  <Field label="I_max (A)" value={(node as any).I_max} onChange={v=>onChange('I_max', v)} />
                </>}
                {node.type==='Bus' && <Field label="V_bus (V)" value={(node as any).V_bus} onChange={v=>onChange('V_bus', v)} />}
                {node.type==='Note' && <label className="flex items-center justify-between gap-2"><span>Text</span><textarea className="input" value={(node as any).text || ''} onChange={e=>onChange('text', e.target.value)} /></label>}
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
  return (<label className="flex items-center justify-between gap-2"><span>{label}</span><input className="input" type="number" value={value} onChange={e=>onChange(parseFloat(e.target.value))} /></label>)
}
