import type { AnyNode, Edge, CanvasMarkup } from '../models'
import type { ClipboardPayload } from '../state/store'
import type { MultiSelection } from '../types/selection'

export type ClipboardResolvers = {
  resolveNodeSnapshot: (nodeId: string) => AnyNode | null
  resolveEdgeSnapshot?: (edgeId: string) => Edge | null
  resolveMarkupSnapshot?: (markupId: string) => CanvasMarkup | null
}

export type ClipboardFilters = {
  includeNodeId?: (nodeId: string, snapshot: AnyNode | null) => boolean
  includeEdgeSnapshot?: (edge: Edge, nodeIdSet: Set<string>) => boolean
  includeMarkupId?: (markupId: string, snapshot: CanvasMarkup | null) => boolean
}

export const collectClipboardPayload = (
  selection: MultiSelection,
  resolvers: ClipboardResolvers,
  filters: ClipboardFilters = {}
): ClipboardPayload | null => {
  const { resolveNodeSnapshot, resolveEdgeSnapshot, resolveMarkupSnapshot } = resolvers
  const allowNode = filters.includeNodeId ?? (() => true)
  const allowEdge =
    filters.includeEdgeSnapshot ??
    ((edge: Edge, nodeIdSet: Set<string>) => nodeIdSet.has(edge.from) && nodeIdSet.has(edge.to))
  const allowMarkup = filters.includeMarkupId ?? (() => true)

  const nodeSnapshots: AnyNode[] = []
  for (const nodeId of selection.nodes) {
    const snapshot = resolveNodeSnapshot(nodeId)
    if (!allowNode(nodeId, snapshot) || !snapshot) continue
    nodeSnapshots.push(JSON.parse(JSON.stringify(snapshot)) as AnyNode)
  }

  const nodeIdSet = new Set(nodeSnapshots.map(node => node.id))
  const edgeSnapshots: Edge[] = []
  if (resolveEdgeSnapshot) {
    for (const edgeId of selection.edges) {
      const snapshot = resolveEdgeSnapshot(edgeId)
      if (!snapshot) continue
      if (!allowEdge(snapshot, nodeIdSet)) continue
      edgeSnapshots.push(JSON.parse(JSON.stringify(snapshot)) as Edge)
    }
  }

  const markupSnapshots: CanvasMarkup[] = []
  if (resolveMarkupSnapshot) {
    for (const markupId of selection.markups) {
      const snapshot = resolveMarkupSnapshot(markupId)
      if (!allowMarkup(markupId, snapshot) || !snapshot) continue
      markupSnapshots.push(JSON.parse(JSON.stringify(snapshot)) as CanvasMarkup)
    }
  }

  if (!nodeSnapshots.length && !markupSnapshots.length) {
    return null
  }

  const originPoints: { x: number; y: number }[] = []
  for (const node of nodeSnapshots) {
    if (typeof node.x === 'number' && typeof node.y === 'number') {
      originPoints.push({ x: node.x, y: node.y })
    }
  }
  for (const markup of markupSnapshots) {
    if (markup.type === 'text' || markup.type === 'rectangle') {
      originPoints.push({ x: markup.position.x, y: markup.position.y })
    } else if (markup.type === 'line') {
      originPoints.push({ x: Math.min(markup.start.x, markup.end.x), y: Math.min(markup.start.y, markup.end.y) })
    }
  }

  let origin: { x: number; y: number } | null = null
  if (originPoints.length) {
    origin = originPoints.reduce(
      (acc, point) => ({
        x: Math.min(acc.x, point.x),
        y: Math.min(acc.y, point.y),
      }),
      { x: originPoints[0].x, y: originPoints[0].y }
    )
  }

  return {
    nodes: nodeSnapshots,
    edges: edgeSnapshots,
    markups: markupSnapshots,
    origin,
  }
}

export type ClipboardApplyOptions = {
  payload: ClipboardPayload
  target: { x: number; y: number }
  offset?: number
  generateNodeId: () => string
  generateEdgeId: () => string
  generateMarkupId?: () => string
  addNode: (node: AnyNode) => void
  addEdge: (edge: Edge) => void
  addMarkup?: (markup: CanvasMarkup) => void
}

export type ClipboardApplyResult = {
  newNodeIds: string[]
  newEdgeIds: string[]
  newMarkupIds: string[]
}

export const applyClipboardPayload = ({
  payload,
  target,
  offset = 32,
  generateNodeId,
  generateEdgeId,
  generateMarkupId,
  addNode,
  addEdge,
  addMarkup,
}: ClipboardApplyOptions): ClipboardApplyResult => {
  const baseOrigin = payload.origin ?? {
    x: payload.nodes[0]?.x ?? target.x,
    y: payload.nodes[0]?.y ?? target.y,
  }
  const translation = {
    x: target.x - baseOrigin.x + offset,
    y: target.y - baseOrigin.y + offset,
  }

  const idMap = new Map<string, string>()
  const newNodeIds: string[] = []
  for (const node of payload.nodes) {
    const clone = JSON.parse(JSON.stringify(node)) as AnyNode
    const newId = generateNodeId()
    idMap.set(node.id, newId)
    clone.id = newId
    if (typeof clone.x === 'number') clone.x += translation.x
    else clone.x = translation.x
    if (typeof clone.y === 'number') clone.y += translation.y
    else clone.y = translation.y
    if (clone.name) {
      clone.name = `${clone.name} Copy`
    }
    addNode(clone)
    newNodeIds.push(newId)
  }

  const newEdgeIds: string[] = []
  for (const edge of payload.edges) {
    const source = idMap.get(edge.from)
    const targetId = idMap.get(edge.to)
    if (!source || !targetId) continue
    const clone = JSON.parse(JSON.stringify(edge)) as Edge
    clone.id = generateEdgeId()
    clone.from = source
    clone.to = targetId
    if (typeof clone.midpointX === 'number' && Number.isFinite(clone.midpointX)) {
      clone.midpointX += translation.x
    }
    addEdge(clone)
    newEdgeIds.push(clone.id)
  }

  const newMarkupIds: string[] = []
  if (payload.markups.length && addMarkup && generateMarkupId) {
    for (const markup of payload.markups) {
      const clone = JSON.parse(JSON.stringify(markup)) as CanvasMarkup
      clone.id = generateMarkupId()
      if (clone.type === 'text' || clone.type === 'rectangle') {
        clone.position = {
          x: clone.position.x + translation.x,
          y: clone.position.y + translation.y,
        }
      } else if (clone.type === 'line') {
        clone.start = { x: clone.start.x + translation.x, y: clone.start.y + translation.y }
        clone.end = { x: clone.end.x + translation.x, y: clone.end.y + translation.y }
      }
      addMarkup(clone)
      newMarkupIds.push(clone.id)
    }
  }

  return { newNodeIds, newEdgeIds, newMarkupIds }
}

