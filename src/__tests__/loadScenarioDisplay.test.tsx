import React from 'react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import SubsystemCanvas from '../components/subsystem/SubsystemCanvas'
import { QuickPresetDialogsProvider } from '../components/quick-presets/QuickPresetDialogsContext'
import { TooltipProvider } from '../components/ui/tooltip'
import type { Project } from '../models'
import { useStore } from '../state/store'
import { getScenarioLoadCurrentDisplay } from '../utils/loadScenarioDisplay'

const baseProject = (currentScenario: Project['currentScenario']): Project => ({
  id: `root-${currentScenario}`,
  name: 'Root',
  units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
  defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
  scenarios: ['Typical', 'Max', 'Idle'],
  currentScenario,
  nodes: [],
  edges: [],
})

const subsystemProject: Project = {
  id: 'subsystem-project',
  name: 'Subsystem',
  units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
  defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
  scenarios: ['Typical', 'Max', 'Idle'],
  currentScenario: 'Typical',
  nodes: [
    { id: 'in', type: 'SubsystemInput', name: 'VDD_IN', Vout: 5, x: 0, y: 0 },
    {
      id: 'load',
      type: 'Load',
      name: 'FPGA Load',
      Vreq: 5,
      I_typ: 1,
      I_idle: 0.2,
      I_max: 2,
      Utilization_typ: 100,
      Utilization_max: 100,
      x: 360,
      y: 0,
    },
  ] as any,
  edges: [{ id: 'edge', from: 'in', to: 'load', interconnect: { R_milliohm: 0 } }],
}

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  if (typeof window.ResizeObserver === 'undefined') {
    ;(window as typeof window & { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
  }

  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 1200,
        bottom: 800,
        width: 1200,
        height: 800,
        toJSON() {
          return {}
        },
      }
    },
  })
})

beforeEach(() => {
  useStore.getState().setProject(baseProject('Idle'))
  useStore.getState().setOpenSubsystemIds(['sub'])
})

describe('scenario load current display', () => {
  it('returns only the selected scenario current field', () => {
    const load = { I_typ: 1, I_idle: 0.2, I_max: 2 }

    expect(getScenarioLoadCurrentDisplay(load, 'Typical')).toEqual({ label: 'I_typ', text: '1A' })
    expect(getScenarioLoadCurrentDisplay(load, 'Max')).toEqual({ label: 'I_max', text: '2A' })
    expect(getScenarioLoadCurrentDisplay(load, 'Idle')).toEqual({ label: 'I_idle', text: '0.2A' })
    expect(getScenarioLoadCurrentDisplay({ I_typ: 1, I_max: 2 }, 'Idle')).toEqual({ label: 'I_idle', text: '—' })
  })

  it('renders subsystem load labels and edge currents using the root scenario', async () => {
    const { container } = render(
      <div style={{ width: 1200, height: 800 }}>
        <TooltipProvider>
          <QuickPresetDialogsProvider getCurrentSelection={() => null}>
            <ReactFlowProvider>
              <SubsystemCanvas
                subsystemId="sub"
                subsystemPath={['sub']}
                project={subsystemProject}
                onSelect={() => {}}
                onOpenNested={() => {}}
                selectionMode="single"
                selectionModeSource="user"
                onSelectionModeChange={() => {}}
              />
            </ReactFlowProvider>
          </QuickPresetDialogsProvider>
        </TooltipProvider>
      </div>
    )

    await waitFor(() => {
      expect(container.querySelector('.react-flow__node')).not.toBeNull()
    })

    expect(screen.getByText('I_idle: 0.2A')).not.toBeNull()
    expect(screen.queryByText(/I_typ:/)).toBeNull()
    expect(screen.queryByText(/I_max:/)).toBeNull()
    expect(container.textContent).toContain('P_in: 1 W')
    expect(container.textContent).not.toContain('P_in: 5 W')
  })
})
