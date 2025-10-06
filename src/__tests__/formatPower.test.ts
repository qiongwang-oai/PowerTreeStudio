import { describe, expect, it } from 'vitest'
import { formatPower, powerTooltipLabel } from '../utils/format'

describe('formatPower', () => {
  it('returns watts for small values', () => {
    expect(formatPower(0)).toEqual({ value: '0', unit: 'W' })
    expect(formatPower(12)).toEqual({ value: '12', unit: 'W' })
  })

  it('scales up to kilowatts, megawatts, and terawatts', () => {
    expect(formatPower(1250)).toEqual({ value: '1.25', unit: 'kW' })
    expect(formatPower(3.6e6)).toEqual({ value: '3.6', unit: 'MW' })
    expect(formatPower(5e12)).toEqual({ value: '5', unit: 'TW' })
  })

  it('scales down to milliwatts and microwatts', () => {
    expect(formatPower(0.25)).toEqual({ value: '250', unit: 'mW' })
    expect(formatPower(0.00045)).toEqual({ value: '450', unit: 'uW' })
  })

  it('falls back to scientific notation when below one microwatt', () => {
    expect(formatPower(2e-8)).toEqual({ value: '2.00e-8', unit: 'W' })
  })

  it('preserves negative signs and respects precision options', () => {
    expect(formatPower(-4200)).toEqual({ value: '-4.2', unit: 'kW' })
    expect(formatPower(1500, { precision: 3, trimTrailingZeros: false })).toEqual({ value: '1.500', unit: 'kW' })
  })
})

describe('powerTooltipLabel', () => {
  it('returns a localized watt string', () => {
    const tooltip = powerTooltipLabel(1234.56789)
    expect(tooltip.endsWith(' W')).toBe(true)
    expect(tooltip.replace(/[^0-9.]/g, '')).toContain('1234')
  })

  it('handles non-finite values', () => {
    expect(powerTooltipLabel(Number.NaN)).toBe('Not available')
  })
})

