import { describe, expect, it } from 'vitest'
import { compute } from '../calc'
import type { Project } from '../models'

describe('compute malformed project guards', () => {
  it('does not throw when nodes and edges are missing', () => {
    const malformed = {
      id: 'bad-project',
      name: 'Bad Project',
      units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
      defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 5 },
      scenarios: ['Typical'],
      currentScenario: 'Typical',
    } as Project

    const result = compute(malformed)

    expect(result.nodes).toEqual({})
    expect(result.edges).toEqual({})
    expect(result.globalWarnings).toContain('Project nodes were missing; using an empty node list.')
    expect(result.globalWarnings).toContain('Project interconnects were missing; using an empty edge list.')
  })
})
