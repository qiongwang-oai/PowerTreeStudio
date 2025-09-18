import type { Edge } from '../models'

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export const edgeGroupKey = (edge: { from: string; fromHandle?: string | null }) => {
  const handle = edge.fromHandle ?? '__default'
  return `${edge.from}::${handle}`
}

export type EdgeGroupInfo = {
  offset: number
  midpointX?: number
}

export const computeEdgeGroupInfo = (edges: Edge[]): Map<string, EdgeGroupInfo> => {
  const info = new Map<string, EdgeGroupInfo>()

  for (const edge of edges) {
    const key = edgeGroupKey(edge)
    const candidateOffset = (typeof edge.midpointOffset === 'number' && Number.isFinite(edge.midpointOffset))
      ? clamp01(edge.midpointOffset)
      : undefined
    const candidateX = (typeof edge.midpointX === 'number' && Number.isFinite(edge.midpointX))
      ? edge.midpointX
      : undefined

    const existing = info.get(key)
    if (!existing) {
      info.set(key, {
        offset: candidateOffset ?? 0.5,
        midpointX: candidateX,
      })
      continue
    }

    if (existing.midpointX === undefined && candidateX !== undefined) {
      existing.midpointX = candidateX
    }

    if (candidateOffset !== undefined) {
      existing.offset = candidateOffset
    }
  }

  for (const value of info.values()) {
    value.offset = clamp01(value.offset)
  }

  return info
}
