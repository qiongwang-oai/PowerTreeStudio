import type { ReactFlowInstance } from 'reactflow'

export const KEYBOARD_PAN_COARSE_STEP = 160
export const KEYBOARD_PAN_FINE_STEP = 40

export type KeyboardPanIntent = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

export type KeyboardPanConfig = {
  /** Keys that, when pressed with an arrow, force panning even if a selection exists. */
  overrideKeys?: string[]
  /** Optional predicate hook to support custom override logic. */
  overridePredicate?: (event: KeyboardEvent) => boolean
}

export type KeyboardPanDelta = {
  dx: number
  dy: number
}

export const DEFAULT_PAN_OVERRIDE_KEYS = [' ', 'Space', 'Spacebar'] as const

export const defaultKeyboardPanConfig: Readonly<KeyboardPanConfig> = Object.freeze({
  overrideKeys: [...DEFAULT_PAN_OVERRIDE_KEYS],
})

let activeKeyboardPanConfig: KeyboardPanConfig = {
  overrideKeys: [...DEFAULT_PAN_OVERRIDE_KEYS],
}

const cloneOverrideKeys = (keys?: string[]): string[] | undefined =>
  keys ? [...keys] : undefined

export function getKeyboardPanConfig(): KeyboardPanConfig {
  return {
    overrideKeys: cloneOverrideKeys(activeKeyboardPanConfig.overrideKeys),
    overridePredicate: activeKeyboardPanConfig.overridePredicate,
  }
}

export function setKeyboardPanConfig(config?: KeyboardPanConfig | null): void {
  if (!config) {
    activeKeyboardPanConfig = {
      overrideKeys: [...DEFAULT_PAN_OVERRIDE_KEYS],
      overridePredicate: undefined,
    }
    return
  }

  activeKeyboardPanConfig = {
    overrideKeys: config.overrideKeys ? [...config.overrideKeys] : [...DEFAULT_PAN_OVERRIDE_KEYS],
    overridePredicate: config.overridePredicate,
  }
}

export function getKeyboardPanIntent(event: KeyboardEvent): KeyboardPanIntent | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null
  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
      return event.key
    default:
      return null
  }
}

export function isKeyboardPanOverrideActive(event: KeyboardEvent, config?: KeyboardPanConfig): boolean {
  const resolvedConfig = config ?? activeKeyboardPanConfig
  if (resolvedConfig.overrideKeys && resolvedConfig.overrideKeys.some(key => key === event.key)) {
    return true
  }
  if (resolvedConfig.overridePredicate) {
    return resolvedConfig.overridePredicate(event)
  }
  return false
}

export function getKeyboardPanTranslation(intent: KeyboardPanIntent, event: KeyboardEvent, viewportZoom: number): KeyboardPanDelta {
  const baseStep = event.shiftKey ? KEYBOARD_PAN_FINE_STEP : KEYBOARD_PAN_COARSE_STEP
  const zoom = Number.isFinite(viewportZoom) && viewportZoom > 1e-6 ? viewportZoom : 1
  const step = baseStep / zoom

  switch (intent) {
    case 'ArrowLeft':
      return { dx: step, dy: 0 }
    case 'ArrowRight':
      return { dx: -step, dy: 0 }
    case 'ArrowUp':
      return { dx: 0, dy: step }
    case 'ArrowDown':
      return { dx: 0, dy: -step }
    default:
      return { dx: 0, dy: 0 }
  }
}

export type ApplyKeyboardPanOptions = {
  /** Optional animation duration for React Flow's d3 zoom helper. */
  duration?: number
}

export function applyKeyboardPan(instance: ReactFlowInstance | null, delta: KeyboardPanDelta, options?: ApplyKeyboardPanOptions): boolean {
  if (!instance || typeof instance.setViewport !== 'function' || typeof instance.getViewport !== 'function') {
    return false
  }

  const viewport = instance.getViewport()
  if (!viewport || !Number.isFinite(viewport.x) || !Number.isFinite(viewport.y) || !Number.isFinite(viewport.zoom)) {
    return false
  }

  const next = {
    x: viewport.x + delta.dx,
    y: viewport.y + delta.dy,
    zoom: viewport.zoom,
  }

  if (Number.isNaN(next.x) || Number.isNaN(next.y)) {
    return false
  }

  instance.setViewport(next, options)
  return true
}


