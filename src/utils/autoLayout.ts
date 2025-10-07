import { AnyNode, Edge, Project } from '../models'
import { compute } from '../calc'

type LayoutResult = { nodes: AnyNode[]; edges: Edge[] }

const DEFAULT_COLUMN_SPACING = 500
const COLUMN_START_X = 120
const DEFAULT_ROW_SPACING = 100
const BASE_TOP_MARGIN = 120
const MIN_TOP_MARGIN = 40

type Position = { x?: number; y?: number }

type NodeMaps = {
  nodesById: Map<string, AnyNode>
  incoming: Map<string, Edge[]>
  outgoing: Map<string, Edge[]>
  inDegree: Map<string, number>
  existingPositions: Map<string, Position>
}

type HandleOrderingMap = Map<string, Map<string, number>>

const buildMaps = (project: Project): NodeMaps => {
  const nodesById = new Map<string, AnyNode>()
  const incoming = new Map<string, Edge[]>()
  const outgoing = new Map<string, Edge[]>()
  const inDegree = new Map<string, number>()
  const existingPositions = new Map<string, Position>()

  for (const node of project.nodes) {
    nodesById.set(node.id, node)
    incoming.set(node.id, [])
    outgoing.set(node.id, [])
    inDegree.set(node.id, 0)
    existingPositions.set(node.id, {
      x: typeof node.x === 'number' ? node.x : undefined,
      y: typeof node.y === 'number' ? node.y : undefined,
    })
  }

  for (const edge of project.edges) {
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) continue
    incoming.get(edge.to)!.push(edge)
    outgoing.get(edge.from)!.push(edge)
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
  }

  return { nodesById, incoming, outgoing, inDegree, existingPositions }
}

const TARGET_COLUMN_TYPES: ReadonlySet<AnyNode['type']> = new Set(['Load', 'Subsystem'])

const DEFAULT_HANDLE_KEY = '__default__'

const buildHandleOrdering = (project: Project): HandleOrderingMap => {
  const ordering = new Map<string, Map<string, number>>()

  for (const node of project.nodes) {
    if (node.type !== 'Subsystem') continue
    const subsystemProject = (node as any).project
    const subNodes: AnyNode[] = Array.isArray(subsystemProject?.nodes) ? subsystemProject.nodes : []
    const inputs = subNodes.filter((child: AnyNode) => child?.type === 'SubsystemInput')
    if (!inputs.length) continue
    const sorted = [...inputs].sort((a, b) => {
      const yDiff = (a.y ?? 0) - (b.y ?? 0)
      if (Math.abs(yDiff) > 1e-3) return yDiff
      const xDiff = (a.x ?? 0) - (b.x ?? 0)
      if (Math.abs(xDiff) > 1e-3) return xDiff
      const nameA = a.name ?? ''
      const nameB = b.name ?? ''
      if (nameA !== nameB) return nameA.localeCompare(nameB)
      return a.id.localeCompare(b.id)
    })
    const map = new Map<string, number>()
    map.set(DEFAULT_HANDLE_KEY, 0)
    map.set('input', 0)
    sorted.forEach((input, index) => {
      map.set(input.id, index + 1)
    })
    ordering.set(node.id, map)
  }

  return ordering
}

const handleOrderIndex = (
  ordering: HandleOrderingMap,
  nodeId: string,
  handleId?: string,
  fallback = Number.MAX_SAFE_INTEGER
): number => {
  const map = ordering.get(nodeId)
  if (!map) return fallback
  const key = handleId ?? DEFAULT_HANDLE_KEY
  if (map.has(key)) return map.get(key)!
  return fallback
}

const computeDepthMap = (project: Project, maps: NodeMaps): Map<string, number> => {
  const depthMap = new Map<string, number>()
  const queue: string[] = []

  for (const node of project.nodes) {
    if (TARGET_COLUMN_TYPES.has(node.type)) {
      depthMap.set(node.id, 1)
      queue.push(node.id)
    }
  }

  if (queue.length === 0) {
    for (const node of project.nodes) {
      depthMap.set(node.id, 1)
    }
    return depthMap
  }

  const maxDepthCap = Math.max(2, project.nodes.length + 1)

  while (queue.length) {
    const currentId = queue.shift()!
    const currentDepth = depthMap.get(currentId) ?? 1
    const incomingEdges = maps.incoming.get(currentId) ?? []
    for (const edge of incomingEdges) {
      const upstreamId = edge.from
      if (!maps.nodesById.has(upstreamId)) continue
      const nextDepth = Math.min(maxDepthCap, currentDepth + 1)
      const previousDepth = depthMap.get(upstreamId)
      if (previousDepth === undefined || nextDepth > previousDepth) {
        depthMap.set(upstreamId, nextDepth)
        queue.push(upstreamId)
      }
    }
  }

  let maxDepth = 1
  depthMap.forEach(value => {
    if (value > maxDepth) maxDepth = value
  })

  let fallbackDepth = maxDepth + 1
  for (const node of project.nodes) {
    if (!depthMap.has(node.id)) {
      depthMap.set(node.id, fallbackDepth)
      fallbackDepth += 1
    }
  }

  return depthMap
}

