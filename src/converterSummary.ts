import { ComputeResult, compute, ComputeEdge, ComputeNode } from './calc'
import { AnyNode, BusNode, ConverterNode, DualOutputConverterNode, Project, SubsystemNode } from './models'
import { clamp } from './utils'

export type ConverterSummaryBranch = {
  id: string
  label: string
  vout?: number
  iout: number
  pin: number
  pout: number
  loss: number
  efficiency: number
  phaseCount?: number
  lossPerPhase?: number
  edgeLoss: number
}

export type ConverterSummaryEntry = {
  id: string
  key: string
  name: string
  nodeType: 'Converter' | 'DualOutputConverter' | 'Efuse/Resistor'
  topology?: ConverterNode['topology'] | DualOutputConverterNode['topology']
  vinMin?: number
  vinMax?: number
  vout?: number
  vouts?: Array<{ label: string; value?: number }>
  iout: number
  pin: number
  pout: number
  loss: number
  efficiency: number
  locationPath: string[]
  location: string
  phaseCount?: number
  lossPerPhase?: number
  edgeLoss: number
  outputs?: ConverterSummaryBranch[]
}

type ProjectContext = {
  id: string
  nodes: Record<string, ComputeNode>
  adjacency: Map<string, ComputeEdge[]>
}

type SubsystemInfo = ProjectContext & {
  count: number
  portIds: Set<string>
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = typeof value === 'string' ? Number(value) : undefined
  return Number.isFinite(parsed) ? parsed : undefined
}

function safePower(value: unknown): number {
  const num = toNumber(value)
  return Number.isFinite(num) ? (num as number) : 0
}

function safeCurrent(value: unknown): number {
  const num = toNumber(value)
  return Number.isFinite(num) ? (num as number) : 0
}

function resolvePhaseCount(raw: unknown): number {
  const num = Number(raw)
  if (!Number.isFinite(num) || num <= 0) return 1
  return Math.max(1, Math.round(num))
}

function resolveDualHandleId(branches: DualOutputConverterNode['outputs'], idx: number, branch: DualOutputConverterNode['outputs'][number]): string {
  const fallback = (Array.isArray(branches) && branches.length > 0 && branches[0]?.id)
    ? (branches[0]!.id || 'outputA')
    : 'outputA'
  if (branch?.id) return branch.id
  return idx === 0 ? fallback : `${fallback}-${idx}`
}

function buildAdjacency(edges: Record<string, ComputeEdge>): Map<string, ComputeEdge[]> {
  const adjacency = new Map<string, ComputeEdge[]>()
  for (const edge of Object.values(edges)) {
    if (!edge) continue
    const list = adjacency.get(edge.from)
    if (list) list.push(edge)
    else adjacency.set(edge.from, [edge])
  }
  return adjacency
}

function sumSubsystemEdgeLoss(
  info: SubsystemInfo,
  handle: string | undefined,
  multiplier: number,
  visited: Set<string>,
  getSubsystemInfo: (id: string) => SubsystemInfo | undefined
): number {
  const effectiveMultiplier = multiplier * Math.max(1, info.count)
  const portIds: string[] = []
  if (handle) {
    if (info.portIds.has(handle)) portIds.push(handle)
    else if (info.portIds.size === 1) portIds.push(Array.from(info.portIds)[0])
    else portIds.push(...info.portIds)
  } else {
    portIds.push(...info.portIds)
  }
  if (portIds.length === 0) return 0
  let total = 0
  for (const portId of portIds) {
    const portEdges = info.adjacency.get(portId) || []
    for (const edge of portEdges) total += sumEdgeLoss(edge, effectiveMultiplier, info, visited, getSubsystemInfo)
  }
  return total
}

