import { Position } from 'reactflow'

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const SIGN_EPSILON = 1e-6

export type SegmentOrientation = 'horizontal' | 'vertical'

export type OrthogonalPoint = { x: number; y: number }

export type OrthogonalSegment = {
  start: OrthogonalPoint
  end: OrthogonalPoint
  orientation: SegmentOrientation
}

export type OrthogonalGeometry = {
  path: string
  segments: OrthogonalSegment[]
  midSegment: OrthogonalSegment
  midSegmentLength: number
  handlePoint: OrthogonalPoint
  axisStart: number
  axisEnd: number
}

export type OrthogonalGeometryInput = {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition?: Position
  targetPosition?: Position
  midpointOffset?: number
  midpointXOverride?: number
}

export function computeOrthogonalGeometry(input: OrthogonalGeometryInput): OrthogonalGeometry {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition = Position.Right,
    targetPosition = Position.Left,
    midpointOffset = 0.5,
    midpointXOverride,
  } = input

  const sourceAxis = sourcePosition === Position.Left || sourcePosition === Position.Right ? 'x' : 'y'
  const targetAxis = targetPosition === Position.Left || targetPosition === Position.Right ? 'x' : 'y'

  const clampedOffset = clamp01(Number.isFinite(midpointOffset) ? midpointOffset : 0.5)

  const deltaPrimary = sourceAxis === 'y' ? targetY - sourceY : targetX - sourceX
  const direction = deltaPrimary >= 0 ? 1 : -1
  const safeDeltaPrimary = Math.abs(deltaPrimary) < SIGN_EPSILON
    ? direction * 80
    : deltaPrimary

  const desiredMidpointX = typeof midpointXOverride === 'number' && Number.isFinite(midpointXOverride)
    ? midpointXOverride
    : undefined

  const firstPoint = sourceAxis === 'y'
    ? { x: sourceX, y: sourceY + safeDeltaPrimary * clampedOffset }
    : { x: desiredMidpointX ?? sourceX + safeDeltaPrimary * clampedOffset, y: sourceY }

  const secondPoint = targetAxis === 'y'
    ? { x: targetX, y: firstPoint.y }
    : { x: firstPoint.x, y: targetY }

  const segmentOneOrientation: SegmentOrientation = sourceAxis === 'y' ? 'vertical' : 'horizontal'
  const segmentThreeOrientation: SegmentOrientation = targetAxis === 'y' ? 'vertical' : 'horizontal'

  const midSegmentOrientation: SegmentOrientation = Math.abs(secondPoint.x - firstPoint.x) < SIGN_EPSILON
    ? 'vertical'
    : 'horizontal'

  const midSegmentLength = midSegmentOrientation === 'vertical'
    ? Math.abs(secondPoint.y - firstPoint.y)
    : Math.abs(secondPoint.x - firstPoint.x)

  const handlePoint: OrthogonalPoint = midSegmentOrientation === 'vertical'
    ? { x: firstPoint.x, y: (firstPoint.y + secondPoint.y) / 2 }
    : { x: (firstPoint.x + secondPoint.x) / 2, y: firstPoint.y }

  const path = `M ${sourceX} ${sourceY} L ${firstPoint.x} ${firstPoint.y} L ${secondPoint.x} ${secondPoint.y} L ${targetX} ${targetY}`

  const axisStart = sourceAxis === 'y' ? sourceY : sourceX
  let axisEnd = sourceAxis === 'y' ? targetY : targetX
  if (Math.abs(deltaPrimary) < SIGN_EPSILON) {
    axisEnd = axisStart + safeDeltaPrimary
  }

  const segments: OrthogonalSegment[] = [
    {
      start: { x: sourceX, y: sourceY },
      end: firstPoint,
      orientation: segmentOneOrientation,
    },
    {
      start: firstPoint,
      end: secondPoint,
      orientation: midSegmentOrientation,
    },
    {
      start: secondPoint,
      end: { x: targetX, y: targetY },
      orientation: segmentThreeOrientation,
    },
  ]

  return {
    path,
    segments,
    midSegment: segments[1],
    midSegmentLength,
    handlePoint,
    axisStart,
    axisEnd,
  }
}

export const distanceToPoint = (point: OrthogonalPoint, other: OrthogonalPoint): number =>
  Math.hypot(point.x - other.x, point.y - other.y)