type HandleCandidate = {
  upstreamId: string
  downstreamId: string
  y: number
  sortKey: string
}

type CandidatePlacement = {
  id: string
  targetY: number
}

const assignCoordinates = (
  project: Project,
  maps: NodeMaps,
  depthMap: Map<string, number>,
  columnSpacing: number,
  rowSpacing: number,
  topMargin: number,
  powerByNode: Map<string, number>,
  handleOrdering: HandleOrderingMap
): Map<string, { x: number; y: number }> => {
  const coords = new Map<string, { x: number; y: number }>()
  if (project.nodes.length === 0) return coords

  let maxDepth = 1
  depthMap.forEach(value => {
    if (value > maxDepth) maxDepth = value
  })

  const nodesByDepth = new Map<number, AnyNode[]>()
  for (const node of project.nodes) {
    const depth = depthMap.get(node.id) ?? maxDepth
    const list = nodesByDepth.get(depth) ?? []
    list.push(node)
    nodesByDepth.set(depth, list)
  }

  const columnXForDepth = new Map<number, number>()
  for (let depth = 1; depth <= maxDepth; depth++) {
    const columnIndex = maxDepth - depth
    columnXForDepth.set(depth, COLUMN_START_X + columnIndex * columnSpacing)
  }

  const depthOneNodes = nodesByDepth.get(1) ?? []
  const prioritizedLoads = depthOneNodes.filter(node => TARGET_COLUMN_TYPES.has(node.type))
  const otherDepthOneNodes = depthOneNodes.filter(node => !TARGET_COLUMN_TYPES.has(node.type))
  const columnXDepthOne = columnXForDepth.get(1) ?? COLUMN_START_X

  const closestUpstreamDepth = (nodeId: string): number => {
    const incomingEdges = maps.incoming.get(nodeId) ?? []
    let minDepth = Infinity
    for (const edge of incomingEdges) {
      const parentDepth = depthMap.get(edge.from)
      if (typeof parentDepth === 'number' && parentDepth < minDepth) {
        minDepth = parentDepth
      }
    }
    return minDepth
  }

  const sortedPrioritized = prioritizedLoads
    .map(node => ({
      node,
      closestUpstream: closestUpstreamDepth(node.id),
      totalPin: powerByNode.get(node.id) ?? 0,
    }))
    .sort((a, b) => {
      if (a.closestUpstream !== b.closestUpstream) {
        const aFinite = Number.isFinite(a.closestUpstream)
        const bFinite = Number.isFinite(b.closestUpstream)
        if (aFinite && !bFinite) return -1
        if (!aFinite && bFinite) return 1
        return (a.closestUpstream - b.closestUpstream)
      }
      if (a.totalPin !== b.totalPin) return b.totalPin - a.totalPin
      return a.node.name.localeCompare(b.node.name)
    })

  let loadColumnCursor = topMargin
  const placeDepthOneNode = (node: AnyNode) => {
    coords.set(node.id, { x: columnXDepthOne, y: loadColumnCursor })
    loadColumnCursor += rowSpacing
  }

  for (const item of sortedPrioritized) {
    placeDepthOneNode(item.node)
  }

  otherDepthOneNodes
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(node => placeDepthOneNode(node))

  for (let depth = 2; depth <= maxDepth; depth++) {
    const nodesAtDepth = nodesByDepth.get(depth)
    if (!nodesAtDepth || nodesAtDepth.length === 0) continue

    const columnX = columnXForDepth.get(depth) ?? (COLUMN_START_X + (maxDepth - depth) * columnSpacing)
    const pending = new Set(nodesAtDepth.map(node => node.id))
    const placements: CandidatePlacement[] = []

    const downstreamNodes = (nodesByDepth.get(depth - 1) ?? [])
      .filter(node => coords.has(node.id))
      .sort((a, b) => (coords.get(a.id)!.y - coords.get(b.id)!.y))

    const handleCandidates: HandleCandidate[] = []

    for (const downstream of downstreamNodes) {
      const incomingEdges = (maps.incoming.get(downstream.id) ?? [])
        .filter(edge => pending.has(edge.from) && depthMap.get(edge.from) === depth)

      if (!incomingEdges.length) continue

      incomingEdges.sort((a, b) => {
        const orderA = handleOrderIndex(handleOrdering, downstream.id, a.toHandle)
        const orderB = handleOrderIndex(handleOrdering, downstream.id, b.toHandle)
        if (orderA !== orderB) return orderA - orderB
        const handleA = a.toHandle ?? ''
        const handleB = b.toHandle ?? ''
        if (handleA !== handleB) return handleA.localeCompare(handleB)
        return a.from.localeCompare(b.from)
      })

      const baseY = coords.get(downstream.id)!.y
      incomingEdges.forEach((edge, index) => {
        const candidateY = baseY + index * rowSpacing
        handleCandidates.push({
          upstreamId: edge.from,
          downstreamId: downstream.id,
          y: candidateY,
          sortKey: `${baseY.toFixed(3)}::${handleOrderIndex(handleOrdering, downstream.id, edge.toHandle)
            .toString()
            .padStart(4, '0')}::${edge.toHandle ?? ''}::${edge.from}`,
        })
      })
    }

    handleCandidates.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 1e-6) return a.y - b.y
      if (a.downstreamId !== b.downstreamId) return a.downstreamId.localeCompare(b.downstreamId)
      return a.sortKey.localeCompare(b.sortKey)
    })

    for (const candidate of handleCandidates) {
      if (!pending.has(candidate.upstreamId)) continue
      placements.push({ id: candidate.upstreamId, targetY: candidate.y })
      pending.delete(candidate.upstreamId)
    }

    if (pending.size) {
      const remainingNodes = nodesAtDepth
        .filter(node => pending.has(node.id))
        .sort((a, b) => a.name.localeCompare(b.name))

      const placedTargets = placements.map(item => item.targetY)
      let fallbackY: number
      if (placedTargets.length) {
        fallbackY = Math.max(...placedTargets) + rowSpacing
      } else {
        const downstreamYs = downstreamNodes
          .map(node => coords.get(node.id)?.y)
          .filter((value): value is number => typeof value === 'number')
        fallbackY = downstreamYs.length ? Math.min(...downstreamYs) : topMargin
      }

      for (const node of remainingNodes) {
        placements.push({ id: node.id, targetY: fallbackY })
        fallbackY += rowSpacing
        pending.delete(node.id)
      }
    }

    placements.sort((a, b) => a.targetY - b.targetY)

    let columnCursor = placements.length ? Math.max(topMargin, placements[0].targetY) : topMargin
    placements.forEach((placement, index) => {
      if (index === 0) {
        columnCursor = Math.max(topMargin, placement.targetY)
      } else {
        columnCursor = Math.max(placement.targetY, columnCursor)
      }
      coords.set(placement.id, { x: columnX, y: columnCursor })
      columnCursor += rowSpacing
    })
  }

  return coords
}

