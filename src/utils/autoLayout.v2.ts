import { AnyNode, Edge, Project } from '../models'
import { computeOrderedEdgeMidpoints } from './edgeMidpoints'
import { estimateNodeHeight } from './nodeDimensions'

type LayoutResult = { nodes: AnyNode[]; edges: Edge[] }

type Position = { x: number; y: number }

type NodeMaps = {
  nodesById: Map<string, AnyNode>
  incoming: Map<string, Edge[]>
  outgoing: Map<string, Edge[]>
  existingPositions: Map<string, { x?: number; y?: number }>
}

const DEFAULT_COLUMN_SPACING = 500
const COLUMN_START_X = 120
const DEFAULT_ROW_SPACING = 100
const BASE_COMPONENT_GAP = 200

const typePriority = (type: AnyNode['type']): number => {
  switch (type) {
    case 'Load':
      return 0
    case 'Subsystem':
      return 1
    case 'Bus':
      return 2
    case 'Converter':
    case 'DualOutputConverter':
      return 3
    case 'Source':
    case 'SubsystemInput':
      return 4
    case 'Note':
      return 5
    default:
      return 10
  }
}

const buildMaps = (project: Project): NodeMaps => {
  const nodesById = new Map<string, AnyNode>()
  const incoming = new Map<string, Edge[]>()
  const outgoing = new Map<string, Edge[]>()
  const existingPositions = new Map<string, { x?: number; y?: number }>()

  for (const node of project.nodes) {
    nodesById.set(node.id, node)
    incoming.set(node.id, [])
    outgoing.set(node.id, [])
    existingPositions.set(node.id, {
      x: typeof node.x === 'number' ? node.x : undefined,
      y: typeof node.y === 'number' ? node.y : undefined,
    })
  }

  for (const edge of project.edges) {
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) continue
    incoming.get(edge.to)!.push(edge)
    outgoing.get(edge.from)!.push(edge)
  }

  return { nodesById, incoming, outgoing, existingPositions }
}

const computeDepths = (project: Project, maps: NodeMaps): Map<string, number> => {
  const depthMap = new Map<string, number>()
  const queue: string[] = []
  const anchored = new Set<string>()

  const seedDepth = (nodeId: string, depth: number, lock: boolean) => {
    const current = depthMap.get(nodeId)
    if (current === undefined || depth > current) {
      depthMap.set(nodeId, depth)
      queue.push(nodeId)
    }
    if (lock) {
      anchored.add(nodeId)
    }
  }

  for (const node of project.nodes) {
    const outputs = maps.outgoing.get(node.id) ?? []
    const isAnchor = node.type === 'Load' || node.type === 'Subsystem' || outputs.length === 0
    if (isAnchor) {
      seedDepth(node.id, 1, true)
    }
  }

  while (queue.length) {
    const childId = queue.shift()!
    const childDepth = depthMap.get(childId) ?? 1
    const parents = maps.incoming.get(childId) ?? []
    for (const edge of parents) {
      const parentId = edge.from
      if (anchored.has(parentId)) continue
      const candidate = childDepth + 1
      if ((depthMap.get(parentId) ?? 0) >= candidate) continue
      depthMap.set(parentId, candidate)
      queue.push(parentId)
    }
  }

  for (const node of project.nodes) {
    if (!depthMap.has(node.id)) {
      depthMap.set(node.id, 1)
    }
  }

  return depthMap
}

const buildComponents = (project: Project, maps: NodeMaps): string[][] => {
  const visited = new Set<string>()
  const components: string[][] = []

  for (const node of project.nodes) {
    if (visited.has(node.id)) continue
    const stack = [node.id]
    const members: string[] = []
    visited.add(node.id)

    while (stack.length) {
      const current = stack.pop()!
      members.push(current)

      const neighbours = [
        ...(maps.outgoing.get(current) ?? []).map(edge => edge.to),
        ...(maps.incoming.get(current) ?? []).map(edge => edge.from),
      ]

      for (const neighbour of neighbours) {
        if (visited.has(neighbour)) continue
        visited.add(neighbour)
        stack.push(neighbour)
      }
    }

    components.push(members)
  }

  return components
}

