import { ComputeResult, compute, ComputeEdge } from './calc'
import { AnyNode, ConverterNode, DualOutputConverterNode, Project, SubsystemNode } from './models'
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
  nodeType: 'Converter' | 'DualOutputConverter'
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

export function buildConverterSummary(project: Project, result?: ComputeResult): ConverterSummaryEntry[] {
  const res: ComputeResult = result ?? compute(project)
  const entries: ConverterSummaryEntry[] = []
  const subsystemPortEdgeLoss = new Map<string, number>()
  const subsystemPortIds = new Map<string, string[]>()

  const buildEdgesFrom = (computeResult: ComputeResult): Map<string, ComputeEdge[]> => {
    const map = new Map<string, ComputeEdge[]>()
    for (const edge of Object.values(computeResult.edges)) {
      const arr = map.get(edge.from)
      if (arr) arr.push(edge)
      else map.set(edge.from, [edge])
    }
    return map
  }

  const getSubsystemPortLoss = (subsystemId: string, handle?: string | null): number => {
    const portIds = subsystemPortIds.get(subsystemId) || []
    if (handle && portIds.includes(handle)) return subsystemPortEdgeLoss.get(`${subsystemId}::${handle}`) || 0
    if (portIds.length === 1) return subsystemPortEdgeLoss.get(`${subsystemId}::${portIds[0]}`) || 0
    let total = 0
    for (const pid of portIds) total += subsystemPortEdgeLoss.get(`${subsystemId}::${pid}`) || 0
    return total
  }

  const accumulateEdgeLossFromEdges = (
    edges: ComputeEdge[] | undefined,
    edgesFrom: Map<string, ComputeEdge[]>,
    computeResult: ComputeResult,
    visited: Set<string>
  ): number => {
    if (!edges || edges.length === 0) return 0
    let total = 0
    for (const edge of edges) {
      if (!edge || visited.has(edge.id)) continue
      visited.add(edge.id)
      total += safePower(edge.P_loss_edge)
      const child = computeResult.nodes[edge.to]
      if (!child) continue
      if (child.type === 'Bus') {
        total += accumulateEdgeLossFromEdges(edgesFrom.get(child.id), edgesFrom, computeResult, visited)
      } else if (child.type === 'Subsystem') {
        const handle = (edge as any).toHandle as string | undefined
        total += getSubsystemPortLoss(child.id, handle)
      } else if (child.type === 'SubsystemInput' || child.type === 'Note') {
        total += accumulateEdgeLossFromEdges(edgesFrom.get(child.id), edgesFrom, computeResult, visited)
      }
    }
    return total
  }

  const collectPortEdgeLosses = (subsystemId: string, originalProject: Project, computeResult: ComputeResult) => {
    const edgesFrom = buildEdgesFrom(computeResult)
    const ports = (originalProject.nodes as AnyNode[]).filter(n => (n as any).type === 'SubsystemInput')
    const portIds = ports.map(p => p.id)
    subsystemPortIds.set(subsystemId, portIds)
    for (const portId of portIds) {
      const loss = accumulateEdgeLossFromEdges(edgesFrom.get(portId), edgesFrom, computeResult, new Set<string>())
      subsystemPortEdgeLoss.set(`${subsystemId}::${portId}`, loss)
    }
  }

  const visit = (proj: Project, projResult: ComputeResult, pathNames: string[], pathIds: string[], multiplier: number) => {
    const edgesFrom = buildEdgesFrom(projResult)

    for (const rawNode of proj.nodes as AnyNode[]) {
      if (rawNode.type === 'Subsystem') {
        const sub = rawNode as SubsystemNode
        if (!sub.project || typeof sub.project !== 'object') continue
        const innerOriginal: Project = JSON.parse(JSON.stringify(sub.project))
        const inner: Project = JSON.parse(JSON.stringify(sub.project))
        inner.currentScenario = proj.currentScenario
        const innerResult = compute(inner)
        const nextNames = [...pathNames, sub.name || 'Subsystem']
        const nextIds = [...pathIds, sub.id]
        visit(inner, innerResult, nextNames, nextIds, multiplier)
        collectPortEdgeLosses(sub.id, innerOriginal, innerResult)
      }
    }

    for (const rawNode of proj.nodes as AnyNode[]) {
      if (rawNode.type === 'Converter') {
        const node = rawNode as ConverterNode
        const computed = projResult.nodes[node.id] || {}
        const basePin = safePower((computed as any).P_in)
        const basePout = safePower((computed as any).P_out)
        const lossRaw = toNumber((computed as any).loss)
        const baseLoss = Number.isFinite(lossRaw) ? (lossRaw as number) : (basePin - basePout)
        const baseIout = safeCurrent((computed as any).I_out)
        const phaseCount = resolvePhaseCount((node as any).phaseCount)
        const baseEdgeLoss = accumulateEdgeLossFromEdges(edgesFrom.get(node.id), edgesFrom, projResult, new Set<string>())
        const pin = basePin * multiplier
        const pout = basePout * multiplier
        const loss = baseLoss * multiplier
        const iout = baseIout * multiplier
        const edgeLoss = baseEdgeLoss * multiplier
        const lossPerPhase = phaseCount > 1 ? loss / phaseCount : undefined
        const efficiency = pin > 0 ? clamp(pout / pin, 0, 1) : 0
        const location = pathNames.length ? pathNames.join(' / ') : 'System'
        const key = [...pathIds, node.id].join('>') || node.id
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
          edgeLoss,
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
        const baseEdgeLoss = accumulateEdgeLossFromEdges(edgesFrom.get(node.id), edgesFrom, projResult, new Set<string>())
        const pin = basePin * multiplier
        const pout = basePout * multiplier
        const loss = baseLoss * multiplier
        const iout = baseIout * multiplier
        const edgeLoss = baseEdgeLoss * multiplier
        const lossPerPhase = nodePhaseCount > 1 ? loss / nodePhaseCount : undefined
        const efficiency = pin > 0 ? clamp(pout / pin, 0, 1) : 0
        const branches = Array.isArray(node.outputs) ? node.outputs : []
        const metrics: Record<string, any> = ((computed as any).__outputs) || {}
        const outputs: ConverterSummaryBranch[] = []
        const vouts: Array<{ label: string; value?: number }> = []
        const nodeEdges = edgesFrom.get(node.id) || []
        const branchIds = new Set((branches || []).map(b => b?.id).filter(Boolean) as string[])
        const fallbackHandle = (branches && branches.length > 0 && branches[0]?.id) ? (branches[0]!.id || 'outputA') : 'outputA'

        branches.forEach((branch, idx) => {
          const handleId = resolveDualHandleId(branches, idx, branch)
          const metric = metrics[handleId] || {}
          const branchBasePin = safePower(metric.P_in)
          const branchBasePout = safePower(metric.P_out)
          const branchLossRaw = toNumber(metric.loss)
          const branchBaseLoss = Number.isFinite(branchLossRaw) ? (branchLossRaw as number) : (branchBasePin - branchBasePout)
          const branchBaseIout = safeCurrent(metric.I_out)
          const branchEdges = nodeEdges.filter(edge => {
            const rawHandle = (edge as any).fromHandle as string | undefined
            const resolved = rawHandle && branchIds.has(rawHandle) ? rawHandle : fallbackHandle
            return resolved === handleId
          })
          const branchPin = branchBasePin * multiplier
          const branchPout = branchBasePout * multiplier
          const branchLoss = branchBaseLoss * multiplier
          const branchIout = branchBaseIout * multiplier
          const branchEff = branchPin > 0 ? clamp(branchPout / Math.max(branchPin, 1e-9), 0, 1) : 0
          const label = branch?.label || branch?.id || `Output ${idx + 1}`
          const Vout = toNumber(branch?.Vout)
          const branchPhaseCount = resolvePhaseCount((branch as any)?.phaseCount)
          const branchLossPerPhase = branchPhaseCount > 1 ? branchLoss / branchPhaseCount : undefined
          const branchEdgeLossBase = accumulateEdgeLossFromEdges(branchEdges, edgesFrom, projResult, new Set<string>())
          const branchEdgeLoss = branchEdgeLossBase * multiplier
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
          edgeLoss,
          locationPath: [...pathNames],
          location,
          outputs,
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

