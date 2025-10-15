import { AnyNode, ConverterNode, DualOutputConverterNode, EfficiencyModel, Edge, LoadNode, Project, Scenario, SourceNode, SubsystemNode } from './models'
import { clamp } from './utils'

export type ComputeEdge = Edge & { I_edge?: number, V_drop?: number, P_loss_edge?: number, R_total?: number }
export type ComputeNode = AnyNode & { P_out?: number; P_in?: number; P_in_single?: number; I_out?: number; I_in?: number; V_upstream?: number; loss?: number; warnings: string[] }
export type ComputeResult = { nodes: Record<string, ComputeNode>; edges: Record<string, ComputeEdge>; totals: { loadPower: number, sourceInput: number, overallEta: number }; globalWarnings: string[]; order: string[] }
export type DeepAggregates = {
  criticalLoadPower: number
  nonCriticalLoadPower: number
  edgeLoss: number
  converterLoss: number
  totalLoadPower: number
}

export function scenarioCurrent(load: LoadNode, scenario: Scenario): number {
  const countRaw = (load as any).numParalleledDevices
  const count = Math.max(1, Math.round(Number.isFinite(countRaw) ? (countRaw as any as number) : 1))
  if (scenario==='Max'){
    const utilPctRaw = (load as any).Utilization_max
    const utilPct = Number.isFinite(utilPctRaw as any) ? clamp((utilPctRaw as any as number), 0, 100) : 100
    return load.I_max * (utilPct/100) * count
  }
  if (scenario==='Idle') {
    const idle = (load as any).I_idle
    const perDevice = Number.isFinite(idle) && (idle as number)>0 ? (idle as number) : load.I_typ*0.2
    return perDevice * count
  }
  const utilPctRaw = (load as any).Utilization_typ
  const utilPct = Number.isFinite(utilPctRaw as any) ? clamp((utilPctRaw as any as number), 0, 100) : 100
  return load.I_typ * (utilPct/100) * count
}
type EfficiencyNodeMeta = {
  Pout_max?: number
  Iout_max?: number
  phaseCount?: number
}

