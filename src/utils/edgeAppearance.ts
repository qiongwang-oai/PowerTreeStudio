import type { Edge } from '../models'

export const DEFAULT_EDGE_STROKE_WIDTH = 3
export const MIN_EDGE_STROKE_WIDTH = 0.5
export const MAX_EDGE_STROKE_WIDTH = 16

export const clampEdgeStrokeWidth = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_EDGE_STROKE_WIDTH
  return Math.min(MAX_EDGE_STROKE_WIDTH, Math.max(MIN_EDGE_STROKE_WIDTH, value))
}

type EdgeLike = Pick<Edge, 'strokeWidth' | 'strokeColor'> | null | undefined

export const resolveEdgeStrokeWidth = (edge: EdgeLike): number => {
  if (!edge) return DEFAULT_EDGE_STROKE_WIDTH
  const raw = Number(edge.strokeWidth)
  if (!Number.isFinite(raw)) return DEFAULT_EDGE_STROKE_WIDTH
  return clampEdgeStrokeWidth(raw)
}

export const resolveEdgeStrokeColor = (edge: EdgeLike, fallback: string): string => {
  const candidate = edge?.strokeColor
  if (typeof candidate !== 'string') return fallback
  const trimmed = candidate.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

