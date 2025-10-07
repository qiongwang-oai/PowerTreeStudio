import type { Edge, Project } from '../models'

type Coord = { x: number; y: number }

const roundKey = (value: number): string => {
  if (!Number.isFinite(value)) return '0'
  return Math.round(value).toString()
}

export const computeOrderedEdgeMidpoints = (
  project: Project,
  coords: Map<string, Coord>
): Edge[] => {
  const grouped = new Map<string, Array<{ edge: Edge; source: Coord; target: Coord }>>()
  const untouched: Edge[] = []

  for (const edge of project.edges) {
    const source = coords.get(edge.from)
    const target = coords.get(edge.to)
    if (!source || !target) {
      untouched.push({ ...edge })
      continue
    }
    const key = `${roundKey(source.x)}->${roundKey(target.x)}`
    const bucket = grouped.get(key)
    const entry = { edge, source, target }
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
        const ratio = (index + 1) / (total + 1)
        const offset = deltaX > 0 ? ratio : 1 - ratio
        const clamped = Math.max(0, Math.min(1, offset))
        next.midpointOffset = clamped
        next.midpointX = source.x + deltaX * clamped
      }

      results.push(next)
    }
  }

  return [...results, ...untouched]
}