export function etaFromModel(model: EfficiencyModel, P_out: number, I_out: number, node: EfficiencyNodeMeta): number {
  const phaseCountRaw = (node?.phaseCount ?? 1) as number
  const phaseCount = Number.isFinite(phaseCountRaw) && phaseCountRaw > 0 ? Math.max(1, Math.round(phaseCountRaw)) : 1
  const perPhase = !!(model as any)?.perPhase && phaseCount > 0
  const divisor = perPhase ? phaseCount : 1
  const scaledPout = perPhase ? (P_out / divisor) : P_out
  const scaledIout = perPhase ? (I_out / divisor) : I_out

  if (model.type === 'fixed') return model.value
  if (!Array.isArray(model.points) || model.points.length === 0) return 0.9 // default efficiency if points missing

  const base = model.base
  const rawMax = base === 'Pout_max' ? node?.Pout_max : node?.Iout_max
  const maxBase = Number.isFinite(rawMax) && (rawMax as number) > 0 ? (rawMax as number) / Math.max(divisor, 1) : undefined
  if (!maxBase || maxBase <= 0) {
    return 0.9
  }

  const normalizedPoints = model.points
    .map((p: any) => {
      const eta = typeof p.eta === 'number' ? p.eta : 0
      let pct: number | undefined
      if (typeof p.loadPct === 'number') pct = clamp(p.loadPct, 0, 100)
      else if (typeof p.current === 'number') pct = clamp((p.current / maxBase) * 100, 0, 100)
      return { pct, eta }
    })
    .filter(p => typeof p.pct === 'number')
    .sort((a, b) => (a.pct! - b.pct!))

  if (normalizedPoints.length === 0) {
    return typeof model.points[0]?.eta === 'number' ? model.points[0]!.eta : 0.9
  }

  const fracBase = base === 'Pout_max' ? (scaledPout / maxBase) : (scaledIout / maxBase)
  const pct = clamp(fracBase * 100, 0, 100)
  let prev = normalizedPoints[0]!
  let next = normalizedPoints[normalizedPoints.length - 1]!
  for (let i = 0; i < normalizedPoints.length - 1; i++) {
    const curr = normalizedPoints[i]!
    const following = normalizedPoints[i + 1]!
    if (pct >= curr.pct! && pct <= following.pct!) {
      prev = curr
      next = following
      break
    }
  }
  if (pct <= normalizedPoints[0]!.pct!) {
    prev = normalizedPoints[0]!
    next = normalizedPoints[0]!
  }
  if (pct >= normalizedPoints[normalizedPoints.length - 1]!.pct!) {
    prev = normalizedPoints[normalizedPoints.length - 1]!
    next = normalizedPoints[normalizedPoints.length - 1]!
  }
  const spread = Math.max((next.pct! - prev.pct!), 1e-9)
  const eta = prev.eta + (next.eta - prev.eta) * (pct - prev.pct!) / spread
  return eta
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
      // Only consider edges from the converter's output handle
      const outEdges = (outgoing[conv.id]||[]).filter(e=>{
        const h = (e as any).fromHandle
        return (h === undefined || h === 'output')
      })
      let P_children=0; for (const e of outEdges){ const child=nmap[e.to]; if (child?.P_in) P_children+=child.P_in }
      // Calculate I_out as the sum of outgoing edge currents from the output handle only
      let I_out = 0;
      for (const e of outEdges) {
        if (typeof emap[e.id]?.I_edge === 'number') I_out += emap[e.id].I_edge || 0;
      }
      // Fallback if edge currents are not yet available
      if (I_out === 0) I_out = P_children / Math.max(conv.Vout, 1e-9);
      const eta = etaFromModel(conv.efficiency, P_children, I_out, conv)
      const P_out=P_children; const P_in=P_out/Math.max(eta,1e-9); conv.P_out=P_out; conv.P_in=P_in; conv.I_out=I_out
      const Vin_assumed=(conv.Vin_min+conv.Vin_max)/2; conv.I_in=P_in/Math.max(Vin_assumed,1e-9); conv.loss=P_in-P_out }
    else if (node.type==='DualOutputConverter'){
      const dual = node as any as DualOutputConverterNode & ComputeNode
      const branches = Array.isArray(dual.outputs) ? dual.outputs : []
      const branchIds = new Set((branches || []).map(b => b?.id).filter(Boolean) as string[])
      const fallbackHandle = (branches && branches.length > 0 && branches[0]?.id) ? (branches[0]!.id || 'outputA') : 'outputA'
      const edgesForNode = outgoing[dual.id] || []
      const edgesByHandle: Record<string, typeof edgesForNode> = {}
      for (const e of edgesForNode){
        const rawHandle = (e as any).fromHandle as string | undefined
        const resolved = rawHandle && branchIds.has(rawHandle) ? rawHandle : fallbackHandle
        ;(edgesByHandle[resolved] = edgesByHandle[resolved] || []).push(e)
      }
      const metrics: Record<string, { id: string; label?: string; Vout?: number; I_out: number; P_out: number; P_in: number; eta: number; loss: number }> = {}
      let totalPout = 0
      let totalPin = 0
      let totalIout = 0
      branches.forEach((branch, idx) => {
        const handleId = branch?.id || (idx === 0 ? fallbackHandle : `${fallbackHandle}-${idx}`)
        const branchEdges = edgesByHandle[handleId] || []
        let P_children = 0
        let I_out = 0
        for (const edge of branchEdges){
          const child = nmap[edge.to]
          if (child?.P_in) P_children += child.P_in
          const em = emap[edge.id]
          if (em && typeof em.I_edge === 'number') I_out += em.I_edge || 0
        }
        if (I_out === 0) I_out = P_children / Math.max(branch?.Vout || 0, 1e-9)
        const effModel = branch?.efficiency || { type: 'fixed', value: 0.9 }
        const eta = etaFromModel(effModel, P_children, I_out, branch as any)
        const Pin = P_children / Math.max(eta, 1e-9)
        metrics[handleId] = {
          id: handleId,
          label: branch?.label,
          Vout: branch?.Vout,
          I_out,
          P_out: P_children,
          P_in: Pin,
          eta,
          loss: Pin - P_children,
        }
        totalPout += P_children
        totalPin += Pin
        totalIout += I_out
      })
      dual.P_out = totalPout
      dual.P_in = totalPin
      dual.I_out = totalIout
      dual.loss = (totalPin || 0) - (totalPout || 0)
      ;(dual as any).__outputs = metrics
    }
    else if (node.type==='Bus'){
      // Treat Efuse/Resistor as an inline resistor with no voltage drop (Vin == Vout == V_bus)
      const bus = node as any as ComputeNode
      const outEdges = (outgoing[bus.id]||[]).filter(e=>{
        const h = (e as any).fromHandle
        return (h === undefined || h === 'output')
      })
      let childInputSum = 0
      let edgeLossSum = 0
      let I_out = 0
      for (const e of outEdges){
        const em = emap[e.id]
        if (em && typeof em.I_edge === 'number') I_out += (em.I_edge || 0)
        if (em && typeof em.P_loss_edge === 'number') edgeLossSum += (em.P_loss_edge || 0)
        const child = nmap[e.to]
        if (child){
          if (child.type === 'Subsystem'){
            const toHandle = (e as any).toHandle as string | undefined
            const perPort: Record<string, number> = ((child as any).__portPowerMap_includeEdgeLoss) || {}
            const vals = Object.values(perPort)
            if (toHandle && (toHandle in perPort)) childInputSum += perPort[toHandle] || 0
            else if (vals.length === 1) childInputSum += vals[0] || 0
            else childInputSum += 0
          } else {
            childInputSum += (child.P_in || 0)
          }
        }
      }
      const Vbus = Math.max(((bus as any).V_bus || 0), 1e-9)
      const R_milliohm = Number.isFinite((bus as any).R_milliohm) ? Math.max(0, ((bus as any).R_milliohm as number)) : 0
      const R_ohm = R_milliohm / 1000
      if (I_out === 0) I_out = (childInputSum + edgeLossSum) / Vbus
      const P_out = childInputSum + edgeLossSum
      const P_loss = I_out * I_out * R_ohm
      const P_in = P_out + P_loss
      bus.P_out = P_out
      bus.P_in = P_in
      ;(bus as any).I_out = I_out
      bus.I_in = I_out
      ;(bus as any).loss = P_loss
    }
    else if (node.type==='Subsystem'){
      const sub = node as any as SubsystemNode & ComputeNode
      // Clone embedded project and replace each SubsystemInput with a Source at its own Vout
      let inner: Project
      if (!sub.project || typeof sub.project !== 'object'){
        // Create a minimal empty embedded project and warn
        sub.warnings.push('Subsystem has no embedded project; assuming empty project.')
        inner = {
          id: 'embedded-empty',
          name: 'Embedded',
          units: project.units,
          defaultMargins: project.defaultMargins,
          scenarios: project.scenarios,
          currentScenario: project.currentScenario,
          nodes: [],
          edges: []
        }
      } else {
        inner = JSON.parse(JSON.stringify(sub.project))
        // Sync scenario with parent project to ensure consistent analysis
        inner.currentScenario = project.currentScenario
      }
      const inputPorts = inner.nodes.filter(n=> (n as any).type === 'SubsystemInput') as any[]
      // Replace each SubsystemInput with a Source at that node's own Vout
      const portVoltageMap: Record<string, number> = {}
      inner.nodes = inner.nodes.map(n=>{
        if ((n as any).type === 'SubsystemInput'){
          const fallbackV = Number((sub as any).inputV_nom || 0)
          const rawV = Number((n as any).Vout)
          const V = Number.isFinite(rawV) && rawV>0 ? rawV : fallbackV
          portVoltageMap[n.id] = V
          return { id: n.id, type: 'Source', name: n.name || 'Subsystem Input', Vout: V } as any
        }
        return n as any
      })
      const innerResult = compute(inner)
      const count = Math.max(1, Math.round((sub as any as SubsystemNode).numParalleledSystems || 1))
      // Aggregate per-port power and totals
      const perPortPower_includingInnerEdgeLoss: Record<string, number> = {}
      const perPortPower_excludingInnerEdgeLoss: Record<string, number> = {}
      let PinSingle = 0
      for (const p of inputPorts){
        const nid = p.id
        const srcNode = innerResult.nodes[nid]
        // Include inner edge losses: use computed P_out of the replaced Source
        const pout_at_port = (srcNode?.P_out || 0)
        perPortPower_includingInnerEdgeLoss[nid] = pout_at_port
        PinSingle += pout_at_port
        // Exclude inner edge losses: sum P_in of direct downstream nodes of this port
        let sumChildPin = 0
        for (const ie of inner.edges){
          if ((ie as any).from === nid){
            const childId = (ie as any).to
            const childNode = innerResult.nodes[childId]
            sumChildPin += (childNode?.P_in || 0)
          }
        }
        perPortPower_excludingInnerEdgeLoss[nid] = sumChildPin
      }
      const PoutSingle = innerResult.totals.loadPower
      const Pin = PinSingle * count
      const Pout = PoutSingle * count
      sub.P_in = Pin
      ;(sub as any).P_in_single = PinSingle
      sub.P_out = Pout
      sub.loss = (Pin || 0) - (Pout || 0)
      // Approximate overall input current as sum over ports of (P_port / V_port)
      let I_total = 0
      for (const pid of Object.keys(perPortPower_includingInnerEdgeLoss)){
        const V = Math.max(portVoltageMap[pid] || 0, 1e-9)
        I_total += (perPortPower_includingInnerEdgeLoss[pid] * count) / V
      }
      sub.I_in = I_total
      // Expose per-port details for edge calculations and UI
      ;(sub as any).__portPowerMap_includeEdgeLoss = Object.fromEntries(Object.entries(perPortPower_includingInnerEdgeLoss).map(([k,v])=>[k, v*count]))
      ;(sub as any).__portPowerMap_excludeEdgeLoss = Object.fromEntries(Object.entries(perPortPower_excludingInnerEdgeLoss).map(([k,v])=>[k, v*count]))
      ;(sub as any).__portVoltageMap = portVoltageMap
      // For backward-compat displays, if exactly one port exists, reflect that voltage
      if (inputPorts.length === 1){
        const only = inputPorts[0]
        const onlyV = Number(only?.Vout || 0)
        ;(sub as any).inputV_nom = onlyV
      } else {
        // Multiple inputs: clear single-value display
        ;(sub as any).inputV_nom = undefined as any
      }
    }
    else if (node.type==='Source'){ const src=node as any as SourceNode & ComputeNode
      const outs = outgoing[src.id] || []
      let I = 0; for (const e of outs){ const child=nmap[e.to]; if (child?.I_in) I += child.I_in }
      const P_in=I*src.Vout; src.I_out=I; src.P_out=P_in; src.P_in=P_in; src.I_in=I
      const count=src.count||1
      if (src.redundancy==='N+1'){ const available=(count-1)* (src.P_max || (src.I_max||0)*src.Vout); const required=P_in; if (available<required) src.warnings.push(`Redundancy shortfall: available ${available.toFixed(1)}W < required ${required.toFixed(1)}W`) }
      if (src.P_max && P_in > src.P_max*(1 - defaultMargins.powerPct/100)) src.warnings.push(`Source overpower ${P_in.toFixed(1)}W > ${src.P_max}W`)
      if (src.I_max && I > src.I_max*(1 - defaultMargins.currentPct/100)) src.warnings.push(`Source overcurrent ${I.toFixed(2)}A > ${src.I_max}A`) }
    else if (node.type==='SubsystemInput'){
      const input = node as any as ComputeNode
      const outs = outgoing[input.id] || []
      let I = 0; for (const e of outs){ const child=nmap[e.to]; if (child?.I_in) I += child.I_in }
      const Vout = (input as any).Vout || 0
      const P_in = I * Vout
      // Include direct edge dissipations in P_out when available
      let edgeLossSum = 0
      for (const e of outs){ const em = emap[e.id]; if (em && typeof em.P_loss_edge === 'number') edgeLossSum += (em.P_loss_edge || 0) }
      input.I_out = I
      input.P_out = P_in + edgeLossSum
      input.P_in = P_in
      input.I_in = I
    } }
  for (const e of Object.values(emap)){
    const child=nmap[e.to]; const parent=nmap[e.from]
    const R_total=e.interconnect?.R_milliohm? e.interconnect.R_milliohm/1000 : 0
    let upV: number | undefined
    if (parent?.type==='Source') upV = (parent as any).Vout
    else if (parent?.type==='Converter') upV = (parent as any).Vout
    else if (parent?.type==='DualOutputConverter'){
      const dualParent = parent as any as DualOutputConverterNode
      const branches = Array.isArray(dualParent.outputs) ? dualParent.outputs : []
      const fallback = branches.length > 0 ? branches[0] : undefined
      const handleId = (e as any).fromHandle as string | undefined
      const branch = handleId ? branches.find(b => b?.id === handleId) : undefined
      upV = (branch || fallback)?.Vout
    }
    else if (parent?.type==='Bus') upV = (parent as any).V_bus
    else if (parent?.type==='SubsystemInput') upV = (parent as any).Vout
    let I = 0
    if (child){
      if (child.type==='Converter' || child.type==='DualOutputConverter'){
        I = ((child.P_in || 0) / Math.max((upV ?? 0), 1e-9))
      } else if (child.type==='Subsystem'){
        // Use per-port power if available and targetHandle provided; otherwise try voltage match
        const toHandle = (e as any).toHandle as string | undefined
        const ports: Record<string, number> = ((child as any).__portPowerMap_excludeEdgeLoss) || {}
        const portVs: Record<string, number> = ((child as any).__portVoltageMap) || {}
        let P_for_edge = 0
        if (toHandle && toHandle in ports){
          P_for_edge = ports[toHandle] || 0
        } else if (upV !== undefined){
          // try exact voltage match first, then nearest
          const entries = Object.entries(portVs)
          let bestId: string | null = null
          let bestDiff = Infinity
          for (const [pid, v] of entries){
            const diff = Math.abs((v||0) - (upV||0))
            if (diff < bestDiff){ bestDiff = diff; bestId = pid }
          }
          if (bestId){
            // If single port, always use it; otherwise require closest, even if not exact
            const totalPorts = entries.length
            if (totalPorts === 1) P_for_edge = ports[bestId] || 0
            else if (bestDiff <= 1e-3) P_for_edge = ports[bestId] || 0
            else P_for_edge = ports[bestId] || 0
          }
        }
        I = P_for_edge / Math.max((upV ?? 0), 1e-9)
      } else {
        I = (child.I_in || 0)
      }
    }
    const V_drop=I*R_total; const P_loss=I*I*R_total; e.I_edge=I; e.R_total=R_total; e.V_drop=V_drop; e.P_loss_edge=P_loss
    if (parent && child && 'V_upstream' in child===false){ if (upV!==undefined) (child as any).V_upstream = upV - V_drop }
    // Voltage compatibility warnings between upstream (parent) and downstream (child)
    if (parent && child && upV !== undefined) {
      if (child.type === 'Converter' || child.type === 'DualOutputConverter') {
        const min = (child as any).Vin_min
        const max = (child as any).Vin_max
        if (Number.isFinite(min) && Number.isFinite(max) && (upV < min || upV > max)) {
          (child as any).warnings.push(`Upstream voltage ${upV.toFixed(3)}V outside converter Vin range [${Number(min).toFixed(3)}, ${Number(max).toFixed(3)}]V`)
        }
      } else if (child.type === 'Load') {
        const vreq = (child as any).Vreq
        if (Number.isFinite(vreq) && Math.abs(upV - vreq) > 1e-6) {
          (child as any).warnings.push(`Voltage mismatch: upstream ${upV.toFixed(3)}V != load Vreq ${Number(vreq).toFixed(3)}V`)
        }
      } else if (child.type === 'Bus') {
        const vbus = (child as any).V_bus
        if (Number.isFinite(vbus) && Math.abs(upV - vbus) > 1e-6) {
          (child as any).warnings.push(`Voltage mismatch: upstream ${upV.toFixed(3)}V != bus ${Number(vbus).toFixed(3)}V`)
        }
      } else if (child.type === 'Subsystem') {
        const toHandle = (e as any).toHandle as string | undefined
        const portVs: Record<string, number> = ((child as any).__portVoltageMap) || {}
        let vexpected: number | undefined = undefined
        if (toHandle && (toHandle in portVs)) vexpected = portVs[toHandle]
        if (vexpected === undefined) {
          // fallback: if there's exactly one port, use it, else skip strict check
          const vals = Object.values(portVs)
          if (vals.length === 1) vexpected = vals[0]
        }
        if (vexpected !== undefined && Math.abs(upV - vexpected) > 1e-6) {
          (child as any).warnings.push(`Voltage mismatch: upstream ${upV.toFixed(3)}V != subsystem port ${vexpected.toFixed(3)}V`)
        }
      }
    }
  }
  // Adjust converters bottom-up so parents see updated child numbers
  for (const nodeId of reverseOrder){
    const node = nmap[nodeId]; if (!node) continue
    if (node.type === 'Converter'){
      const conv = node as any as ConverterNode & ComputeNode
      const updatedEta = etaFromModel(conv.efficiency, conv.P_out || 0, conv.I_out || 0, conv)
      conv.P_in = (conv.P_out || 0) / Math.max(updatedEta, 1e-9)
      conv.loss = (conv.P_in || 0) - (conv.P_out || 0)
    } else if (node.type === 'DualOutputConverter'){
      const dual = node as any as DualOutputConverterNode & ComputeNode
      const branches = Array.isArray(dual.outputs) ? dual.outputs : []
      const existing: Record<string, any> = ((dual as any).__outputs) || {}
      const fallbackHandle = (branches && branches.length > 0 && branches[0]?.id) ? (branches[0]!.id || 'outputA') : 'outputA'
      const metrics: Record<string, any> = {}
      let totalPin = 0
      let totalPout = 0
      let totalIout = 0
      branches.forEach((branch, idx) => {
        const handleId = branch?.id || (idx === 0 ? fallbackHandle : `${fallbackHandle}-${idx}`)
        const prev = existing[handleId] || {}
        const P_out = prev.P_out ?? 0
        const I_out = prev.I_out ?? 0
        const effModel = branch?.efficiency || { type: 'fixed', value: 0.9 }
        const eta = etaFromModel(effModel, P_out, I_out, branch as any)
        const P_in = P_out / Math.max(eta, 1e-9)
        metrics[handleId] = {
          id: handleId,
          label: branch?.label,
          Vout: branch?.Vout,
          P_out,
          I_out,
          eta,
          P_in,
          loss: P_in - P_out,
        }
        totalPin += P_in
        totalPout += P_out
        totalIout += I_out
      })
      dual.P_in = totalPin
      dual.P_out = totalPout
      dual.I_out = totalIout
      dual.loss = (totalPin || 0) - (totalPout || 0)
      ;(dual as any).__outputs = metrics
    }
  }
  // Reconcile converters bottom-up using updated child inputs and edge losses
  for (const nodeId of reverseOrder){
    const node = nmap[nodeId]; if (!node) continue
    if (node.type === 'Bus'){
      const bus = node as ComputeNode
      const outEdges = (outgoing[bus.id] || []).filter(e => {
        const h = (e as any).fromHandle
        return h === undefined || h === 'output'
      })
      let childInputSum = 0
      let edgeLossSum = 0
      let I_out = 0
      for (const e of outEdges){
        const em = emap[e.id]
        if (em){
          I_out += em.I_edge || 0
          edgeLossSum += em.P_loss_edge || 0
        }
        const child = nmap[e.to]
        if (child){
          if (child.type === 'Subsystem'){
            const toHandle = (e as any).toHandle as string | undefined
            const perPort: Record<string, number> = ((child as any).__portPowerMap_includeEdgeLoss) || {}
            const vals = Object.values(perPort)
            if (toHandle && (toHandle in perPort)) childInputSum += perPort[toHandle] || 0
            else if (vals.length === 1) childInputSum += vals[0] || 0
            else childInputSum += 0
          } else {
            childInputSum += (child.P_in || 0)
          }
        }
      }
      const Vbus = Math.max(((bus as any).V_bus || 0), 1e-9)
      const R_milliohm = Number.isFinite((bus as any).R_milliohm) ? Math.max(0, ((bus as any).R_milliohm as number)) : 0
      const R_ohm = R_milliohm / 1000
      if (I_out === 0) I_out = (childInputSum + edgeLossSum) / Vbus
      const P_out = childInputSum + edgeLossSum
      const P_loss = I_out * I_out * R_ohm
      const P_in = P_out + P_loss
      bus.P_out = P_out
      bus.P_in = P_in
      ;(bus as any).I_out = I_out
      bus.I_in = I_out
      ;(bus as any).loss = P_loss
    }
    else if (node.type === 'Converter'){
      const conv = node as any as ConverterNode & ComputeNode
      let childInputSum = 0
      let edgeLossSum = 0
      let I_out = 0
      for (const e of Object.values(emap)){
        if (e.from === conv.id){
          const fromH = (e as any).fromHandle
          if (fromH !== undefined && fromH !== 'output') continue
          const child = nmap[e.to]
          // Accumulate edge current from per-edge values for output handle only
          I_out += (e.I_edge || 0)
          edgeLossSum += (e.P_loss_edge || 0)
          if (child){
            if (child.type === 'Subsystem'){
              const toHandle = (e as any).toHandle as string | undefined
              const perPort: Record<string, number> = ((child as any).__portPowerMap_includeEdgeLoss) || {}
              const vals = Object.values(perPort)
              if (toHandle && (toHandle in perPort)) childInputSum += perPort[toHandle] || 0
              else if (vals.length === 1) childInputSum += vals[0] || 0
              else childInputSum += 0 // ambiguous; avoid double counting
            } else {
              childInputSum += (child.P_in || 0)
            }
          }
        }
      }
      const P_out = childInputSum + edgeLossSum
      const eta = etaFromModel(conv.efficiency, P_out, I_out, conv)
      conv.P_out = P_out
      conv.I_out = I_out
      conv.P_in = P_out / Math.max(eta, 1e-9)
      conv.loss = (conv.P_in || 0) - (conv.P_out || 0)
    } else if (node.type === 'DualOutputConverter'){
      const dual = node as any as DualOutputConverterNode & ComputeNode
      const branches = Array.isArray(dual.outputs) ? dual.outputs : []
      const branchIds = new Set((branches || []).map(b => b?.id).filter(Boolean) as string[])
      const fallbackHandle = (branches && branches.length > 0 && branches[0]?.id) ? (branches[0]!.id || 'outputA') : 'outputA'
      const metrics: Record<string, any> = {}
      let totalPout = 0
      let totalPin = 0
      let totalIout = 0
      branches.forEach((branch, idx) => {
        const handleId = branch?.id || (idx === 0 ? fallbackHandle : `${fallbackHandle}-${idx}`)
        let childInputSum = 0
        let edgeLossSum = 0
        let I_out = 0
        for (const e of Object.values(emap)){
          if (e.from !== dual.id) continue
          const fromHRaw = (e as any).fromHandle as string | undefined
          const fromH = fromHRaw && branchIds.has(fromHRaw) ? fromHRaw : fallbackHandle
          if (fromH !== handleId) continue
          const child = nmap[e.to]
          I_out += (e.I_edge || 0)
          edgeLossSum += (e.P_loss_edge || 0)
          if (child){
            if (child.type === 'Subsystem'){
              const toHandle = (e as any).toHandle as string | undefined
              const perPort: Record<string, number> = ((child as any).__portPowerMap_includeEdgeLoss) || {}
              const vals = Object.values(perPort)
              if (toHandle && (toHandle in perPort)) childInputSum += perPort[toHandle] || 0
              else if (vals.length === 1) childInputSum += vals[0] || 0
              else childInputSum += 0
            } else {
              childInputSum += (child.P_in || 0)
            }
          }
        }
        const P_out = childInputSum + edgeLossSum
        const effModel = branch?.efficiency || { type: 'fixed', value: 0.9 }
        const eta = etaFromModel(effModel, P_out, I_out, branch as any)
        const P_in = P_out / Math.max(eta, 1e-9)
        metrics[handleId] = {
          id: handleId,
          label: branch?.label,
          Vout: branch?.Vout,
          P_out,
          I_out,
          eta,
          P_in,
          loss: P_in - P_out,
        }
        totalPout += P_out
        totalPin += P_in
        totalIout += I_out
      })
      dual.P_out = totalPout
      dual.P_in = totalPin
      dual.I_out = totalIout
      dual.loss = (dual.P_in || 0) - (dual.P_out || 0)
      ;(dual as any).__outputs = metrics
    }
  }
  // Recompute edge currents with updated child P_in after reconciliation
  for (const e of Object.values(emap)){
    const child=nmap[e.to]; const parent=nmap[e.from]
    const R_total=e.interconnect?.R_milliohm? e.interconnect.R_milliohm/1000 : 0
    const upV = parent?.type==='Source'? (parent as any).Vout
      : parent?.type==='Converter'? (parent as any).Vout
      : parent?.type==='DualOutputConverter'? (() => {
          const outputs = Array.isArray((parent as any).outputs) ? (parent as any).outputs : []
          const fallback = outputs.length > 0 ? outputs[0] : undefined
          const handleId = (e as any).fromHandle as string | undefined
          const branch = handleId ? outputs.find((b: any) => b?.id === handleId) : undefined
          return (branch || fallback)?.Vout
        })()
      : parent?.type==='Bus'? (parent as any).V_bus
      : parent?.type==='SubsystemInput'? (parent as any).Vout
      : undefined
    let I = 0
    if (child){
      if (child.type==='Converter'){
        I = ((child.P_in || 0) / Math.max((upV ?? 0), 1e-9))
      } else if (child.type==='Subsystem'){
        const toHandle = (e as any).toHandle as string | undefined
        const ports: Record<string, number> = ((child as any).__portPowerMap_excludeEdgeLoss) || {}
        const portVs: Record<string, number> = ((child as any).__portVoltageMap) || {}
        let P_for_edge = 0
        if (toHandle && toHandle in ports){
          P_for_edge = ports[toHandle] || 0
        } else if (upV !== undefined){
          const entries = Object.entries(portVs)
          let bestId: string | null = null
          let bestDiff = Infinity
          for (const [pid, v] of entries){
            const diff = Math.abs((v||0) - (upV||0))
            if (diff < bestDiff){ bestDiff = diff; bestId = pid }
          }
          if (bestId){
            const totalPorts = entries.length
            if (totalPorts === 1) P_for_edge = ports[bestId] || 0
            else P_for_edge = ports[bestId] || 0
          }
        }
        I = P_for_edge / Math.max((upV ?? 0), 1e-9)
      } else {
        I = (child.I_in || 0)
      }
    }
    const V_drop=I*R_total; const P_loss=I*I*R_total; e.I_edge=I; e.R_total=R_total; e.V_drop=V_drop; e.P_loss_edge=P_loss
    if (parent && child && 'V_upstream' in child===false){ if (upV!==undefined) (child as any).V_upstream = upV - V_drop }
  }
  // Recompute converter input current from incoming edges connected to the input handle only
  for (const nodeId of order){
    const node = nmap[nodeId]; if (!node) continue
    if (node.type === 'Converter' || node.type === 'DualOutputConverter' || node.type === 'Bus'){
      const conv = node as any as ComputeNode
      let I_in_sum = 0
      for (const e of Object.values(emap)){
        if (e.to === conv.id){
          const toH = (e as any).toHandle
          if (toH !== undefined && toH !== 'input') continue
          I_in_sum += (e.I_edge || 0)
        }
      }
      conv.I_in = I_in_sum
    }
  }
  const parentsNeedingRefresh = new Set<string>()
  for (const nodeId of order){
    const node = nmap[nodeId]; if (!node) continue
    if (node.type === 'DualOutputConverter'){
      const dual = node as any as DualOutputConverterNode & ComputeNode
      const incomingEdges = Object.values(emap).filter(e => e.to === dual.id)
      let upstreamVoltage: number | undefined
      for (const e of incomingEdges){
        const toHandle = (e as any).toHandle
        if (toHandle !== undefined && toHandle !== 'input') continue
        const parent = nmap[e.from]
        const parentV = parent?.type === 'Source' ? (parent as any).Vout
          : parent?.type === 'Converter' ? (parent as any).Vout
          : parent?.type === 'DualOutputConverter' ? (() => {
              const outputs = Array.isArray((parent as any).outputs) ? (parent as any).outputs : []
              const fallback = outputs.length > 0 ? outputs[0] : undefined
              const handleId = (e as any).fromHandle as string | undefined
              const branch = handleId ? outputs.find((b: any) => b?.id === handleId) : undefined
              return (branch || fallback)?.Vout
            })()
          : parent?.type === 'Bus' ? (parent as any).V_bus
          : parent?.type === 'SubsystemInput' ? (parent as any).Vout
          : undefined
        if (typeof parentV === 'number' && Number.isFinite(parentV)){
          upstreamVoltage = parentV
          break
        }
      }
      if (!(typeof upstreamVoltage === 'number' && Number.isFinite(upstreamVoltage) && Math.abs(upstreamVoltage) > 1e-9)){
        upstreamVoltage = ((dual.Vin_min || 0) + (dual.Vin_max || 0)) / 2
      }
      const currentIn = (dual.P_in || 0) / Math.max(upstreamVoltage || 0, 1e-9)
      dual.I_in = currentIn
      for (const e of incomingEdges){
        const toHandle = (e as any).toHandle
        if (toHandle !== undefined && toHandle !== 'input') continue
        const parent = nmap[e.from]
        let parentV: number | undefined
        if (parent?.type === 'Source') parentV = (parent as any).Vout
        else if (parent?.type === 'Converter') parentV = (parent as any).Vout
        else if (parent?.type === 'DualOutputConverter'){
          const outputs = Array.isArray((parent as any).outputs) ? (parent as any).outputs : []
          const fallback = outputs.length > 0 ? outputs[0] : undefined
          const handleId = (e as any).fromHandle as string | undefined
          const branch = handleId ? outputs.find((b: any) => b?.id === handleId) : undefined
          parentV = (branch || fallback)?.Vout
        }
        else if (parent?.type === 'Bus') parentV = (parent as any).V_bus
        else if (parent?.type === 'SubsystemInput') parentV = (parent as any).Vout
        const R_total = e.interconnect?.R_milliohm ? e.interconnect.R_milliohm / 1000 : 0
        const V_drop = currentIn * R_total
        e.I_edge = currentIn
        e.R_total = R_total
        e.V_drop = V_drop
        e.P_loss_edge = currentIn * currentIn * R_total
        if (typeof parentV === 'number' && Number.isFinite(parentV)) {
          ;(dual as any).V_upstream = parentV - V_drop
        }
        parentsNeedingRefresh.add(e.from)
      }
    }
  }
  for (const pid of parentsNeedingRefresh){
    const parent = nmap[pid]
    if (!parent) continue
    if (parent.type === 'Source'){
      const outs = outgoing[parent.id] || []
      let I = 0
      for (const edge of outs){
        const em = emap[edge.id]
        if (!em) continue
        const fromH = (edge as any).fromHandle
        if (fromH !== undefined && fromH !== 'output') continue
        if (typeof em.I_edge === 'number') I += em.I_edge || 0
      }
      const V = (parent as any).Vout || 0
      parent.I_out = I
      parent.I_in = I
      parent.P_out = I * V
      parent.P_in = parent.P_out
    } else if (parent.type === 'SubsystemInput'){
      const outs = outgoing[parent.id] || []
      let I = 0
      let edgeLoss = 0
      for (const edge of outs){
        const em = emap[edge.id]
        if (!em) continue
        if (typeof em.I_edge === 'number') I += em.I_edge || 0
        if (typeof em.P_loss_edge === 'number') edgeLoss += em.P_loss_edge || 0
      }
      const V = (parent as any).Vout || 0
      const P_in = I * V
      parent.I_out = I
      parent.P_out = P_in + edgeLoss
      parent.P_in = P_in
      parent.I_in = I
    }
  }
  // Ensure edges into Bus carry the sum of outgoing currents of that Bus
  for (const e of Object.values(emap)){
    const child = nmap[e.to]
    if (child && child.type === 'Bus'){
      const I = ((child as any).I_out || 0)
      const R_total = e.interconnect?.R_milliohm? e.interconnect.R_milliohm/1000 : 0
      const V_drop = I * R_total
      const P_loss = I * I * R_total
      e.I_edge = I
      e.R_total = R_total
      e.V_drop = V_drop
      e.P_loss_edge = P_loss
      const parent=nmap[e.from]
      const upV = parent?.type==='Source'? (parent as any).Vout
        : parent?.type==='Converter'? (parent as any).Vout
        : parent?.type==='Bus'? (parent as any).V_bus
        : parent?.type==='SubsystemInput'? (parent as any).Vout
        : undefined
      if (parent && child && 'V_upstream' in child===false){ if (upV!==undefined) (child as any).V_upstream = upV - V_drop }
    }
  }
  // Finalize converter metrics using the latest edge currents
  for (const nodeId of order){
    const node = nmap[nodeId]; if (!node) continue
    if (node.type === 'Converter'){
      const conv = node as any as ConverterNode & ComputeNode
      const outEdges = (outgoing[conv.id] || []).filter(edge => {
        const fromH = (edge as any).fromHandle
        return fromH === undefined || fromH === 'output'
      })
      let I_out_sum = 0
      let edgeLossSum = 0
      let childInputSum = 0
      for (const edge of outEdges){
        const em = emap[edge.id]
        if (em){
          I_out_sum += em.I_edge || 0
          edgeLossSum += em.P_loss_edge || 0
        }
        const child = nmap[edge.to]
        if (child){
          if (child.type === 'Subsystem'){
            const toHandle = (edge as any).toHandle as string | undefined
            const perPort: Record<string, number> = ((child as any).__portPowerMap_includeEdgeLoss) || {}
            const vals = Object.values(perPort)
            if (toHandle && (toHandle in perPort)) childInputSum += perPort[toHandle] || 0
            else if (vals.length === 1) childInputSum += vals[0] || 0
          } else {
            childInputSum += (child.P_in || 0)
          }
        }
      }
      const P_out = childInputSum + edgeLossSum
      const eta = etaFromModel(conv.efficiency, P_out, I_out_sum, conv)
      const P_in = P_out / Math.max(eta, 1e-9)
      conv.I_out = I_out_sum
      conv.P_out = P_out
      conv.P_in = P_in
      conv.loss = P_in - P_out
    } else if (node.type === 'DualOutputConverter'){
      const dual = node as any as DualOutputConverterNode & ComputeNode
      const branches = Array.isArray(dual.outputs) ? dual.outputs : []
      const edgesForNode = outgoing[dual.id] || []
      const branchIds = new Set((branches || []).map(b => b?.id).filter(Boolean) as string[])
      const fallbackHandle = (branches && branches.length > 0 && branches[0]?.id) ? (branches[0]!.id || 'outputA') : 'outputA'
      const edgesByHandle: Record<string, ComputeEdge[]> = {}
      edgesForNode.forEach(edge => {
        const rawHandle = (edge as any).fromHandle as string | undefined
        const resolved = rawHandle && branchIds.has(rawHandle) ? rawHandle : fallbackHandle
        ;(edgesByHandle[resolved] = edgesByHandle[resolved] || []).push(edge)
      })
      let totalPin = 0
      let totalPout = 0
      let totalIout = 0
      const metrics: Record<string, any> = {}
      branches.forEach((branch, idx) => {
        const handleId = branch?.id || (idx === 0 ? fallbackHandle : `${fallbackHandle}-${idx}`)
        const branchEdges = edgesByHandle[handleId] || []
        let childInputSum = 0
        let edgeLossSum = 0
        let I_out = 0
        for (const edge of branchEdges){
          const em = emap[edge.id]
          if (em){
            I_out += em.I_edge || 0
            edgeLossSum += em.P_loss_edge || 0
          }
          const child = nmap[edge.to]
          if (child){
            if (child.type === 'Subsystem'){
              const toHandle = (edge as any).toHandle as string | undefined
              const perPort: Record<string, number> = ((child as any).__portPowerMap_includeEdgeLoss) || {}
              const vals = Object.values(perPort)
              if (toHandle && (toHandle in perPort)) childInputSum += perPort[toHandle] || 0
              else if (vals.length === 1) childInputSum += vals[0] || 0
            } else {
              childInputSum += (child.P_in || 0)
            }
          }
        }
        const P_out = childInputSum + edgeLossSum
        const effModel = branch?.efficiency || { type: 'fixed', value: 0.9 }
        const eta = etaFromModel(effModel, P_out, I_out, branch as any)
        const P_in = P_out / Math.max(eta, 1e-9)
        metrics[handleId] = {
          id: handleId,
          label: branch?.label,
          Vout: branch?.Vout,
          I_out,
          P_out,
          P_in,
          eta,
          loss: P_in - P_out,
        }
        totalPin += P_in
        totalPout += P_out
        totalIout += I_out
      })
      dual.P_out = totalPout
      dual.P_in = totalPin
      dual.I_out = totalIout
      dual.loss = totalPin - totalPout
      ;(dual as any).__outputs = metrics
    } else if (node.type === 'Bus'){
      const bus = node as any as ComputeNode
      const outEdges = (outgoing[bus.id] || []).filter(edge => {
        const fromH = (edge as any).fromHandle
        return fromH === undefined || fromH === 'output'
      })
      let I_out_sum = 0
      for (const edge of outEdges){
        const em = emap[edge.id]
        if (em) I_out_sum += em.I_edge || 0
      }
      bus.I_out = I_out_sum
      bus.I_in = I_out_sum
    }
  }
  // Apply converter limit warnings using finalized values
  for (const nodeId of order){
    const node = nmap[nodeId]; if (!node) continue
    if (node.type === 'Converter'){
      const conv = node as any as ConverterNode & ComputeNode
      const I_out = conv.I_out || 0
      const P_out = conv.P_out || 0
      if (conv.Iout_max && I_out > (conv.Iout_max as any as number) * (1 - defaultMargins.currentPct/100)){
        conv.warnings.push(`I_out ${I_out.toFixed(3)}A exceeds limit ${conv.Iout_max}A (incl. margin).`)
      }
      if (conv.Pout_max && P_out > (conv.Pout_max as any as number) * (1 - defaultMargins.powerPct/100)){
        conv.warnings.push(`P_out ${P_out.toFixed(2)}W exceeds limit ${conv.Pout_max}W (incl. margin).`)
      }
    } else if (node.type === 'DualOutputConverter'){
      const dual = node as any as DualOutputConverterNode & ComputeNode
      const branches = Array.isArray(dual.outputs) ? dual.outputs : []
      const metrics: Record<string, any> = ((dual as any).__outputs) || {}
      const fallbackHandle = (branches && branches.length > 0 && branches[0]?.id) ? (branches[0]!.id || 'outputA') : 'outputA'
      branches.forEach((branch, idx) => {
        const handleId = branch?.id || (idx === 0 ? fallbackHandle : `${fallbackHandle}-${idx}`)
        const metric = metrics[handleId] || {}
        const label = branch?.label || `Output ${String.fromCharCode(65 + idx)}`
        const I_out = metric.I_out || 0
        const P_out = metric.P_out || 0
        if (branch?.Iout_max && I_out > (branch.Iout_max as number) * (1 - defaultMargins.currentPct/100)){
          dual.warnings.push(`${label}: I_out ${I_out.toFixed(3)}A exceeds limit ${branch.Iout_max}A (incl. margin).`)
        }
        if (branch?.Pout_max && P_out > (branch.Pout_max as number) * (1 - defaultMargins.powerPct/100)){
          dual.warnings.push(`${label}: P_out ${P_out.toFixed(2)}W exceeds limit ${branch.Pout_max}W (incl. margin).`)
        }
      })
    }
  }
  // Update Source-like totals after converters are reconciled
  for (const nodeId of order){
    const node = nmap[nodeId]; if (!node) continue
    if (node.type === 'Source' || node.type === 'SubsystemInput'){
      // Upstream voltage at the source-like node itself
      const upV = (node as any).Vout || 0
      let I_sum = 0
      let P_out_sum = 0
      for (const e of Object.values(emap)){
        if (e.from !== node.id) continue
        const child = nmap[e.to]
        const edgeLoss = (e.P_loss_edge || 0)
        I_sum += (e.I_edge || 0)
        let P_edge = 0
        if (child && child.type === 'Subsystem'){
          // Use per-port power for the specific edge handle
          const toHandle = (e as any).toHandle as string | undefined
          const perPort: Record<string, number> = ((child as any).__portPowerMap_includeEdgeLoss) || {}
          const portVs: Record<string, number> = ((child as any).__portVoltageMap) || {}
          if (toHandle && (toHandle in perPort)){
            P_edge = (perPort[toHandle] || 0) + edgeLoss
          } else {
            // Fallback: choose best matching port by voltage (or only port if single)
            const entries = Object.entries(portVs)
            if (entries.length === 1){
              const [pid] = entries[0]
              P_edge = (perPort[pid] || 0) + edgeLoss
            } else if (entries.length > 1){
              let bestId: string | null = null
              let bestDiff = Infinity
              for (const [pid, v] of entries){
                const diff = Math.abs((v||0) - upV)
                if (diff < bestDiff){ bestDiff = diff; bestId = pid }
              }
              if (bestId) P_edge = (perPort[bestId] || 0) + edgeLoss
            }
          }
        } else if (child) {
          // Non-subsystem child: attribute entire child input to this edge
          P_edge = (child.P_in || 0) + edgeLoss
        } else {
          // No child found; fall back to electrical calculation
          P_edge = ((e.I_edge || 0) * upV) + edgeLoss
        }
        P_out_sum += P_edge
      }
      ;(node as any).I_out = I_sum
      ;(node as any).I_in = I_sum
      ;(node as any).P_out = P_out_sum
      ;(node as any).P_in = P_out_sum
    }
  }
  for (const node of Object.values(nmap)){ if (node.type==='Load'){ const load=node as any; const up=(load.V_upstream ?? load.Vreq); const allow=load.Vreq*(1 - project.defaultMargins.voltageMarginPct/100); if (up<allow) (node as any).warnings.push(`Voltage margin shortfall at load: upstream ${up.toFixed(3)}V < allowed ${allow.toFixed(3)}V`) } }
  const totalLoadLoads = Object.values(nmap)
    .filter(n=>n.type==='Load')
    .reduce((a,n)=> a + (((n as any).critical !== false ? (n.P_out||0) : 0)), 0)
  const totalLoadSubsystems = Object.values(nmap)
    .filter(n=>n.type==='Subsystem')
    .reduce((a,n)=> a + (n.P_out || 0), 0)
  const totalLoad = totalLoadLoads + totalLoadSubsystems
  const totalSource = Object.values(nmap)
    .filter(n=> n.type==='Source' || n.type==='SubsystemInput')
    .reduce((a,n)=> a + (n.P_in || 0), 0)
  const overallEta = totalSource>0? totalLoad/totalSource : 0
  return { nodes:nmap, edges:emap, totals:{ loadPower: totalLoad, sourceInput: totalSource, overallEta }, globalWarnings:[], order }
}

