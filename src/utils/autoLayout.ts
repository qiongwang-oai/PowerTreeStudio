import { AnyNode, Edge, Project } from '../models'
import { compute } from '../calc'
import { computeOrderedEdgeMidpoints } from './edgeMidpoints'

type LayoutResult = { nodes: AnyNode[]; edges: Edge[] }

type NodeInfo = {
  id: string
  depth: number
  column: number
  component: number
}

type ParentDescriptor = {
  rank: number
  handleKey: string
  column: number
}

const DEFAULT_COLUMN_SPACING = 500
const COLUMN_START_X = 120
const DEFAULT_ROW_SPACING = 100
const BASE_COMPONENT_GAP = 200
const BASE_TOP_MARGIN = 0
const MIN_TOP_MARGIN = 0

type Position = { x?: number; y?: number }

type NodeMaps = {
  nodesById: Map<string, AnyNode>
  incoming: Map<string, Edge[]>
  outgoing: Map<string, Edge[]>
  inDegree: Map<string, number>
  existingPositions: Map<string, Position>
}

const typePriority = (type: AnyNode['type']): number => {
  switch (type) {
    case 'Source':
      return 0
    case 'SubsystemInput':
      return 1
    case 'Converter':
    case 'DualOutputConverter':
      return 2
    case 'Bus':
      return 2
    case 'Subsystem':
      return 4
    case 'Load':
      return 5
    case 'Note':
      return 6
    default:
      return 10
  }
}

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

const pickSeeds = (project: Project, maps: NodeMaps, depthMap: Map<string, number>): string[] => {
  const remainingInDegree = new Map(maps.inDegree)
  let seeds = project.nodes.filter(node => (remainingInDegree.get(node.id) ?? 0) === 0)

  if (seeds.length === 0) {
    seeds = project.nodes.filter(node => node.type === 'Source' || node.type === 'SubsystemInput')
    if (seeds.length === 0) {
      seeds = [...project.nodes]
    }
    for (const seed of seeds) {
      remainingInDegree.set(seed.id, 0)
    }
  }

  const sortedSeeds = [...new Set(seeds.map(seed => seed.id))]
    .map(id => maps.nodesById.get(id)!)
    .sort((a, b) => {
      const typeDiff = typePriority(a.type) - typePriority(b.type)
      if (typeDiff !== 0) return typeDiff
      const posA = maps.existingPositions.get(a.id) || {}
      const posB = maps.existingPositions.get(b.id) || {}
      const yDiff = (posA.y ?? 0) - (posB.y ?? 0)
      if (yDiff !== 0) return yDiff
      const xDiff = (posA.x ?? 0) - (posB.x ?? 0)
      if (xDiff !== 0) return xDiff
      return a.name.localeCompare(b.name)
    })

  for (const node of sortedSeeds) {
    if (!depthMap.has(node.id)) {
      depthMap.set(node.id, 0)
    }
  }

  return sortedSeeds.map(node => node.id)
}

const propagateDepths = (
  maps: NodeMaps,
  initialQueue: string[],
  depthMap: Map<string, number>
): void => {
  const remainingInDegree = new Map(maps.inDegree)
  const queue: string[] = [...initialQueue]
  const inQueue = new Set(queue)
  const processed = new Set<string>()

  for (const nodeId of initialQueue) {
    remainingInDegree.set(nodeId, 0)
  }

  while (queue.length) {
    const currentId = queue.shift()!
    processed.add(currentId)
    const baseDepth = depthMap.get(currentId) ?? 0
    const outgoingEdges = maps.outgoing.get(currentId) ?? []

    for (const edge of outgoingEdges) {
      const targetId = edge.to
      const nextDepth = baseDepth + 1
      const prevDepth = depthMap.get(targetId)
      if (prevDepth === undefined || nextDepth > prevDepth) {
        depthMap.set(targetId, nextDepth)
      }

      const nextInDegree = (remainingInDegree.get(targetId) ?? maps.inDegree.get(targetId) ?? 0) - 1
      remainingInDegree.set(targetId, nextInDegree)
      if (nextInDegree <= 0 && !inQueue.has(targetId) && !processed.has(targetId)) {
        queue.push(targetId)
        inQueue.add(targetId)
      }
    }
  }
}

