import { AnyNode, Edge, Project } from '../models'
import { compute } from '../calc'

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

const DEFAULT_COLUMN_SPACING = 340
const COLUMN_START_X = 120
const ROW_SPACING = 160
const COMPONENT_GAP = 200
const TOP_MARGIN = 120

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
      return 2
    case 'Bus':
      return 3
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
  let currentY = TOP_MARGIN

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
    let maxRows = 0
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
      if (sortedEntries.length > maxRows) {
        maxRows = sortedEntries.length
      }
    }

    const componentHeight = maxRows > 0 ? (maxRows - 1) * ROW_SPACING : 0

    columnEntries.forEach(({ column, nodes }, index) => {
      const baseX = COLUMN_START_X + column * columnSpacing
      const columnHeight = nodes.length > 0 ? (nodes.length - 1) * ROW_SPACING : 0
      let baseY = startY
      if (index === 0) {
        const offset = (componentHeight - columnHeight) / 2
        if (offset > 0) {
          baseY += offset
        }
      }
      nodes.forEach((info, rowIndex) => {
        const y = baseY + rowIndex * ROW_SPACING
        coords.set(info.id, { x: baseX, y })
        rankWithinComponent.set(info.id, rowIndex)
      })
    })

    for (let idx = columnEntries.length - 2; idx >= 0; idx--) {
      const { nodes } = columnEntries[idx]
      let childMin = Infinity
      let childMax = -Infinity
      for (const info of nodes) {
        const outgoing = maps.outgoing.get(info.id) ?? []
        for (const edge of outgoing) {
          const targetPos = coords.get(edge.to)
          if (!targetPos) continue
          if (targetPos.y < childMin) childMin = targetPos.y
          if (targetPos.y > childMax) childMax = targetPos.y
        }
      }
      if (!Number.isFinite(childMin) || !Number.isFinite(childMax)) continue

      let columnMin = Infinity
      let columnMax = -Infinity
      for (const info of nodes) {
        const pos = coords.get(info.id)
        if (!pos) continue
        if (pos.y < columnMin) columnMin = pos.y
        if (pos.y > columnMax) columnMax = pos.y
      }
      if (!Number.isFinite(columnMin) || !Number.isFinite(columnMax)) continue

      const targetCenter = (childMin + childMax) / 2
      const columnCenter = (columnMin + columnMax) / 2
      const shift = targetCenter - columnCenter
      if (Math.abs(shift) < 1e-3) continue

      for (const info of nodes) {
        const pos = coords.get(info.id)
        if (!pos) continue
        coords.set(info.id, { x: pos.x, y: pos.y + shift })
      }
    }

    const topNodes = columnEntries
      .map(entry => entry.nodes[0])
      .filter((node): node is NodeInfo => !!node)
    if (topNodes.length > 1) {
      const reference = coords.get(topNodes[0].id)
      if (reference) {
        const targetY = reference.y
        columnEntries.forEach(entry => {
          const first = entry.nodes[0]
          if (!first) return
          const firstPos = coords.get(first.id)
          if (!firstPos) return
          const delta = targetY - firstPos.y
          if (Math.abs(delta) < 1e-3) return
          entry.nodes.forEach(info => {
            const pos = coords.get(info.id)
            if (!pos) return
            coords.set(info.id, { x: pos.x, y: pos.y + delta })
          })
        })
      }
    }

    currentY = startY + componentHeight + COMPONENT_GAP
  }

  return coords
}

const updateEdges = (
  project: Project,
  coords: Map<string, { x: number; y: number }>
): Edge[] => {
  return project.edges.map(edge => {
    const next: Edge = { ...edge }
    const source = coords.get(edge.from)
    const target = coords.get(edge.to)
    if (source && target) {
      const rawOffset = typeof edge.midpointOffset === 'number' ? edge.midpointOffset : 0.5
      const clamped = Math.min(1, Math.max(0, rawOffset))
      next.midpointOffset = clamped
      const deltaX = target.x - source.x
      next.midpointX = source.x + deltaX * clamped
    } else {
      delete (next as any).midpointX
    }
    return next
  })
}

export const autoLayoutProject = (project: Project, options?: { columnSpacing?: number }): LayoutResult => {
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
    const candidates = [
      (metrics as any).P_in_total,
      (metrics as any).P_in,
      (metrics as any).P_out_total,
      (metrics as any).P_out,
    ]
    const value = candidates.find(v => typeof v === 'number' && Number.isFinite(v))
    if (typeof value === 'number') {
      powerByNode.set(nodeId, value)
    }
  }

  const rawSpacing = options?.columnSpacing
  const columnSpacing = typeof rawSpacing === 'number' && Number.isFinite(rawSpacing) && rawSpacing > 0
    ? rawSpacing
    : DEFAULT_COLUMN_SPACING

  const coords = assignCoordinates(project, maps, depthMap, columnSpacing, powerByNode)
  const nodes = project.nodes.map(node => {
    const position = coords.get(node.id)
    if (!position) return { ...node }
    return { ...node, x: position.x, y: position.y } as AnyNode
  })
  const edges = updateEdges(project, coords)

  return { nodes, edges }
}
