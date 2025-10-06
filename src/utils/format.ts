export type FormatPowerOptions = {
  precision?: number
  trimTrailingZeros?: boolean
}

export type FormattedPower = {
  value: string
  unit: string
}

const POWER_UNITS: Array<{ unit: string; factor: number }> = [
  { unit: 'TW', factor: 1e12 },
  { unit: 'GW', factor: 1e9 },
  { unit: 'MW', factor: 1e6 },
  { unit: 'kW', factor: 1e3 },
  { unit: 'W', factor: 1 },
  { unit: 'mW', factor: 1e-3 },
  { unit: 'uW', factor: 1e-6 },
]

const DEFAULT_PRECISION = 2

function trimZeros(value: string): string {
  if (!value.includes('.')) return value
  return value.replace(/\.0+$/, '').replace(/(\.[0-9]*[1-9])0+$/, '$1')
}

export function formatPower(watts: number, options: FormatPowerOptions = {}): FormattedPower {
  const { precision = DEFAULT_PRECISION, trimTrailingZeros = true } = options

  if (!Number.isFinite(watts) || Number.isNaN(watts)) {
    return { value: '0', unit: 'W' }
  }

  const sign = watts < 0 ? '-' : ''
  const magnitude = Math.abs(watts)

  if (magnitude === 0) {
    return { value: '0', unit: 'W' }
  }

  const smallestUnit = POWER_UNITS[POWER_UNITS.length - 1]

  if (magnitude < smallestUnit.factor) {
    const numeric = magnitude.toExponential(precision)
    return { value: `${sign}${numeric}`, unit: 'W' }
  }

  for (const { unit, factor } of POWER_UNITS) {
    if (magnitude >= factor || unit === smallestUnit.unit) {
      const scaled = magnitude / factor
      let formatted = scaled.toFixed(precision)
      if (trimTrailingZeros) {
        formatted = trimZeros(formatted)
      }
      return { value: `${sign}${formatted}`, unit }
    }
  }

  return { value: `${sign}${magnitude.toString()}`, unit: 'W' }
}

export function powerTooltipLabel(watts: number): string {
  if (!Number.isFinite(watts)) return 'Not available'
  return `${watts.toLocaleString(undefined, { maximumFractionDigits: 6 })} W`
}