const updateEdges = (
  project: Project,
  coords: Map<string, { x: number; y: number }>,
  columnSpacing: number,
  handleOrdering: HandleOrderingMap
): Edge[] => {
  const plannedMidpoints = new Map<string, { midpointOffset: number; midpointX: number }>()
  const edgesByTarget = new Map<string, Edge[]>()

  for (const edge of project.edges) {
    const source = coords.get(edge.from)
    const target = coords.get(edge.to)
    if (!source || !target) continue
    const list = edgesByTarget.get(edge.to) ?? []
    list.push(edge)
    edgesByTarget.set(edge.to, list)
  }

  for (const [targetId, edges] of edgesByTarget.entries()) {
    const sorted = [...edges].sort((a, b) => {
      const orderA = handleOrderIndex(handleOrdering, targetId, a.toHandle)
      const orderB = handleOrderIndex(handleOrdering, targetId, b.toHandle)
      if (orderA !== orderB) return orderA - orderB
      const handleA = a.toHandle ?? ''
      const handleB = b.toHandle ?? ''
      if (handleA !== handleB) return handleA.localeCompare(handleB)
      const yA = coords.get(a.from)?.y ?? 0
      const yB = coords.get(b.from)?.y ?? 0
      if (yA !== yB) return yA - yB
      return a.id.localeCompare(b.id)
    })

    const count = sorted.length
    sorted.forEach((edge, index) => {
      const source = coords.get(edge.from)
      const target = coords.get(targetId)
      if (!source || !target) return
      const deltaX = target.x - source.x
      if (Math.abs(deltaX) < 1e-3) {
        plannedMidpoints.set(edge.id, { midpointOffset: 0.5, midpointX: source.x })
        return
      }
      const baseMidpoint = source.x + deltaX * 0.5
      const spread = Math.min(Math.abs(deltaX) * 0.4, columnSpacing * 0.6)
      const step = count > 1 ? spread / (count - 1) : 0
      const offset = count > 1 ? -spread / 2 + index * step : 0
      const desiredMidpoint = baseMidpoint + offset
      const rawOffset = (desiredMidpoint - source.x) / deltaX
      const clampedOffset = Math.min(0.95, Math.max(0.05, rawOffset))
      const midpointX = source.x + deltaX * clampedOffset
      plannedMidpoints.set(edge.id, { midpointOffset: clampedOffset, midpointX })
    })
  }

  return project.edges.map(edge => {
    const next: Edge = { ...edge }
    const source = coords.get(edge.from)
    const target = coords.get(edge.to)
    const plan = plannedMidpoints.get(edge.id)
    if (source && target && plan) {
      next.midpointOffset = plan.midpointOffset
      next.midpointX = plan.midpointX
    } else if (source && target) {
      const deltaX = target.x - source.x
      if (Math.abs(deltaX) > 1e-3) {
        const baseOffset = 0.5
        next.midpointOffset = baseOffset
        next.midpointX = source.x + deltaX * baseOffset
      } else {
        delete (next as any).midpointOffset
        delete (next as any).midpointX
      }
    } else {
      delete (next as any).midpointOffset
      delete (next as any).midpointX
    }
    return next
  })
}

