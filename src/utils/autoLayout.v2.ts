import { compute } from '../calc'
import { computeOrderedEdgeMidpoints } from './edgeMidpoints'
import type { AnyNode, Edge, Project } from '../models'

export type LayoutResult = { nodes: AnyNode[]; edges: Edge[] }

type LayoutOptions = {
  columnSpacing?: number
  rowSpacing?: number
}

type NodeMaps = {
  nodesById: Map<string, AnyNode>
  incoming: Map<string, Edge[]>
  outgoing: Map<string, Edge[]>
}

type DepthMap = Map<string, number>

type HandleDescriptor = {
  nodeId: string
  handleId: string | null
  order: number
}

type ColumnTracker = {
  nextTop: number
}

const DEFAULT_COLUMN_SPACING = 500
const DEFAULT_ROW_SPACING = 100
const COLUMN_START_X = 120
const TOP_MARGIN = 0

const typeBaseHeight: Record<string, number> = {
  Source: 86,
  Converter: 116,
  DualOutputConverter: 116,
  Load: 142,
  Bus: 116,
  Note: 120,
  Subsystem: 170,
  SubsystemInput: 86,
}

const estimateNodeHeight = (node: AnyNode | undefined): number => {
  if (!node) return DEFAULT_ROW_SPACING
  let height = typeBaseHeight[node.type] ?? DEFAULT_ROW_SPACING
  if (node.type === 'DualOutputConverter') {
    const outputs = Array.isArray((node as any).outputs) ? (node as any).outputs : []
    if (outputs.length > 1) height += (outputs.length - 1) * 14
  }
  if (node.type === 'Subsystem') {
    const ports = Array.isArray((node as any).project?.nodes)
      ? (node as any).project.nodes.filter((p: any) => p?.type === 'SubsystemInput')
      : []
    if (ports.length > 1) height += (ports.length - 1) * 14
  }
  return height
}

const buildMaps = (project: Project): NodeMaps => {
  const nodesById = new Map<string, AnyNode>()
  const incoming = new Map<string, Edge[]>()
  const outgoing = new Map<string, Edge[]>()

  for (const node of project.nodes) {
    nodesById.set(node.id, node)
    incoming.set(node.id, [])
    outgoing.set(node.id, [])
  }

  for (const edge of project.edges) {
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) continue
    incoming.get(edge.to)!.push(edge)
    outgoing.get(edge.from)!.push(edge)
  }

  return { nodesById, incoming, outgoing }
}

const isSinkNode = (node: AnyNode): boolean => node.type === 'Load' || node.type === 'Subsystem'

const initializeDepths = (project: Project, maps: NodeMaps): DepthMap => {
  const depthMap: DepthMap = new Map()
  const queue: string[] = []

  // initialize sinks and orphan nodes
  for (const node of project.nodes) {
    if (isSinkNode(node)) {
      depthMap.set(node.id, 1)
      queue.push(node.id)
    }
  }

  // ensure we have at least one seed to avoid empty traversal
  if (queue.length === 0 && project.nodes.length) {
    const fallback = project.nodes[0]
    depthMap.set(fallback.id, 1)
    queue.push(fallback.id)
  }

  const guardLimit = project.nodes.length * 8
  let guard = guardLimit

  while (queue.length && guard > 0) {
    guard -= 1
    const currentId = queue.shift()!
    const currentDepth = depthMap.get(currentId) ?? 1
    const incomingEdges = maps.incoming.get(currentId) ?? []
    for (const edge of incomingEdges) {
      const upstreamId = edge.from
      const upstreamNode = maps.nodesById.get(upstreamId)
      if (upstreamNode && isSinkNode(upstreamNode)) continue
      const prev = depthMap.get(upstreamId)
      const candidate = currentDepth + 1
      if (prev === undefined || candidate > prev) {
        depthMap.set(upstreamId, candidate)
        queue.push(upstreamId)
      }
    }
  }

  // clamp unresolved / orphan upstream nodes to depth 1 so they share the leftmost column
  for (const node of project.nodes) {
    if (!depthMap.has(node.id)) {
      depthMap.set(node.id, 1)
    }
  }

  return depthMap
}

