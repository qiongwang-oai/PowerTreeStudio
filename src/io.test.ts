import { describe, expect, it } from 'vitest'
import { parseProjectText, serializeProject } from './io'
import { Project } from './models'

const baseProject: Project = {
  id: 'demo',
  name: 'Demo Project',
  units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
  defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 5 },
  scenarios: ['Typical', 'Max'],
  currentScenario: 'Typical',
  nodes: [],
  edges: []
}

const projectWith2DEfficiency: Project = {
  ...baseProject,
  id: 'demo-2d',
  nodes: [
    {
      id: 'conv-2d',
      type: 'Converter',
      name: 'POL',
      Vin_min: 10,
      Vin_max: 14,
      Vout: 1.8,
      Iout_max: 30,
      efficiency: {
        type: 'curve',
        mode: '2d',
        table: {
          outputVoltages: [1.2, 1.8],
          outputCurrents: [0, 10, 20],
          values: [
            [0.8, 0.87, 0.9],
            [0.82, 0.9, 0.93],
          ],
        },
      },
    } as any,
  ],
}

const legacyCurveProject: Project = {
  ...baseProject,
  id: 'demo-legacy-curve',
  nodes: [
    {
      id: 'conv-legacy',
      type: 'Converter',
      name: 'Legacy Curve',
      Vin_min: 10,
      Vin_max: 14,
      Vout: 5,
      Iout_max: 20,
      efficiency: {
        type: 'curve',
        base: 'Iout_max',
        points: [
          { current: 0, eta: 0.85 },
          { current: 20, eta: 0.92 },
        ],
      },
    } as any,
  ],
}

describe('io serialization helpers', () => {
  it('exports to YAML by default and parses back to the same project', () => {
    const yaml = serializeProject(baseProject)
    expect(yaml).toContain('name: Demo Project')

    const parsed = parseProjectText(yaml)
    expect(parsed).toEqual(baseProject)
  })

  it('exports to JSON when requested', () => {
    const json = serializeProject(baseProject, 'json')
    expect(json.trim().startsWith('{')).toBe(true)

    const parsed = parseProjectText(json)
    expect(parsed).toEqual(baseProject)
  })

  it('round-trips a 2d efficiency model through JSON', () => {
    const json = serializeProject(projectWith2DEfficiency, 'json')
    const parsed = parseProjectText(json)
    expect(parsed).toEqual(projectWith2DEfficiency)
  })

  it('round-trips a 2d efficiency model through YAML', () => {
    const yaml = serializeProject(projectWith2DEfficiency)
    const parsed = parseProjectText(yaml)
    expect(parsed).toEqual(projectWith2DEfficiency)
  })

  it('preserves legacy 1d curve models during round-trip', () => {
    const yaml = serializeProject(legacyCurveProject)
    const parsed = parseProjectText(yaml)
    expect(parsed).toEqual(legacyCurveProject)
  })

  it('throws when content is not a project object', () => {
    expect(() => parseProjectText('not a project')).toThrowError(/Unable to parse project file|object at the top level/)
  })
})
