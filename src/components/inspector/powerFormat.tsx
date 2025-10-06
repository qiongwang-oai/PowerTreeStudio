import React from 'react'
import { formatPower, powerTooltipLabel } from '../../utils/format'

export function renderPowerDisplay(value: unknown, className?: string): React.ReactNode {
  const combinedClass = ['tabular-nums', className].filter(Boolean).join(' ')
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return <span className={combinedClass}>—</span>
  }
  const formatted = formatPower(value)
  return (
    <span className={combinedClass} title={powerTooltipLabel(value)}>
      {formatted.value} {formatted.unit}
    </span>
  )
}

export function formatPowerText(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }
  const formatted = formatPower(value)
  return `${formatted.value} ${formatted.unit}`
}