const computePowerByNode = (project: Project): Map<string, number> => {
  const result = compute(project)
  const powerByNode = new Map<string, number>()
  const nodeMetrics = (result && (result as any).nodes) || {}

  const candidatesFromMetrics = (metrics: any): number[] => {
    const scores: number[] = []
    const maybeAdd = (val: unknown) => {
      if (typeof val === 'number' && Number.isFinite(val)) scores.push(val)
    }
    maybeAdd(metrics?.P_in_total)
    maybeAdd(metrics?.P_in)
    maybeAdd(metrics?.P_out_total)
    maybeAdd(metrics?.P_out)
    return scores
  }

  for (const node of project.nodes) {
    const metrics = nodeMetrics[node.id]
    const scores = candidatesFromMetrics(metrics)
    if (Array.isArray(metrics?.__outputs)) {
      for (const sub of metrics.__outputs) {
        const maybeVal = Number(sub?.P_out)
        if (Number.isFinite(maybeVal)) scores.push(maybeVal)
      }
    }
    if (scores.length) {
      powerByNode.set(node.id, Math.max(...scores))
    }
  }

  return powerByNode
}

const sortLoadAndSubsystemColumn = (
  project: Project,
  depthMap: DepthMap,
  maps: NodeMaps,
  powerByNode: Map<string, number>
): AnyNode[] => {
  const loads = project.nodes.filter(node => node.type === 'Load' || node.type === 'Subsystem')

  const rankByClosestUpstreamDepth = (nodeId: string): number => {
    const incomingEdges = maps.incoming.get(nodeId) ?? []
    let best = Infinity
    for (const edge of incomingEdges) {
      const upstreamDepth = depthMap.get(edge.from)
      if (typeof upstreamDepth === 'number' && upstreamDepth < best) {
        best = upstreamDepth
      }
    }
    return Number.isFinite(best) ? best : Infinity
  }

  const byPower = (nodeId: string): number => powerByNode.get(nodeId) ?? 0

  return [...loads].sort((a, b) => {
    const depthDiff = rankByClosestUpstreamDepth(a.id) - rankByClosestUpstreamDepth(b.id)
    if (depthDiff !== 0) return depthDiff
    const powerDiff = byPower(b.id) - byPower(a.id)
    if (Math.abs(powerDiff) > 1e-6) return powerDiff
    return a.name.localeCompare(b.name)
  })
}

const resolveHandleOrder = (
  node: AnyNode,
  incomingEdges: Edge[]
): HandleDescriptor[] => {
  const relevantEdges = [...incomingEdges]
  const grouped = new Map<string, { handleId: string | null; edges: Edge[] }>()
  for (const edge of relevantEdges) {
    const handleId = (edge.toHandle ?? null) as string | null
    const key = handleId ?? '__default__'
    const bucket = grouped.get(key)
    if (bucket) bucket.edges.push(edge)
    else grouped.set(key, { handleId, edges: [edge] })
  }

  const totals = Array.from(grouped.values())
  const storedOrder: string[] | undefined = Array.isArray((node as any).inputHandleOrder)
    ? ((node as any).inputHandleOrder as string[])
    : undefined

  const orderIndex = (handleId: string | null): number => {
    if (!storedOrder) return Number.MAX_SAFE_INTEGER
    if (handleId === null) return storedOrder.length + 1
    const index = storedOrder.indexOf(handleId)
    return index === -1 ? storedOrder.length + 1 : index
  }

  return totals
    .map(bucket => ({
      nodeId: node.id,
      handleId: bucket.handleId,
      order: orderIndex(bucket.handleId),
    }))
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order
      // fallback deterministic order
      const aKey = a.handleId ?? ''
      const bKey = b.handleId ?? ''
      return aKey.localeCompare(bKey)
    })
}

const computeDesiredTop = (
  downstreamNode: AnyNode,
  downstreamTop: number,
  handleIndex: number,
  handleCount: number,
  upstreamHeight: number,
  rowSpacing: number
): number => {
  const downstreamHeight = estimateNodeHeight(downstreamNode)
  const downstreamCenter = downstreamTop + downstreamHeight / 2
  const offset = handleCount <= 1 ? 0 : (handleIndex / (handleCount - 1) - 0.5) * Math.max(rowSpacing, downstreamHeight / Math.max(1, handleCount))
  const desiredCenter = downstreamCenter + offset
  return desiredCenter - upstreamHeight / 2
}

