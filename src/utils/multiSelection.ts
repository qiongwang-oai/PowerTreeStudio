import type { MultiSelection } from '../types/selection'

export type Bounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export const mergeMultiSelections = (
  base: MultiSelection | null,
  addition: MultiSelection
): MultiSelection => {
  const union = (a: string[], b: string[]) => Array.from(new Set([...(a ?? []), ...b]))
  return {
    kind: 'multi',
    nodes: union(base?.nodes ?? [], addition.nodes),
    edges: union(base?.edges ?? [], addition.edges),
    markups: union(base?.markups ?? [], addition.markups),
  }
}

export const selectionHasItems = (selection: MultiSelection | null | undefined): boolean => {
  if (!selection) return false
  return Boolean(selection.nodes.length || selection.edges.length || selection.markups.length)
}

export const normalizeBounds = (
  a: { x: number; y: number },
  b: { x: number; y: number }
): Bounds => ({
  minX: Math.min(a.x, b.x),
  maxX: Math.max(a.x, b.x),
  minY: Math.min(a.y, b.y),
  maxY: Math.max(a.y, b.y),
})

export const boundsIntersects = (a: Bounds, b: Bounds): boolean => {
  if (a.maxX < b.minX || a.minX > b.maxX) return false
  if (a.maxY < b.minY || a.minY > b.maxY) return false
  return true
}

export const pointsToBounds = (points: { x: number; y: number }[]): Bounds => {
  if (!points.length) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  }
  let minX = points[0].x
  let maxX = points[0].x
  let minY = points[0].y
  let maxY = points[0].y
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }
  return { minX, maxX, minY, maxY }
}

