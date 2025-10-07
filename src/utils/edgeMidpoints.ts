import type { AnyNode, Edge, Project } from '../models'

type Coord = { x: number; y: number }

const DEFAULT_WIDTH = 200

const widthByType: Partial<Record<AnyNode['type'], number>> = {
  Load: 236,
  Converter: 210,
  Source: 190,
  SubsystemInput: 200,
  Subsystem: 240,
  Bus: 200,
  DualOutputConverter: 240,
  Note: 240,
}

const getNodeWidth = (node: AnyNode | undefined): number => {
  if (!node) return DEFAULT_WIDTH
  const raw = Number((node as any).width)
  if (Number.isFinite(raw) && raw > 0) {
    return raw
  }
  const fallback = widthByType[node.type]
  return typeof fallback === 'number' ? fallback : DEFAULT_WIDTH
}

export const computeOrderedEdgeMidpoints = (
  project: Project,
  coords: Map<string, Coord>
): Edge[] => {
  const nodesById = new Map<string, AnyNode>(project.nodes.map(node => [node.id, node as AnyNode]))
  const grouped = new Map<string, Array<{ edge: Edge; source: Coord; target: Coord }>>()
  const untouched: Edge[] = []

  for (const edge of project.edges) {
    const source = coords.get(edge.from)
    const target = coords.get(edge.to)
    if (!source || !target) {
      untouched.push({ ...edge })
      continue
    }
    const sourceNode = nodesById.get(edge.from)
    const targetNode = nodesById.get(edge.to)
    const rawDelta = (target.x ?? 0) - (source.x ?? 0)
    const sourceHandleX = rawDelta >= 0 ? source.x + getNodeWidth(sourceNode) : source.x
    const targetHandleX = rawDelta >= 0 ? target.x : target.x + getNodeWidth(targetNode)
    const adjustedSource: Coord = { x: sourceHandleX, y: source.y }
    const adjustedTarget: Coord = { x: targetHandleX, y: target.y }
    const minX = Math.min(adjustedSource.x, adjustedTarget.x)
    const maxX = Math.max(adjustedSource.x, adjustedTarget.x)
    const key = `${Math.round(minX)}->${Math.round(maxX)}`
    const bucket = grouped.get(key)
    const entry = { edge, source: adjustedSource, target: adjustedTarget }
    if (bucket) bucket.push(entry)
    else grouped.set(key, [entry])
  }

  const results: Edge[] = []

  for (const entries of grouped.values()) {
    const sorted = entries.slice().sort((a, b) => a.source.y - b.source.y)
    const total = sorted.length
    if (total === 0) continue
    for (let index = 0; index < total; index += 1) {
      const { edge, source, target } = sorted[index]
      const next: Edge = { ...edge }
      const deltaX = target.x - source.x

      if (Math.abs(deltaX) < 1e-6) {
        next.midpointOffset = 0.5
        next.midpointX = source.x
      } else {
        const spacing = deltaX > 0 ? index + 1 : total - index
        const baseOffset = Math.max(0, Math.min(1, spacing / (total + 1)))
        const offset = deltaX > 0 ? baseOffset : 1 - baseOffset
        const minX = Math.min(source.x, target.x)
        const maxX = Math.max(source.x, target.x)
        next.midpointOffset = offset
        next.midpointX = minX + (maxX - minX) * offset
      }

      results.push(next)
    }
  }

  return [...results, ...untouched]
}


