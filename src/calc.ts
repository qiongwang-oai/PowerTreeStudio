import { AnyNode, ConverterNode, EfficiencyModel, Edge, LoadNode, Project, Scenario, SourceNode } from './models'
import { clamp } from './utils'

export type ComputeEdge = Edge & { I_edge?: number, V_drop?: number, P_loss_edge?: number, R_total?: number }
export type ComputeNode = AnyNode & { P_out?: number; P_in?: number; I_out?: number; I_in?: number; V_upstream?: number; loss?: number; warnings: string[] }
export type ComputeResult = { nodes: Record<string, ComputeNode>; edges: Record<string, ComputeEdge>; totals: { loadPower: number, sourceInput: number, overallEta: number }; globalWarnings: string[]; order: string[] }

export function scenarioCurrent(load: LoadNode, scenario: Scenario): number { if (scenario==='Max') return load.I_max; if (scenario==='Idle') return load.I_typ*0.2; return load.I_typ }
function etaFromModel(model: EfficiencyModel, P_out: number, I_out: number, node: ConverterNode): number {
  if (model.type==='fixed') return model.value
  const points = [...model.points].sort((a,b)=>a.loadPct-b.loadPct)
  const base = model.base
  const maxBase = base==='Pout_max'? node.Pout_max : node.Iout_max
  if (!maxBase) return 0.9
  const frac = base==='Pout_max'? (P_out/ maxBase) : (I_out/ maxBase)
  const pct = clamp(frac*100, 0, 100)
  let prev = points[0], next = points[points.length-1]
  for (let i=0;i<points.length-1;i++){ if (pct>=points[i].loadPct && pct<=points[i+1].loadPct){ prev=points[i]; next=points[i+1]; break } }
  if (pct<=points[0].loadPct){ prev=points[0]; next=points[0] }
  if (pct>=points[points.length-1].loadPct){ prev=points[points.length-1]; next=points[points.length-1] }
  const t = prev===next? 0 : (pct-prev.loadPct)/(next.loadPct-prev.loadPct)
  return clamp(prev.eta + t*(next.eta - prev.eta), 0.01, 0.999)
}
export function detectCycle(nodes: AnyNode[], edges: Edge[]): {hasCycle:boolean, order:string[]} {
  const adj: Record<string, string[]> = {}; const indeg: Record<string, number> = {}
  nodes.forEach(n=>{ adj[n.id]=[]; indeg[n.id]=0 })
  edges.forEach(e=>{ adj[e.from].push(e.to); indeg[e.to]=(indeg[e.to]||0)+1 })
  const q: string[] = Object.keys(indeg).filter(k=>indeg[k]===0); const order: string[] = []; let idx=0
  while (idx<q.length){ const u=q[idx++]; order.push(u); for (const v of adj[u]){ indeg[v]--; if (indeg[v]===0) q.push(v) } }
  return { hasCycle: order.length !== nodes.length, order }
}
export function compute(project: Project): ComputeResult {
  const { nodes, edges, currentScenario, defaultMargins } = project
  const nmap: Record<string, ComputeNode> = {}; const emap: Record<string, ComputeEdge> = {}
  nodes.forEach(n=> nmap[n.id] = { ...n, warnings: [] } as ComputeNode)
  edges.forEach(e=> emap[e.id] = { ...e })
  const { hasCycle, order } = detectCycle(nodes, edges)
  const globalWarnings: string[] = []
  if (hasCycle) return { nodes:nmap, edges:emap, totals:{loadPower:0, sourceInput:0, overallEta:0}, globalWarnings:['Cycle detected: computation blocked.'], order }
  const outgoing: Record<string, ComputeEdge[]> = {}
  Object.values(emap).forEach(e=>{ (outgoing[e.from]=outgoing[e.from]||[]).push(e) })
  const reverseOrder = [...order].reverse()
  for (const nodeId of reverseOrder){
    const node = nmap[nodeId]; if (!node) continue
    if (node.type==='Load'){ const load = node as any as LoadNode & ComputeNode; const I=scenarioCurrent(load, currentScenario)
      const P_out=load.Vreq*I; load.P_out=P_out; load.P_in=P_out; load.I_out=I; load.I_in=I }
    else if (node.type==='Converter'){ const conv=node as any as ConverterNode & ComputeNode
      let P_children=0; for (const e of (outgoing[conv.id]||[])){ const child=nmap[e.to]; if (child?.P_in) P_children+=child.P_in }
      const I_out = P_children / Math.max(conv.Vout, 1e-9)
      const eta = etaFromModel(conv.efficiency, P_children, I_out, conv)
      const P_out=P_children; const P_in=P_out/Math.max(eta,1e-9); conv.P_out=P_out; conv.P_in=P_in; conv.I_out=I_out
      const Vin_assumed=(conv.Vin_min+conv.Vin_max)/2; conv.I_in=P_in/Math.max(Vin_assumed,1e-9); conv.loss=P_in-P_out
      if (conv.Iout_max && I_out > conv.Iout_max*(1 - defaultMargins.currentPct/100)) conv.warnings.push(`I_out ${I_out.toFixed(3)}A exceeds limit ${conv.Iout_max}A (incl. margin).`)
      if (conv.Pout_max && P_out > conv.Pout_max*(1 - defaultMargins.powerPct/100)) conv.warnings.push(`P_out ${P_out.toFixed(2)}W exceeds limit ${conv.Pout_max}W (incl. margin).`) }
    else if (node.type==='Source'){ const src=node as any as SourceNode & ComputeNode
      const outs = outgoing[src.id] || []
      let I = 0; for (const e of outs){ const child=nmap[e.to]; if (child?.I_in) I += child.I_in }
      const P_in=I*src.V_nom; src.I_out=I; src.P_out=P_in; src.P_in=P_in; src.I_in=I
      const count=src.count||1
      if (src.redundancy==='N+1'){ const available=(count-1)* (src.P_max || (src.I_max||0)*src.V_nom); const required=P_in; if (available<required) src.warnings.push(`Redundancy shortfall: available ${available.toFixed(1)}W < required ${required.toFixed(1)}W`) }
      if (src.P_max && P_in > src.P_max*(1 - defaultMargins.powerPct/100)) src.warnings.push(`Source overpower ${P_in.toFixed(1)}W > ${src.P_max}W`)
      if (src.I_max && I > src.I_max*(1 - defaultMargins.currentPct/100)) src.warnings.push(`Source overcurrent ${I.toFixed(2)}A > ${src.I_max}A`) } }
  for (const e of Object.values(emap)){ const child=nmap[e.to]; const parent=nmap[e.from]; const I=child?.I_in||0
    const R_total=e.interconnect?.R_milliohm? e.interconnect.R_milliohm/1000 : 0
    const V_drop=I*R_total; const P_loss=I*I*R_total; e.I_edge=I; e.R_total=R_total; e.V_drop=V_drop; e.P_loss_edge=P_loss
    if (parent && child && 'V_upstream' in child===false){ const upV = parent.type==='Source'? (parent as any).V_nom : parent.type==='Converter'? (parent as any).Vout : parent.type==='Bus'? (parent as any).V_bus : undefined; if (upV!==undefined) (child as any).V_upstream = upV - V_drop } }
  for (const node of Object.values(nmap)){ if (node.type==='Load'){ const load=node as any; const up=(load.V_upstream ?? load.Vreq); const allow=load.Vreq*(1 - project.defaultMargins.voltageMarginPct/100); if (up<allow) (node as any).warnings.push(`Voltage margin shortfall at load: upstream ${up.toFixed(3)}V < allowed ${allow.toFixed(3)}V`) } }
  const totalLoad = Object.values(nmap).filter(n=>n.type==='Load').reduce((a,n)=>a+(n.P_out||0),0)
  const totalSource = Object.values(nmap).filter(n=>n.type==='Source').reduce((a,n)=>a+(n.P_in||0),0)
  const overallEta = totalSource>0? totalLoad/totalSource : 0
  return { nodes:nmap, edges:emap, totals:{ loadPower: totalLoad, sourceInput: totalSource, overallEta }, globalWarnings:[], order }
}
