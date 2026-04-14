import type { LoadNode, Scenario } from '../models'

export type LoadCurrentDisplay = {
  label: 'I_typ' | 'I_max' | 'I_idle'
  text: string
}

export function loadCurrentFieldForScenario(scenario: Scenario): LoadCurrentDisplay['label'] {
  if (scenario === 'Max') return 'I_max'
  if (scenario === 'Idle') return 'I_idle'
  return 'I_typ'
}

export function formatLoadCurrentValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}A`
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return `${value}A`
  return '—'
}

export function getScenarioLoadCurrentDisplay(load: LoadNode | Record<string, unknown>, scenario: Scenario): LoadCurrentDisplay {
  const label = loadCurrentFieldForScenario(scenario)
  return {
    label,
    text: formatLoadCurrentValue((load as any)[label]),
  }
}