/**
 * Compute deep aggregates across the entire project hierarchy, including all nested subsystems.
 * Returns split critical/non-critical load power, total edge losses, converter losses, and total load power.
 */
export function computeDeepAggregates(project: Project): DeepAggregates {
  const cloneProject = (p: Project): Project => JSON.parse(JSON.stringify(p))

  const walk = (p: Project): DeepAggregates => {
    // Ensure scenario alignment is preserved down the tree
    const aligned: Project = { ...cloneProject(p), currentScenario: p.currentScenario }
    const res = compute(aligned)

    let criticalLoadPower = 0
    let nonCriticalLoadPower = 0
    let edgeLoss = 0
    let converterLoss = 0

    // Current level contributions
    for (const node of Object.values(res.nodes)){
      if (node.type === 'Load'){
        const isNonCritical = (node as any).critical === false
        const pout = node.P_out || 0
        if (isNonCritical) nonCriticalLoadPower += pout
        else criticalLoadPower += pout
      } else if (node.type === 'Converter' || node.type === 'DualOutputConverter' || node.type === 'Bus'){
        converterLoss += (node.loss || 0)
      }
    }
    for (const e of Object.values(res.edges)) edgeLoss += (e.P_loss_edge || 0)

    // Recurse into subsystems present at this level to collect deep contributions
    for (const n of p.nodes as AnyNode[]) {
      if ((n as any).type === 'Subsystem' && (n as any).project) {
        const sub = n as unknown as SubsystemNode
        const inner: Project = cloneProject(sub.project)
        inner.currentScenario = p.currentScenario
        const innerAgg = walk(inner)
        const systemCount = Math.max(1, Math.round(((sub as any).numParalleledSystems || 1) as number))
        criticalLoadPower += innerAgg.criticalLoadPower * systemCount
        nonCriticalLoadPower += innerAgg.nonCriticalLoadPower * systemCount
        edgeLoss += innerAgg.edgeLoss * systemCount
        converterLoss += innerAgg.converterLoss * systemCount
      }
    }

    const totalLoadPower = criticalLoadPower + nonCriticalLoadPower
    return { criticalLoadPower, nonCriticalLoadPower, edgeLoss, converterLoss, totalLoadPower }
  }

  return walk(project)
}
