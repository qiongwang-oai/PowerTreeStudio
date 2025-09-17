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

  it('throws when content is not a project object', () => {
    expect(() => parseProjectText('not a project')).toThrowError(/Unable to parse project file|object at the top level/)
  })
})