const sortComponents = (components: string[][], depthMap: Map<string, number>, maps: NodeMaps): string[][] => {
  return components
    .map(nodeIds => {
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
      if (!Number.isFinite(minDepth)) minDepth = 0
      if (!Number.isFinite(minY)) minY = 0
      return { nodeIds, minDepth, minY }
    })
    .sort((a, b) => {
      if (a.minDepth !== b.minDepth) return a.minDepth - b.minDepth
      if (a.minY !== b.minY) return a.minY - b.minY
      return a.nodeIds[0].localeCompare(b.nodeIds[0])
    })
    .map(item => item.nodeIds)
}

const columnComparator = (maps: NodeMaps) => (aId: string, bId: string): number => {
  const nodeA = maps.nodesById.get(aId)!
  const nodeB = maps.nodesById.get(bId)!

  const priorityDiff = typePriority(nodeA.type) - typePriority(nodeB.type)
  if (priorityDiff !== 0) return priorityDiff

  const posA = maps.existingPositions.get(aId)?.y
  const posB = maps.existingPositions.get(bId)?.y
  if (posA !== undefined && posB !== undefined && Math.abs(posA - posB) > 1e-3) {
    return posA - posB
  }

  return nodeA.name.localeCompare(nodeB.name) || aId.localeCompare(bId)
}

const layoutComponent = (
  nodeIds: string[],
  maps: NodeMaps,
  depthMap: Map<string, number>,
  columnSpacing: number,
  rowSpacing: number,
  baseY: number
): { positions: Map<string, Position>; bottom: number } => {
  const positions = new Map<string, Position>()
  if (nodeIds.length === 0) {
    return { positions, bottom: baseY }
  }

  let maxDepth = 1
  for (const nodeId of nodeIds) {
    const depth = depthMap.get(nodeId) ?? 1
    if (depth > maxDepth) maxDepth = depth
  }

  const columnMap = new Map<number, string[]>()
  for (const nodeId of nodeIds) {
    const depth = depthMap.get(nodeId) ?? 1
    const column = maxDepth - depth
    const list = columnMap.get(column) ?? []
    list.push(nodeId)
    columnMap.set(column, list)
  }

  const sortedColumns = Array.from(columnMap.keys()).sort((a, b) => a - b)
  const compare = columnComparator(maps)
  let componentBottom = baseY

  for (const column of sortedColumns) {
    const entries = columnMap.get(column) ?? []
    const sortedEntries = entries.slice().sort(compare)
    const baseX = COLUMN_START_X + column * columnSpacing
    let previousBottom: number | null = null

    for (const nodeId of sortedEntries) {
      const node = maps.nodesById.get(nodeId)
      if (!node) continue
      const height = estimateNodeHeight(node)
      const top = previousBottom === null ? baseY : previousBottom + rowSpacing
      positions.set(nodeId, { x: baseX, y: top })
      previousBottom = top + height
      if (previousBottom > componentBottom) {
        componentBottom = previousBottom
      }
    }
  }

  return { positions, bottom: componentBottom }
}

export const autoLayoutProjectV2 = (
  project: Project,
  options?: { columnSpacing?: number; rowSpacing?: number }
): LayoutResult => {
  const maps = buildMaps(project)
  const depthMap = computeDepths(project, maps)
  const rawColumnSpacing = options?.columnSpacing
  const columnSpacing = typeof rawColumnSpacing === 'number' && Number.isFinite(rawColumnSpacing) && rawColumnSpacing > 0
    ? rawColumnSpacing
    : DEFAULT_COLUMN_SPACING

  const rawRowSpacing = options?.rowSpacing
  const rowSpacing = typeof rawRowSpacing === 'number' && Number.isFinite(rawRowSpacing) && rawRowSpacing > 0
    ? rawRowSpacing
    : DEFAULT_ROW_SPACING

  const spacingScale = rowSpacing / DEFAULT_ROW_SPACING
  const componentGap = Math.max(rowSpacing, BASE_COMPONENT_GAP * spacingScale)

  const components = sortComponents(buildComponents(project, maps), depthMap, maps)
  const coords = new Map<string, Position>()

  let currentY = 0
  for (const component of components) {
    const { positions, bottom } = layoutComponent(component, maps, depthMap, columnSpacing, rowSpacing, currentY)
    for (const [nodeId, pos] of positions.entries()) {
      coords.set(nodeId, pos)
    }
    currentY = bottom + componentGap
  }

  const nodes = project.nodes.map(node => {
    const pos = coords.get(node.id)
    if (!pos) return { ...node }
    return { ...node, x: pos.x, y: pos.y } as AnyNode
  })

  const edges = computeOrderedEdgeMidpoints(project, coords)

  return { nodes, edges }
}