function sumEdgeLoss(
  edge: ComputeEdge,
  multiplier: number,
  context: ProjectContext,
  visited: Set<string>,
  getSubsystemInfo: (id: string) => SubsystemInfo | undefined
): number {
  const edgeKey = `${context.id}:${edge.id}`
  if (visited.has(edgeKey)) return 0
  visited.add(edgeKey)
  let total = safePower(edge.P_loss_edge) * multiplier
  const child = context.nodes[edge.to] as ComputeNode | undefined
  if (!child) return total
  const childType = (child as AnyNode).type
  if (childType === 'Bus' || childType === 'SubsystemInput' || childType === 'Note') {
    const nextEdges = context.adjacency.get(child.id) || []
    for (const nextEdge of nextEdges) total += sumEdgeLoss(nextEdge, multiplier, context, visited, getSubsystemInfo)
  } else if (childType === 'Subsystem') {
    const subInfo = getSubsystemInfo(child.id)
    if (subInfo) {
      const handle = (edge as any).toHandle as string | undefined
      total += sumSubsystemEdgeLoss(subInfo, handle, multiplier, visited, getSubsystemInfo)
    }
  }
  return total
}

export function buildConverterSummary(project: Project, result?: ComputeResult): ConverterSummaryEntry[] {
  const res: ComputeResult = result ?? compute(project)
  const entries: ConverterSummaryEntry[] = []
  const subsystemCache = new Map<string, SubsystemInfo>()
  const getSubsystemInfo = (id: string) => subsystemCache.get(id)
  const visit = (proj: Project, projResult: ComputeResult, pathNames: string[], pathIds: string[], multiplier: number) => {
    const adjacency = buildAdjacency(projResult.edges)
    const projectContext: ProjectContext = { id: proj.id, nodes: projResult.nodes, adjacency }
    const nodeList = proj.nodes as AnyNode[]
    for (const rawNode of nodeList) {
      if (rawNode.type === 'Subsystem') {
        const sub = rawNode as SubsystemNode
        const countRaw = (sub.numParalleledSystems ?? 1)
        const count = Math.max(1, Math.round(Number.isFinite(countRaw as any) ? (countRaw as number) : 1))
        if (!sub.project || typeof sub.project !== 'object') continue
        const inner: Project = JSON.parse(JSON.stringify(sub.project))
        inner.currentScenario = proj.currentScenario
        const portIds = new Set((inner.nodes || []).filter(n=> (n as any).type === 'SubsystemInput').map((n:any)=>n.id))
        inner.nodes = inner.nodes.map(n=>{
          if ((n as any).type === 'SubsystemInput'){
            const fallbackV = Number((sub as any).inputV_nom || 0)
            const rawV = Number((n as any).Vout)
            const V = Number.isFinite(rawV) && rawV>0 ? rawV : fallbackV
            return { id: n.id, type: 'Source', name: n.name || 'Subsystem Input', Vout: V } as any
          }
          return n as any
        })
        const innerResult = compute(inner)
        const innerAdjacency = buildAdjacency(innerResult.edges)
        subsystemCache.set(sub.id, {
          id: sub.id,
          nodes: innerResult.nodes,
          adjacency: innerAdjacency,
          count,
          portIds,
        })
        const nextNames = [...pathNames, sub.name || 'Subsystem']
        const nextIds = [...pathIds, sub.id]
        visit(inner, innerResult, nextNames, nextIds, multiplier)
      }
    }
    for (const rawNode of nodeList) {
      if (rawNode.type === 'Converter') {
        const node = rawNode as ConverterNode
        const computed = projResult.nodes[node.id] || {}
        const basePin = safePower((computed as any).P_in)
        const basePout = safePower((computed as any).P_out)
        const lossRaw = toNumber((computed as any).loss)
        const baseLoss = Number.isFinite(lossRaw) ? (lossRaw as number) : (basePin - basePout)
        const baseIout = safeCurrent((computed as any).I_out)
        const phaseCount = resolvePhaseCount((node as any).phaseCount)
        const pin = basePin * multiplier
        const pout = basePout * multiplier
        const loss = baseLoss * multiplier
        const iout = baseIout * multiplier
        const lossPerPhase = phaseCount > 1 ? loss / phaseCount : undefined
        const efficiency = pin > 0 ? clamp(pout / pin, 0, 1) : 0
        const location = pathNames.length ? pathNames.join(' / ') : 'System'
        const key = [...pathIds, node.id].join('>') || node.id
        const outgoingEdges = adjacency.get(node.id) || []
        const visitedEdges = new Set<string>()
        let downstreamLoss = 0
        for (const edge of outgoingEdges) downstreamLoss += sumEdgeLoss(edge, multiplier, projectContext, visitedEdges, getSubsystemInfo)
        entries.push({
          id: node.id,
          key,
          name: node.name || 'Converter',
          nodeType: 'Converter',
          topology: node.topology,
          vinMin: toNumber(node.Vin_min),
          vinMax: toNumber(node.Vin_max),
          vout: toNumber(node.Vout),
          iout,
          pin,
          pout,
          loss,
          efficiency,
          phaseCount,
          lossPerPhase,
          edgeLoss: downstreamLoss,
          locationPath: [...pathNames],
          location,
        })
      } else if (rawNode.type === 'DualOutputConverter') {
        const node = rawNode as DualOutputConverterNode
        const computed = projResult.nodes[node.id] || {}
      
        const basePin = safePower((computed as any).P_in)
        const basePout = safePower((computed as any).P_out)
        const lossRaw = toNumber((computed as any).loss)
        const baseLoss = Number.isFinite(lossRaw) ? (lossRaw as number) : (basePin - basePout)
        const baseIout = safeCurrent((computed as any).I_out)
        const nodePhaseCount = resolvePhaseCount((node as any).phaseCount)
        const pin = basePin * multiplier
        const pout = basePout * multiplier
        const loss = baseLoss * multiplier
        const iout = baseIout * multiplier
        const lossPerPhase = nodePhaseCount > 1 ? loss / nodePhaseCount : undefined
        const efficiency = pin > 0 ? clamp(pout / pin, 0, 1) : 0
        const branches = Array.isArray(node.outputs) ? node.outputs : []
        const metrics: Record<string, any> = ((computed as any).__outputs) || {}
        const outputs: ConverterSummaryBranch[] = []
        const vouts: Array<{ label: string; value?: number }> = []
        const branchIds = new Set((branches || []).map(b => b?.id).filter(Boolean) as string[])
        const fallbackHandle = (branches && branches.length > 0 && branches[0]?.id) ? (branches[0]!.id || 'outputA') : 'outputA'
        const edgesByHandle: Record<string, ComputeEdge[]> = {}
        const outgoingEdges = adjacency.get(node.id) || []
        outgoingEdges.forEach(edge => {
          const rawHandle = (edge as any).fromHandle as string | undefined
          const resolved = rawHandle && branchIds.has(rawHandle) ? rawHandle : fallbackHandle
          ;(edgesByHandle[resolved] = edgesByHandle[resolved] || []).push(edge)
        })
        const totalVisited = new Set<string>()
        let totalDownstreamLoss = 0
        for (const edge of outgoingEdges) totalDownstreamLoss += sumEdgeLoss(edge, multiplier, projectContext, totalVisited, getSubsystemInfo)

        branches.forEach((branch, idx) => {
          const handleId = resolveDualHandleId(branches, idx, branch)
          const metric = metrics[handleId] || {}
          const branchBasePin = safePower(metric.P_in)
          const branchBasePout = safePower(metric.P_out)
          const branchLossRaw = toNumber(metric.loss)
          const branchBaseLoss = Number.isFinite(branchLossRaw) ? (branchLossRaw as number) : (branchBasePin - branchBasePout)
          const branchBaseIout = safeCurrent(metric.I_out)
          const branchPin = branchBasePin * multiplier
          const branchPout = branchBasePout * multiplier
          const branchLoss = branchBaseLoss * multiplier
          const branchIout = branchBaseIout * multiplier
          const branchEff = branchPin > 0 ? clamp(branchPout / Math.max(branchPin, 1e-9), 0, 1) : 0
          const label = branch?.label || branch?.id || `Output ${idx + 1}`
          const Vout = toNumber(branch?.Vout)
          const branchPhaseCount = resolvePhaseCount((branch as any)?.phaseCount)
          const branchLossPerPhase = branchPhaseCount > 1 ? branchLoss / branchPhaseCount : undefined
          const branchEdgeLossBase = (edgesByHandle[handleId] || []).reduce((sum, edge)=> sum + safePower(edge.P_loss_edge), 0)
          let branchEdgeLoss = 0
          const branchVisited = new Set<string>()
          const branchEdges = edgesByHandle[handleId] || []
          if (branchEdges.length > 0) {
            for (const edge of branchEdges) branchEdgeLoss += sumEdgeLoss(edge, multiplier, projectContext, branchVisited, getSubsystemInfo)
          } else {
            branchEdgeLoss = branchEdgeLossBase * multiplier
          }
          outputs.push({
            id: handleId,
            label,
            vout: Vout,
            iout: branchIout,
            pin: branchPin,
            pout: branchPout,
            loss: branchLoss,
            efficiency: branchEff,
            phaseCount: branchPhaseCount,
            lossPerPhase: branchLossPerPhase,
            edgeLoss: branchEdgeLoss,
          })
          vouts.push({ label, value: Vout })
        })

        const location = pathNames.length ? pathNames.join(' / ') : 'System'
        const key = [...pathIds, node.id].join('>') || node.id
        entries.push({
          id: node.id,
          key,
          name: node.name || 'Dual-output converter',
          nodeType: 'DualOutputConverter',
          topology: node.topology,
          vinMin: toNumber(node.Vin_min),
          vinMax: toNumber(node.Vin_max),
          vouts,
          iout,
          pin,
          pout,
          loss,
          efficiency,
          phaseCount: nodePhaseCount,
          lossPerPhase,
          edgeLoss: totalDownstreamLoss,
          locationPath: [...pathNames],
          location,
          outputs,
        })
      } else if (rawNode.type === 'Bus') {
        const node = rawNode as BusNode
        const computed = projResult.nodes[node.id] || {}
        const basePin = safePower((computed as any).P_in)
        const basePout = safePower((computed as any).P_out)
        const baseLoss = safePower((computed as any).loss)
        const baseIout = safeCurrent((computed as any).I_out)
        const pin = basePin * multiplier
        const pout = basePout * multiplier
        const loss = baseLoss * multiplier
        const iout = baseIout * multiplier
        const efficiency = pin > 0 ? clamp(pout / pin, 0, 1) : 0
        const location = pathNames.length ? pathNames.join(' / ') : 'System'
        const key = [...pathIds, node.id].join('>') || node.id
        const outgoingEdges = adjacency.get(node.id) || []
        const visitedEdges = new Set<string>()
        let downstreamLoss = 0
        for (const edge of outgoingEdges) downstreamLoss += sumEdgeLoss(edge, multiplier, projectContext, visitedEdges, getSubsystemInfo)
        entries.push({
          id: node.id,
          key,
          name: node.name || 'Efuse/Resistor',
          nodeType: 'Efuse/Resistor',
          vout: toNumber(node.V_bus),
          iout,
          pin,
          pout,
          loss,
          efficiency,
          edgeLoss: downstreamLoss,
          locationPath: [...pathNames],
          location,
        })
      }
    }
  }

  visit(project, res, [], [], 1)

  entries.sort((a, b) => {
    const locationDiff = a.location.localeCompare(b.location)
    if (locationDiff !== 0) return locationDiff
    const diff = (b.pout || 0) - (a.pout || 0)
    if (Math.abs(diff) > 1e-9) return diff
    return a.name.localeCompare(b.name)
  })

  for (const entry of entries) {
    if (entry.outputs) {
      entry.outputs.sort((a, b) => {
        const diff = (b.pout || 0) - (a.pout || 0)
        if (Math.abs(diff) > 1e-9) return diff
        return a.label.localeCompare(b.label)
      })
    }
  }

  return entries
}