const resolveRemainingDepths = (
  project: Project,
  maps: NodeMaps,
  depthMap: Map<string, number>
): void => {
  const unresolvedIds = () => project.nodes.filter(node => !depthMap.has(node.id)).map(node => node.id)
  let pending = unresolvedIds()
  let guard = project.nodes.length * 2

  while (pending.length > 0 && guard > 0) {
    guard -= 1
    let progress = false
    for (const nodeId of pending) {
      const parents = maps.incoming.get(nodeId) ?? []
      const parentDepths = parents
        .map(edge => depthMap.get(edge.from))
        .filter((value): value is number => typeof value === 'number')
      if (parentDepths.length > 0) {
        depthMap.set(nodeId, Math.max(...parentDepths) + 1)
        progress = true
      }
    }
    if (!progress) break
    pending = unresolvedIds()
  }

  const currentMaxDepth = [...depthMap.values()].reduce((max, value) => Math.max(max, value), 0)
  let fallback = currentMaxDepth + 1
  for (const node of project.nodes) {
    if (!depthMap.has(node.id)) {
      depthMap.set(node.id, fallback)
      fallback += 1
    }
  }
}

const buildComponents = (maps: NodeMaps): Map<string, number> => {
  const componentMap = new Map<string, number>()
  let componentId = 0

  for (const nodeId of maps.nodesById.keys()) {
    if (componentMap.has(nodeId)) continue
    const stack = [nodeId]
    componentMap.set(nodeId, componentId)

    while (stack.length) {
      const current = stack.pop()!
      const outgoingNeighbours = maps.outgoing.get(current) ?? []
      const incomingNeighbours = maps.incoming.get(current) ?? []
      const neighbours = [
        ...outgoingNeighbours.map(edge => edge.to),
        ...incomingNeighbours.map(edge => edge.from),
      ]
      for (const neighbour of neighbours) {
        if (componentMap.has(neighbour)) continue
        componentMap.set(neighbour, componentId)
        stack.push(neighbour)
      }
    }

    componentId += 1
  }

  return componentMap
}

const sortComponents = (
  project: Project,
  depthMap: Map<string, number>,
  componentMap: Map<string, number>,
  maps: NodeMaps
): { id: number; nodeIds: string[]; minDepth: number; minY: number }[] => {
  const nodesPerComponent = new Map<number, string[]>()
  for (const node of project.nodes) {
    const id = componentMap.get(node.id) ?? 0
    const list = nodesPerComponent.get(id) ?? []
    list.push(node.id)
    nodesPerComponent.set(id, list)
  }

  const components: { id: number; nodeIds: string[]; minDepth: number; minY: number }[] = []
  for (const [id, nodeIds] of nodesPerComponent.entries()) {
    let minDepth = Infinity
    let minY = Infinity
    for (const nodeId of nodeIds) {
      const depth = depthMap.get(nodeId) ?? 0
      if (depth < minDepth) minDepth = depth
      const pos = maps.existingPositions.get(nodeId)
      if (pos?.y !== undefined && pos.y < minY) {
        minY = pos.y
      }
    }
    if (!Number.isFinite(minY)) {
      minY = 0
    }
    if (!Number.isFinite(minDepth)) {
      minDepth = 0
    }
    components.push({ id, nodeIds, minDepth, minY })
  }

  components.sort((a, b) => {
    if (a.minDepth !== b.minDepth) return a.minDepth - b.minDepth
    if (a.minY !== b.minY) return a.minY - b.minY
    return a.id - b.id
  })
  return components
}

