import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  KEYBOARD_PAN_COARSE_STEP,
  KEYBOARD_PAN_FINE_STEP,
  applyKeyboardPan,
  getKeyboardPanIntent,
  getKeyboardPanTranslation,
  isKeyboardPanOverrideActive,
  setKeyboardPanConfig,
  type KeyboardPanConfig,
} from '../utils/keyboardPan'

const createKeyEvent = (key: string, overrides: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({ key, ...overrides } as KeyboardEvent)

afterEach(() => {
  setKeyboardPanConfig()
})

describe('keyboard pan helpers', () => {
  it('detects arrow key intents when no modifiers are pressed', () => {
    expect(getKeyboardPanIntent(createKeyEvent('ArrowLeft'))).toBe('ArrowLeft')
    expect(getKeyboardPanIntent(createKeyEvent('ArrowRight'))).toBe('ArrowRight')
    expect(getKeyboardPanIntent(createKeyEvent('ArrowUp'))).toBe('ArrowUp')
    expect(getKeyboardPanIntent(createKeyEvent('ArrowDown'))).toBe('ArrowDown')
  })

  it('ignores arrow keys with disallowed modifiers', () => {
    expect(getKeyboardPanIntent(createKeyEvent('ArrowLeft', { metaKey: true }))).toBeNull()
    expect(getKeyboardPanIntent(createKeyEvent('ArrowRight', { ctrlKey: true }))).toBeNull()
    expect(getKeyboardPanIntent(createKeyEvent('ArrowUp', { altKey: true }))).toBeNull()
  })

  it('identifies override keys using defaults and custom config', () => {
    expect(isKeyboardPanOverrideActive(createKeyEvent(' '))).toBe(true)
    expect(isKeyboardPanOverrideActive(createKeyEvent('Space'))).toBe(true)
    expect(isKeyboardPanOverrideActive(createKeyEvent('Shift'))).toBe(false)

    const config: KeyboardPanConfig = {
      overrideKeys: ['Shift'],
    }
    expect(isKeyboardPanOverrideActive(createKeyEvent('Shift'), config)).toBe(true)
    expect(isKeyboardPanOverrideActive(createKeyEvent(' '), config)).toBe(false)

    const predicateConfig: KeyboardPanConfig = {
      overridePredicate: event => event.metaKey === true,
    }
    expect(isKeyboardPanOverrideActive(createKeyEvent('ArrowRight', { metaKey: true }), predicateConfig)).toBe(true)
  })

  it('allows updating the active override configuration at runtime', () => {
    setKeyboardPanConfig({ overrideKeys: ['Tab'] })
    expect(isKeyboardPanOverrideActive(createKeyEvent('Tab'))).toBe(true)
    expect(isKeyboardPanOverrideActive(createKeyEvent(' '))).toBe(false)

    setKeyboardPanConfig({ overridePredicate: event => event.metaKey === true })
    expect(isKeyboardPanOverrideActive(createKeyEvent('ArrowLeft', { metaKey: true }))).toBe(true)
    expect(isKeyboardPanOverrideActive(createKeyEvent('ArrowLeft'))).toBe(false)
  })

  it('computes pan deltas honoring zoom and fine-coarse steps', () => {
    const coarse = getKeyboardPanTranslation('ArrowLeft', createKeyEvent('ArrowLeft'), 1)
    expect(coarse).toEqual({ dx: KEYBOARD_PAN_COARSE_STEP, dy: 0 })

    const fine = getKeyboardPanTranslation('ArrowDown', createKeyEvent('ArrowDown', { shiftKey: true }), 1)
    expect(fine).toEqual({ dx: 0, dy: -KEYBOARD_PAN_FINE_STEP })

    const zoomed = getKeyboardPanTranslation('ArrowRight', createKeyEvent('ArrowRight'), 2)
    expect(zoomed.dx).toBeCloseTo(-KEYBOARD_PAN_COARSE_STEP / 2)
    expect(zoomed.dy).toBe(0)
  })

  it('applies pan deltas through the React Flow instance', () => {
    const getViewport = vi.fn(() => ({ x: 10, y: 20, zoom: 1.5 }))
    const setViewport = vi.fn()
    const instance = {
      getViewport,
      setViewport,
    } as unknown as Parameters<typeof applyKeyboardPan>[0]

    const applied = applyKeyboardPan(instance, { dx: 40, dy: -30 })
    expect(applied).toBe(true)
    expect(setViewport).toHaveBeenCalledWith({ x: 50, y: -10, zoom: 1.5 }, undefined)
  })

  it('returns false when instance APIs are missing', () => {
    expect(applyKeyboardPan(null as unknown as Parameters<typeof applyKeyboardPan>[0], { dx: 1, dy: 1 })).toBe(false)

    const badInstance = {
      getViewport: () => ({ x: Number.NaN, y: 0, zoom: 1 }),
      setViewport: vi.fn(),
    }
    expect(applyKeyboardPan(badInstance as any, { dx: 1, dy: 1 })).toBe(false)
  })
})


