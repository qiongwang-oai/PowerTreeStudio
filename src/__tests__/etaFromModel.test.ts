import { describe, it, expect } from 'vitest'
import { etaFromModel } from '../calc'
import type { EfficiencyModel } from '../models'

describe('etaFromModel', () => {
  it('interpolates per-phase curves using total current and phase count', () => {
    const model: EfficiencyModel = {
      type: 'curve',
      base: 'Iout_max',
      perPhase: true,
      points: [
        { current: 0, eta: 0.88 },
        { current: 20, eta: 0.93 },
        { current: 40, eta: 0.96 },
      ],
    }
    const eta = etaFromModel(model, 0, 90, { Iout_max: 120, phaseCount: 3 })
    expect(eta).toBeCloseTo(0.945, 3)
  })

  it('uses overall data when perPhase is false', () => {
    const model: EfficiencyModel = {
      type: 'curve',
      base: 'Iout_max',
      points: [
        { current: 0, eta: 0.9 },
        { current: 60, eta: 0.95 },
        { current: 120, eta: 0.97 },
      ],
    }
    const eta = etaFromModel(model, 0, 90, { Iout_max: 120, phaseCount: 3 })
    expect(eta).toBeCloseTo(0.96, 3)
  })

  it('scales per-phase data when using output power as the base', () => {
    const model: EfficiencyModel = {
      type: 'curve',
      base: 'Pout_max',
      perPhase: true,
      points: [
        { loadPct: 50, eta: 0.94 },
        { loadPct: 100, eta: 0.97 },
      ],
    }
    const eta = etaFromModel(model, 1500, 0, { Pout_max: 2000, phaseCount: 2 })
    expect(eta).toBeCloseTo(0.955, 3)
  })
})
