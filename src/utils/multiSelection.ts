import type { InspectorSelection, MultiSelection } from '../types/selection'

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

export const emptyMultiSelection = (): MultiSelection => ({
  kind: 'multi',
  nodes: [],
  edges: [],
  markups: [],
})

const normalizeList = (list: string[]): string[] => Array.from(new Set(list))

const toggleId = (list: string[], id: string): string[] => {
  const index = list.indexOf(id)
  if (index === -1) {
    return [...list, id]
  }
  return [...list.slice(0, index), ...list.slice(index + 1)]
}

export const ensureMultiSelection = (
  selection: MultiSelection | null | undefined
): MultiSelection => {
  if (selection && selection.kind === 'multi') {
    return {
      kind: 'multi',
      nodes: normalizeList(selection.nodes),
      edges: normalizeList(selection.edges),
      markups: normalizeList(selection.markups),
    }
  }
  return emptyMultiSelection()
}

export const multiSelectionFromInspector = (
  selection: InspectorSelection | null
): MultiSelection => {
  if (!selection) return emptyMultiSelection()
  if (selection.kind === 'node' || selection.kind === 'nested-node') {
    return { ...emptyMultiSelection(), nodes: [selection.kind === 'node' ? selection.id : selection.nodeId] }
  }
  if (selection.kind === 'edge' || selection.kind === 'nested-edge') {
    return { ...emptyMultiSelection(), edges: [selection.kind === 'edge' ? selection.id : selection.edgeId] }
  }
  if (selection.kind === 'markup') {
    return { ...emptyMultiSelection(), markups: [selection.id] }
  }
  if (selection.kind === 'multi') {
    return ensureMultiSelection(selection)
  }
  return emptyMultiSelection()
}

type TogglePayload =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'markup'; id: string }

export const toggleInMultiSelection = (
  selection: MultiSelection,
  payload: TogglePayload
): MultiSelection => {
  const base = ensureMultiSelection(selection)
  switch (payload.kind) {
    case 'node':
      return {
        kind: 'multi',
        nodes: toggleId(base.nodes, payload.id),
        edges: base.edges,
        markups: base.markups,
      }
    case 'edge':
      return {
        kind: 'multi',
        nodes: base.nodes,
        edges: toggleId(base.edges, payload.id),
        markups: base.markups,
      }
    case 'markup':
      return {
        kind: 'multi',
        nodes: base.nodes,
        edges: base.edges,
        markups: toggleId(base.markups, payload.id),
      }
    default:
      return base
  }
}

export const normalizeMultiSelection = (selection: MultiSelection | null | undefined): MultiSelection | null => {
  if (!selection) return null
  const normalized = ensureMultiSelection(selection)
  return selectionHasItems(normalized) ? normalized : null
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