const ensureColumnTracker = (
  trackers: Map<number, ColumnTracker>,
  columnIndex: number,
  startTop: number
): ColumnTracker => {
  let tracker = trackers.get(columnIndex)
  if (!tracker) {
    tracker = { nextTop: startTop }
    trackers.set(columnIndex, tracker)
  }
  return tracker
}

const placeNode = (
  node: AnyNode,
  columnIndex: number,
  x: number,
  proposedTop: number,
  trackers: Map<number, ColumnTracker>,
  coords: Map<string, { x: number; y: number }>,
  rowSpacing: number
) => {
  const tracker = ensureColumnTracker(trackers, columnIndex, TOP_MARGIN)
  const minTop = tracker.nextTop
  const top = Math.max(proposedTop, minTop)
  coords.set(node.id, { x, y: top })
  tracker.nextTop = top + rowSpacing
}

const placeLoadColumn = (
  nodes: AnyNode[],
  columnIndex: number,
  x: number,
  coords: Map<string, { x: number; y: number }>,
  trackers: Map<number, ColumnTracker>,
  rowSpacing: number
) => {
  let cursor = TOP_MARGIN
  for (const node of nodes) {
    const tracker = ensureColumnTracker(trackers, columnIndex, TOP_MARGIN)
    const top = Math.max(cursor, tracker.nextTop)
    coords.set(node.id, { x, y: top })
    tracker.nextTop = top + rowSpacing
    cursor = tracker.nextTop
  }
}

const groupHandlesForDepth = (
  downstreamNodes: AnyNode[],
  depthMap: DepthMap,
  maps: NodeMaps,
  currentDepth: number,
  coords: Map<string, { x: number; y: number }>
): HandleDescriptor[] => {
  const entries: HandleDescriptor[] = []
  for (const node of downstreamNodes) {
    const incoming = maps.incoming.get(node.id) ?? []
    const relevant = incoming.filter(edge => depthMap.get(edge.from) === currentDepth)
    if (relevant.length === 0) continue
    const descriptors = resolveHandleOrder(node, relevant)
    let orderIndex = 0
    for (const descriptor of descriptors) {
      entries.push({ ...descriptor, order: orderIndex })
      orderIndex += 1
    }
  }

  return entries.sort((a, b) => {
    const posA = coords.get(a.nodeId)
    const posB = coords.get(b.nodeId)
    const yA = posA ? posA.y : 0
    const yB = posB ? posB.y : 0
    if (yA !== yB) return yA - yB
    if (a.order !== b.order) return a.order - b.order
    const aKey = a.handleId ?? ''
    const bKey = b.handleId ?? ''
    return aKey.localeCompare(bKey)
  })
}

const processColumnForDepth = (
  depth: number,
  depthMap: DepthMap,
  maps: NodeMaps,
  coords: Map<string, { x: number; y: number }>,
  trackers: Map<number, ColumnTracker>,
  columnIndex: number,
  columnX: number,
  rowSpacing: number
) => {
  const nodesAtDepth = Array.from(depthMap.entries())
    .filter(([, depthValue]) => depthValue === depth)
    .map(([nodeId]) => maps.nodesById.get(nodeId)!)

  const downstreamNodes = Array.from(depthMap.entries())
    .filter(([, depthValue]) => depthValue === depth - 1)
    .map(([nodeId]) => maps.nodesById.get(nodeId)!)
    .sort((a, b) => {
      const posA = coords.get(a.id)
      const posB = coords.get(b.id)
      const yA = posA ? posA.y : 0
      const yB = posB ? posB.y : 0
      return yA - yB
    })

  const remaining = new Set(nodesAtDepth.map(node => node.id))
  const handleEntries = groupHandlesForDepth(downstreamNodes, depthMap, maps, depth, coords)

  for (const entry of handleEntries) {
    const downstreamNode = maps.nodesById.get(entry.nodeId)!
    const handleId = entry.handleId
    const targetEdges = (maps.incoming.get(entry.nodeId) ?? []).filter(edge =>
      depthMap.get(edge.from) === depth && (handleId === null ? edge.toHandle == null : edge.toHandle === handleId)
    )
    if (targetEdges.length === 0) continue
    const tracker = ensureColumnTracker(trackers, columnIndex, TOP_MARGIN)
    const downstreamPos = coords.get(entry.nodeId)
    const baseTop = downstreamPos ? downstreamPos.y : tracker.nextTop
    const handleCount = Math.max(1, targetEdges.length)
    let index = 0
    for (const edge of targetEdges) {
      const upstreamNode = maps.nodesById.get(edge.from)
      if (!upstreamNode || !remaining.has(upstreamNode.id)) {
        index += 1
        continue
      }
      const upstreamHeight = estimateNodeHeight(upstreamNode)
      const desiredTop = computeDesiredTop(
        downstreamNode,
        baseTop,
        index,
        handleCount,
        upstreamHeight,
        rowSpacing
      )
      const trackerMin = tracker.nextTop
      const finalTop = Math.max(desiredTop, trackerMin)
      placeNode(upstreamNode, columnIndex, columnX, finalTop, trackers, coords, rowSpacing)
      remaining.delete(upstreamNode.id)
      index += 1
    }
  }

  if (remaining.size > 0) {
    const tracker = ensureColumnTracker(trackers, columnIndex, TOP_MARGIN)
    const sorted = Array.from(remaining.values())
      .map(id => maps.nodesById.get(id)!)
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const node of sorted) {
      const finalTop = tracker.nextTop
      placeNode(node, columnIndex, columnX, finalTop, trackers, coords, rowSpacing)
    }
  }
}

