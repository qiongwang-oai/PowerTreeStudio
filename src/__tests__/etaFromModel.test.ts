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

  it('performs bilinear interpolation for 2d tables', () => {
    const model: EfficiencyModel = {
      type: 'curve',
      mode: '2d',
      table: {
        outputVoltages: [1, 2],
        outputCurrents: [0, 10],
        values: [
          [0.8, 0.9],
          [0.82, 0.94],
        ],
      },
    }
    const eta = etaFromModel(model, 0, 5, { Vout: 1.5 })
    expect(eta).toBeCloseTo(0.865, 3)
  })

  it('matches an exact voltage row in 2d mode', () => {
    const model: EfficiencyModel = {
      type: 'curve',
      mode: '2d',
      table: {
        outputVoltages: [1, 2],
        outputCurrents: [0, 10],
        values: [
          [0.8, 0.9],
          [0.82, 0.94],
        ],
      },
    }
    const eta = etaFromModel(model, 0, 5, { Vout: 2 })
    expect(eta).toBeCloseTo(0.88, 3)
  })

  it('matches an exact current column in 2d mode', () => {
    const model: EfficiencyModel = {
      type: 'curve',
      mode: '2d',
      table: {
        outputVoltages: [1, 2],
        outputCurrents: [0, 10],
        values: [
          [0.8, 0.9],
          [0.82, 0.94],
        ],
      },
    }
    const eta = etaFromModel(model, 0, 10, { Vout: 1.5 })
    expect(eta).toBeCloseTo(0.92, 3)
  })

  it('clamps voltage below and above the 2d table range', () => {
    const model: EfficiencyModel = {
      type: 'curve',
      mode: '2d',
      table: {
        outputVoltages: [1, 2],
        outputCurrents: [0, 10],
        values: [
          [0.8, 0.9],
          [0.82, 0.94],
        ],
      },
    }
    expect(etaFromModel(model, 0, 10, { Vout: 0.5 })).toBeCloseTo(0.9, 3)
    expect(etaFromModel(model, 0, 10, { Vout: 3 })).toBeCloseTo(0.94, 3)
  })

  it('clamps current below and above the 2d table range', () => {
    const model: EfficiencyModel = {
      type: 'curve',
      mode: '2d',
      table: {
        outputVoltages: [1.2],
        outputCurrents: [0, 10],
        values: [[0.81, 0.9]],
      },
    }
    expect(etaFromModel(model, 0, -5, { Vout: 1.2 })).toBeCloseTo(0.81, 3)
    expect(etaFromModel(model, 0, 25, { Vout: 1.2 })).toBeCloseTo(0.9, 3)
  })

  it('scales 2d per-phase curves using total current and phase count', () => {
    const model: EfficiencyModel = {
      type: 'curve',
      mode: '2d',
      perPhase: true,
      table: {
        outputVoltages: [1.0],
        outputCurrents: [0, 20, 40],
        values: [[0.88, 0.93, 0.96]],
      },
    }
    const eta = etaFromModel(model, 0, 90, { Vout: 1.0, phaseCount: 3 })
    expect(eta).toBeCloseTo(0.945, 3)
  })

  it('ignores empty 2d cells instead of treating them as zero', () => {
    const model: EfficiencyModel = {
      type: 'curve',
      mode: '2d',
      table: {
        outputVoltages: [1.0, 1.8],
        outputCurrents: [0, 10, 20],
        values: [
          [0.8, null, 0.9],
          [0.82, 0.9, null],
        ],
      },
    }
    const eta = etaFromModel(model, 0, 10, { Vout: 1.8 })
    expect(eta).toBeCloseTo(0.9, 3)
    expect(eta).toBeGreaterThan(0.1)
  })
})