const parentDescriptors = (
  nodeId: string,
  maps: NodeMaps,
  rankWithinComponent: Map<string, number>,
  depthMap: Map<string, number>,
  depthToColumn: Map<number, number>
): ParentDescriptor[] => {
  const incomingEdges = maps.incoming.get(nodeId) ?? []
  return incomingEdges.map(edge => {
    const rank = rankWithinComponent.has(edge.from)
      ? rankWithinComponent.get(edge.from)!
      : Infinity
    const column = depthToColumn.get(depthMap.get(edge.from) ?? 0) ?? 0
    const handleKey = `${edge.from}::${edge.fromHandle ?? ''}`
    return { rank, handleKey, column }
  }).sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    if (a.column !== b.column) return a.column - b.column
    return a.handleKey.localeCompare(b.handleKey)
  })
}

const assignCoordinates = (
  project: Project,
  maps: NodeMaps,
  depthMap: Map<string, number>,
  columnSpacing: number,
  rowSpacing: number,
  componentGap: number,
  topMargin: number,
  powerByNode: Map<string, number>
): Map<string, { x: number; y: number }> => {
  const coords = new Map<string, { x: number; y: number }>()
  if (project.nodes.length === 0) return coords

  const uniqueDepths = Array.from(new Set(depthMap.values())).sort((a, b) => a - b)
  const depthToColumn = new Map<number, number>()
  uniqueDepths.forEach((depth, index) => {
    depthToColumn.set(depth, index)
  })

  const componentMap = buildComponents(maps)
  const components = sortComponents(project, depthMap, componentMap, maps)
  let currentY = topMargin
  const spanCache = new Map<string, number>()
  const getSpanUnits = (nodeId: string): number => {
    if (spanCache.has(nodeId)) return spanCache.get(nodeId)!
    const depth = depthMap.get(nodeId) ?? 0
    const outgoingEdges = maps.outgoing.get(nodeId) ?? []
    let sum = 0
    for (const edge of outgoingEdges){
      const childDepth = depthMap.get(edge.to) ?? Infinity
      if (childDepth <= depth) continue
      sum += getSpanUnits(edge.to)
    }
    const span = Math.max(1, sum)
    spanCache.set(nodeId, span)
    return span
  }

  // Approximate visual heights for node types to align handle centers
  const typeBaseHeight: Record<string, number> = {
  Source: 94,
  Converter: 100,
  DualOutputConverter: 118,
  Load: 132,
  Bus: 140,
  Note: 120,
  Subsystem: 170,
  SubsystemInput: 100,
  }

  const estimateNodeHeightById = (nodeId: string): number => {
    const node = maps.nodesById.get(nodeId)
    if (!node) return rowSpacing
  const explicitHeight = Number((node as any).height)
  if (Number.isFinite(explicitHeight) && explicitHeight > 0) {
    return explicitHeight
  }
    let h = typeBaseHeight[node.type] ?? rowSpacing
    if (node.type === 'DualOutputConverter') {
      const outs = Array.isArray((node as any).outputs) ? (node as any).outputs : []
      if (outs.length > 1) h += (outs.length - 1) * 14
    }
    if (node.type === 'Subsystem') {
      const ports = Array.isArray((node as any).project?.nodes)
        ? (node as any).project.nodes.filter((p: any) => p?.type === 'SubsystemInput')
        : []
      if (ports.length > 1) h += (ports.length - 1) * 14
    }
    return h
  }

  const centerY = (nodeId: string): number => {
    const pos = coords.get(nodeId)
    if (!pos) return 0
    return pos.y + estimateNodeHeightById(nodeId) / 2
  }

  for (const component of components) {
    const startY = currentY
    const columnMap = new Map<number, NodeInfo[]>()
    const rankWithinComponent = new Map<string, number>()

    for (const nodeId of component.nodeIds) {
      const depth = depthMap.get(nodeId) ?? 0
      const column = depthToColumn.get(depth) ?? 0
      const info: NodeInfo = {
        id: nodeId,
        depth,
        column,
        component: component.id,
      }
      const list = columnMap.get(column) ?? []
      list.push(info)
      columnMap.set(column, list)
    }

    const sortedColumns = Array.from(columnMap.keys()).sort((a, b) => a - b)
    let maxSpanUnits = 0
    const columnEntries: { column: number; nodes: NodeInfo[] }[] = []

    for (const column of sortedColumns) {
      const entries = columnMap.get(column) ?? []
      const items = entries
        .map(entry => {
          const parents = parentDescriptors(entry.id, maps, rankWithinComponent, depthMap, depthToColumn)
          const primaryParent = parents[0]
          const parentRank = primaryParent ? primaryParent.rank : Infinity
          const primaryHandleKey = primaryParent ? primaryParent.handleKey : `__${entry.id}`
          const pos = maps.existingPositions.get(entry.id) || {}
          const prevY = pos.y ?? 0
          const prevX = pos.x ?? 0
          const node = maps.nodesById.get(entry.id)!
          const groupKey = parents.length
            ? parents.map(p => p.handleKey).sort().join('|')
            : `__solo__${entry.id}`
          const groupRank = parents.length
            ? Math.min(...parents.map(p => p.rank))
            : Infinity
          const totalPin = powerByNode.get(entry.id) ?? 0
          return {
            entry,
            parentRank,
            primaryHandleKey,
            prevY,
            prevX,
            name: node.name,
            groupKey,
            groupRank,
            totalPin,
          }
        })
      const groups = new Map<string, {
        groupKey: string
        groupRank: number
        totalPin: number
        members: typeof items
      }>()
      for (const item of items) {
        const existing = groups.get(item.groupKey)
        if (existing) {
          existing.members.push(item)
          existing.groupRank = Math.min(existing.groupRank, item.groupRank)
          existing.totalPin += item.totalPin
        } else {
          groups.set(item.groupKey, {
            groupKey: item.groupKey,
            groupRank: item.groupRank,
            totalPin: item.totalPin,
            members: [item],
          })
        }
      }
      const sortedGroups = Array.from(groups.values()).map(group => {
        const sortedMembers = group.members.sort((a, b) => {
          if (a.totalPin !== b.totalPin) return b.totalPin - a.totalPin
          if (a.parentRank !== b.parentRank) return a.parentRank - b.parentRank
          if (a.primaryHandleKey !== b.primaryHandleKey) {
            return a.primaryHandleKey.localeCompare(b.primaryHandleKey)
          }
          if (a.prevY !== b.prevY) return a.prevY - b.prevY
          if (a.prevX !== b.prevX) return a.prevX - b.prevX
          if (a.name !== b.name) return a.name.localeCompare(b.name)
          return a.entry.id.localeCompare(b.entry.id)
        })
        return {
          groupKey: group.groupKey,
          groupRank: group.groupRank,
          totalPin: group.totalPin,
          members: sortedMembers,
        }
      }).sort((a, b) => {
        if (a.totalPin !== b.totalPin) return b.totalPin - a.totalPin
        if (a.groupRank !== b.groupRank) return a.groupRank - b.groupRank
        return a.groupKey.localeCompare(b.groupKey)
      })

      const sortedEntries = sortedGroups.flatMap(group => group.members.map(member => member.entry))

      columnEntries.push({ column, nodes: sortedEntries })
      const columnSpanUnits = sortedEntries.reduce((acc, info) => acc + getSpanUnits(info.id), 0)
      if (columnSpanUnits > maxSpanUnits) {
        maxSpanUnits = columnSpanUnits
      }
    }

    const componentHeight = maxSpanUnits > 0 ? Math.max(0, (maxSpanUnits - 1) * rowSpacing) : 0

    columnEntries.forEach(({ column, nodes }, index) => {
      const baseX = COLUMN_START_X + column * columnSpacing
      const totalSpanUnits = nodes.reduce((acc, info) => acc + getSpanUnits(info.id), 0)
      const columnHeight = totalSpanUnits > 0 ? Math.max(0, (totalSpanUnits - 1) * rowSpacing) : 0
      let baseY = startY
      if (index === 0) {
        const offset = (componentHeight - columnHeight) / 2
        if (offset > 0) {
          baseY += offset
        }
      }
      let cursorUnits = 0
      nodes.forEach((info) => {
        const y = baseY + cursorUnits * rowSpacing
        coords.set(info.id, { x: baseX, y })
        rankWithinComponent.set(info.id, cursorUnits)
        cursorUnits += getSpanUnits(info.id)
      })
    })

    for (let idx = columnEntries.length - 2; idx >= 0; idx--) {
      const { nodes } = columnEntries[idx]
      for (const info of nodes) {
        const parentPos = coords.get(info.id)
        if (!parentPos) continue
        const outgoing = maps.outgoing.get(info.id) ?? []
        let bestChildId: string | null = null
        let bestChildY: number | null = null
        for (const edge of outgoing) {
          const childPos = coords.get(edge.to)
          if (!childPos) continue
          if (bestChildY === null || childPos.y < bestChildY) {
            bestChildY = childPos.y
            bestChildId = edge.to
          }
        }
        if (!bestChildId) continue
        const parentCenter = centerY(info.id)
        const childCenter = centerY(bestChildId)
        const shift = childCenter - parentCenter
        if (Math.abs(shift) < 1e-3) continue
        coords.set(info.id, { x: parentPos.x, y: parentPos.y + shift })
      }
    }

    for (const entry of columnEntries) {
      if (entry.nodes.length <= 1) continue
      const decorated = entry.nodes
        .map(info => {
          const pos = coords.get(info.id)
          if (!pos) return null
          const depth = depthMap.get(info.id) ?? 0
          const children = (maps.outgoing.get(info.id) ?? []).filter(edge => {
            const targetDepth = depthMap.get(edge.to)
            return typeof targetDepth === 'number' && targetDepth > depth
          })
          return {
            id: info.id,
            pos,
            hasForwardChildren: children.length > 0,
          }
        })
        .filter((value): value is { id: string; pos: { x: number; y: number }; hasForwardChildren: boolean } => !!value)
        .sort((a, b) => a.pos.y - b.pos.y)

      if (decorated.length <= 1) continue
      const baseY = decorated[0].pos.y
      let previousY = baseY - rowSpacing

      decorated.forEach((item, index) => {
        let nextY = item.pos.y
        if (!item.hasForwardChildren) {
          const desiredY = baseY + index * rowSpacing
          if (nextY > desiredY) {
            nextY = desiredY
          }
        }
        const minY = previousY + rowSpacing
        if (nextY < minY) {
          nextY = minY
        }
        if (Math.abs(nextY - item.pos.y) > 1e-3) {
          coords.set(item.id, { x: item.pos.x, y: nextY })
        }
        previousY = nextY
      })
    }

    const componentNodeIds = component.nodeIds
    let minPlacedY = Infinity
    for (const nodeId of componentNodeIds) {
      const pos = coords.get(nodeId)
      if (!pos) continue
      if (pos.y < minPlacedY) minPlacedY = pos.y
    }
    if (Number.isFinite(minPlacedY) && minPlacedY < startY) {
      const correction = startY - minPlacedY
      for (const nodeId of componentNodeIds) {
        const pos = coords.get(nodeId)
        if (!pos) continue
        coords.set(nodeId, { x: pos.x, y: pos.y + correction })
      }
    }

    currentY = startY + componentHeight + componentGap
  }

  return coords
}

export const autoLayoutProject = (
  project: Project,
  options?: { columnSpacing?: number; rowSpacing?: number }
): LayoutResult => {
  const maps = buildMaps(project)
  const depthMap = new Map<string, number>()
  const seeds = pickSeeds(project, maps, depthMap)
  propagateDepths(maps, seeds, depthMap)
  resolveRemainingDepths(project, maps, depthMap)

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
  const componentGap = Math.max(rowSpacing, BASE_COMPONENT_GAP * spacingScale)
  const topMargin = Math.max(MIN_TOP_MARGIN, BASE_TOP_MARGIN * spacingScale)

  const coords = assignCoordinates(project, maps, depthMap, columnSpacing, rowSpacing, componentGap, topMargin, powerByNode)
  const nodes = project.nodes.map(node => {
    const position = coords.get(node.id)
    if (!position) return { ...node }
    return { ...node, x: position.x, y: position.y } as AnyNode
  })
  const edges = computeOrderedEdgeMidpoints(project, coords)

  return { nodes, edges }
}