export const autoLayoutProject = (
  project: Project,
  options?: { columnSpacing?: number; rowSpacing?: number }
): LayoutResult => {
  const maps = buildMaps(project)
  const depthMap = computeDepthMap(project, maps)
  const handleOrdering = buildHandleOrdering(project)

  const computeResult = compute(project)
  const powerByNode = new Map<string, number>()
  const nodeMetrics = (computeResult && (computeResult as any).nodes) || {}
  for (const [nodeId, metrics] of Object.entries(nodeMetrics)) {
    if (!metrics || typeof metrics !== 'object') continue
    const candidates: number[] = []
    const maybeAdd = (val: unknown) => {
      if (typeof val === 'number' && Number.isFinite(val)) candidates.push(val)
    }
    maybeAdd((metrics as any).P_in_total)
    maybeAdd((metrics as any).P_in)
    maybeAdd((metrics as any).P_out_total)
    maybeAdd((metrics as any).P_out)
    const outputs = (metrics as any).__outputs
    if (outputs && typeof outputs === 'object') {
      const sumPout = Object.values(outputs as any).reduce((acc: number, out: any) => acc + (Number.isFinite(out?.P_out) ? Number(out.P_out) : 0), 0)
      const sumPin  = Object.values(outputs as any).reduce((acc: number, out: any) => acc + (Number.isFinite(out?.P_in)  ? Number(out.P_in)  : 0), 0)
      if (Number.isFinite(sumPout)) candidates.push(sumPout)
      if (Number.isFinite(sumPin)) candidates.push(sumPin)
    }
    // Fallback: derive power from outgoing connections (sum of child P_in + edge losses)
    try {
      const derived = (project.edges || [])
        .filter(e => e.from === nodeId)
        .reduce((acc, e) => {
          const child = (nodeMetrics as any)[e.to]
          const edgeRes = (computeResult as any)?.edges?.[e.id]
          const childPin = (child && typeof child.P_in === 'number') ? child.P_in : 0
          const edgeLoss = (edgeRes && typeof edgeRes.P_loss_edge === 'number') ? edgeRes.P_loss_edge : 0
          return acc + childPin + edgeLoss
        }, 0)
      if (Number.isFinite(derived)) candidates.push(derived)
    } catch (_err) {
      // ignore
    }
    if (candidates.length) {
      const value = Math.max(...candidates)
      powerByNode.set(nodeId, value)
    }
  }

  const rawSpacing = options?.columnSpacing
  const columnSpacing = typeof rawSpacing === 'number' && Number.isFinite(rawSpacing) && rawSpacing > 0
    ? rawSpacing
    : DEFAULT_COLUMN_SPACING

  const rawRowSpacing = options?.rowSpacing
  const rowSpacing = typeof rawRowSpacing === 'number' && Number.isFinite(rawRowSpacing) && rawRowSpacing > 0
    ? rawRowSpacing
    : DEFAULT_ROW_SPACING

  const spacingScale = rowSpacing / DEFAULT_ROW_SPACING
  const topMargin = Math.max(MIN_TOP_MARGIN, BASE_TOP_MARGIN * spacingScale)

  const coords = assignCoordinates(
    project,
    maps,
    depthMap,
    columnSpacing,
    rowSpacing,
    topMargin,
    powerByNode,
    handleOrdering
  )
  const nodes = project.nodes.map(node => {
    const position = coords.get(node.id)
    if (!position) return { ...node }
    return { ...node, x: position.x, y: position.y } as AnyNode
  })
  const edges = updateEdges(project, coords, columnSpacing, handleOrdering)

  return { nodes, edges }
}
