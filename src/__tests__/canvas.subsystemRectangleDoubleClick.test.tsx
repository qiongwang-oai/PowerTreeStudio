import React from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import Canvas from '../components/Canvas'
import { QuickPresetDialogsProvider } from '../components/quick-presets/QuickPresetDialogsContext'
import { TooltipProvider } from '../components/ui/tooltip'
import type { AnyNode, Project, RectangleMarkup } from '../models'
import { useStore } from '../state/store'

const innerProject: Project = {
  id: 'inner-project',
  name: 'Inner',
  units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
  defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
  scenarios: ['Typical', 'Max', 'Idle'],
  currentScenario: 'Typical',
  nodes: [],
  edges: [],
}

const subsystemNode: AnyNode = {
  id: 'ss-1',
  type: 'Subsystem',
  name: 'Subsystem A',
  inputV_nom: 12,
  x: 120,
  y: 120,
  project: innerProject,
} as AnyNode

const backgroundRectangle: RectangleMarkup = {
  id: 'rect-overlap',
  type: 'rectangle',
  position: { x: 80, y: 80 },
  size: { width: 280, height: 220 },
  strokeColor: '#0f172a',
  thickness: 2,
  isDashed: false,
  fillColor: '#38bdf8',
  fillOpacity: 0.18,
  cornerRadius: 8,
  zIndex: -10,
}

const project: Project = {
  id: 'canvas-double-click',
  name: 'Canvas double click',
  units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
  defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
  scenarios: ['Typical', 'Max', 'Idle'],
  currentScenario: 'Typical',
  nodes: [subsystemNode],
  edges: [],
  markups: [backgroundRectangle],
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
  useStore.getState().setProject(project)
  useStore.getState().setOpenSubsystemIds([])
})

describe('Canvas subsystem double click through rectangle annotations', () => {
  it('opens the subsystem when the subsystem sits above a rectangle annotation', async () => {
    const handleOpenSubsystem = vi.fn()
    const { container } = render(
      <div style={{ width: 1200, height: 800 }}>
        <TooltipProvider>
          <QuickPresetDialogsProvider getCurrentSelection={() => null}>
            <ReactFlowProvider>
              <Canvas
                onSelect={() => {}}
                onOpenSubsystem={handleOpenSubsystem}
                markupTool={null}
                onMarkupToolChange={() => {}}
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

    const graphNode = container.querySelector('.react-flow__node') as HTMLElement | null
    const rectangleWrapper = container.querySelector(
      '[data-markup-transform-layer="interactive"] [data-markup-id="rect-overlap"]'
    ) as HTMLElement | null
    const rectangleVisualSurface = rectangleWrapper?.querySelector(':scope > div') as HTMLElement | null

    expect(graphNode).not.toBeNull()
    expect(rectangleWrapper).not.toBeNull()
    expect(rectangleVisualSurface).not.toBeNull()
    expect(rectangleWrapper?.style.pointerEvents).toBe('none')
    expect(rectangleVisualSurface?.style.pointerEvents).toBe('none')

    fireEvent.doubleClick(graphNode!)

    await waitFor(() => {
      expect(handleOpenSubsystem).toHaveBeenCalledWith('ss-1')
    })
  })
})
