export const KEYBOARD_NUDGE_COARSE_STEP = 10
export const KEYBOARD_NUDGE_FINE_STEP = 1

export type KeyboardNudgeDelta = {
  dx: number
  dy: number
}

export type CanvasBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const DEFAULT_CANVAS_BOUNDS: CanvasBounds = {
  minX: 0,
  minY: 0,
  maxX: 40000,
  maxY: 40000,
}

export const DEFAULT_SUBSYSTEM_BOUNDS: CanvasBounds = {
  minX: 0,
  minY: 0,
  maxX: 20000,
  maxY: 20000,
}

export function getKeyboardNudgeDeltaForEvent(event: KeyboardEvent): KeyboardNudgeDelta | null {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return null
  }

  const step = event.shiftKey ? KEYBOARD_NUDGE_FINE_STEP : KEYBOARD_NUDGE_COARSE_STEP

  switch (event.key) {
    case 'ArrowUp':
      return { dx: 0, dy: -step }
    case 'ArrowDown':
      return { dx: 0, dy: step }
    case 'ArrowLeft':
      return { dx: -step, dy: 0 }
    case 'ArrowRight':
      return { dx: step, dy: 0 }
    default:
      return null
  }
}

const clampAxis = (value: number, min: number, max: number): { value: number; clamped: boolean } => {
  let clamped = false
  let next = value

  if (value < min) {
    next = min
    clamped = true
  } else if (value > max) {
    next = max
    clamped = true
  }

  return { value: next, clamped }
}

export function clampPointToBounds(point: { x: number; y: number }, bounds: CanvasBounds): {
  point: { x: number; y: number }
  clamped: boolean
} {
  const clampX = clampAxis(point.x, bounds.minX, bounds.maxX)
  const clampY = clampAxis(point.y, bounds.minY, bounds.maxY)

  return {
    point: { x: clampX.value, y: clampY.value },
    clamped: clampX.clamped || clampY.clamped,
  }
}

export type EdgeMidpointNudgeInput = {
  currentMidpoint: number | null | undefined
  deltaX: number
  startX: number
  endX: number
}

export type EdgeMidpointNudgeResult = {
  midpointX: number
  midpointOffset: number
  clamped: boolean
}

export function computeEdgeMidpointNudge({ currentMidpoint, deltaX, startX, endX }: EdgeMidpointNudgeInput): EdgeMidpointNudgeResult | null {
  if (!Number.isFinite(deltaX)) return null
  if (!Number.isFinite(startX) || !Number.isFinite(endX)) return null
  if (Math.abs(endX - startX) < 1e-3) return null

  const span = endX - startX
  const minX = Math.min(startX, endX)
  const maxX = Math.max(startX, endX)
  const baseMidpoint = Number.isFinite(currentMidpoint)
    ? (currentMidpoint as number)
    : startX + span * 0.5

  const proposed = baseMidpoint + deltaX
  const clampedValue = Math.min(maxX, Math.max(minX, proposed))
  const clamped = clampedValue !== proposed

  const offsetRaw = (clampedValue - startX) / span
  const midpointOffset = Math.min(1, Math.max(0, offsetRaw))

  return {
    midpointX: clampedValue,
    midpointOffset,
    clamped,
  }
}