const computeColumnIndex = (depth: number, maxDepth: number): number => {
  const clampedDepth = Math.max(1, Math.min(depth, maxDepth))
  return maxDepth - clampedDepth
}

const computeColumnX = (columnIndex: number, columnSpacing: number): number => COLUMN_START_X + columnIndex * columnSpacing

export const autoLayoutProjectV2 = (
  project: Project,
  options?: LayoutOptions
): LayoutResult => {
  const columnSpacing = typeof options?.columnSpacing === 'number' && options.columnSpacing > 0
    ? options.columnSpacing
    : DEFAULT_COLUMN_SPACING
  const rowSpacing = typeof options?.rowSpacing === 'number' && options.rowSpacing > 0
    ? options.rowSpacing
    : DEFAULT_ROW_SPACING

  if (project.nodes.length === 0) {
    return { nodes: [], edges: [...project.edges] }
  }

  const maps = buildMaps(project)
  const depthMap = initializeDepths(project, maps)
  const maxDepth = Math.max(...depthMap.values())
  const powerByNode = computePowerByNode(project)
  const coords = new Map<string, { x: number; y: number }>()
  const trackers = new Map<number, ColumnTracker>()

  const loadNodes = sortLoadAndSubsystemColumn(project, depthMap, maps, powerByNode)
  const loadColumnIndex = computeColumnIndex(1, maxDepth)
  const loadColumnX = computeColumnX(loadColumnIndex, columnSpacing)
  placeLoadColumn(loadNodes, loadColumnIndex, loadColumnX, coords, trackers, rowSpacing)

  for (const [nodeId, depth] of depthMap.entries()) {
    const node = maps.nodesById.get(nodeId)
    if (!node) continue
    if (node.type === 'Load' || node.type === 'Subsystem') continue
    if (depth === 1 && !coords.has(nodeId)) {
      const columnIndex = computeColumnIndex(1, maxDepth)
      const x = computeColumnX(columnIndex, columnSpacing)
      const tracker = ensureColumnTracker(trackers, columnIndex, TOP_MARGIN)
      const top = tracker.nextTop
      placeNode(node, columnIndex, x, top, trackers, coords, rowSpacing)
    }
  }

  for (let depth = 2; depth <= maxDepth; depth += 1) {
    const columnIndex = computeColumnIndex(depth, maxDepth)
    const columnX = computeColumnX(columnIndex, columnSpacing)
    processColumnForDepth(depth, depthMap, maps, coords, trackers, columnIndex, columnX, rowSpacing)
  }

  const nodes = project.nodes.map(node => {
    const position = coords.get(node.id)
    if (!position) return { ...node }
    return { ...node, x: position.x, y: position.y } as AnyNode
  })

  const edges = computeOrderedEdgeMidpoints(project, coords)

  return { nodes, edges }
}

export type { LayoutOptions }

