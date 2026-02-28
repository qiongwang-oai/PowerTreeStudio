import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import EfficiencyEditor from '../components/EfficiencyEditor'
import type { EfficiencyModel } from '../models'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window.ResizeObserver === 'undefined') {
  ;(window as typeof window & { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
}

type HarnessProps = {
  initial: EfficiencyModel
  maxCurrent?: number
  modelNode?: { Iout_max?: number; Pout_max?: number; phaseCount?: number; Vout?: number }
  onEmit?: ReturnType<typeof vi.fn>
}

function Harness({ initial, maxCurrent = 20, modelNode = { Iout_max: maxCurrent, Vout: 1.8 }, onEmit }: HarnessProps) {
  const [efficiency, setEfficiency] = React.useState<EfficiencyModel>(initial)
  return (
    <EfficiencyEditor
      efficiency={efficiency}
      maxCurrent={maxCurrent}
      modelNode={modelNode}
      onChange={next => {
        setEfficiency(next)
        onEmit?.(next)
      }}
      analysis={{ P_out: 9, I_out: 5 }}
    />
  )
}

function mockClipboard() {
  const readText = vi.fn()
  const writeText = vi.fn()
  Object.defineProperty(navigator, 'clipboard', {
    value: { readText, writeText },
    configurable: true,
  })
  return { readText, writeText }
}

describe('EfficiencyEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('switches from fixed to curve with a default 1d model', async () => {
    const onEmit = vi.fn()
    render(<Harness initial={{ type: 'fixed', value: 0.91 }} onEmit={onEmit} />)

    fireEvent.change(screen.getByLabelText('Efficiency model'), { target: { value: 'curve1d' } })

    await waitFor(() => expect(onEmit).toHaveBeenCalled())
    expect(onEmit.mock.lastCall?.[0]).toMatchObject({
      type: 'curve',
      mode: '1d',
      base: 'Iout_max',
    })
  })

  it('switches from 1d to 2d and seeds a valid matrix', async () => {
    const onEmit = vi.fn()
    render(
      <Harness
        initial={{
          type: 'curve',
          mode: '1d',
          base: 'Iout_max',
          points: [
            { current: 0, eta: 0.85 },
            { current: 20, eta: 0.92 },
          ],
        }}
        onEmit={onEmit}
      />
    )

    fireEvent.change(screen.getByLabelText('Efficiency model'), { target: { value: 'curve2d' } })

    await waitFor(() => expect(onEmit).toHaveBeenCalled())
    expect(onEmit.mock.lastCall?.[0]).toMatchObject({
      type: 'curve',
      mode: '2d',
      table: {
        outputVoltages: [1.8],
        outputCurrents: [0, 10, 20],
      },
    })
  })

  it('pastes a valid 1d TSV table', async () => {
    const onEmit = vi.fn()
    const { readText } = mockClipboard()
    readText.mockResolvedValue('0\t0.84\n10\t0.91\n20\t0.93')

    render(
      <Harness
        initial={{
          type: 'curve',
          mode: '1d',
          base: 'Iout_max',
          points: [{ current: 0, eta: 0.85 }],
        }}
        onEmit={onEmit}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Paste table' }))

    await waitFor(() => expect(onEmit).toHaveBeenCalled())
    expect(onEmit.mock.lastCall?.[0]).toMatchObject({
      type: 'curve',
      mode: '1d',
      points: [
        { current: 0, eta: 0.84 },
        { current: 10, eta: 0.91 },
        { current: 20, eta: 0.93 },
      ],
    })
  })

  it('pastes a valid 2d matrix table', async () => {
    const onEmit = vi.fn()
    const { readText } = mockClipboard()
    readText.mockResolvedValue('Iout \\ Vout\t1.0\t1.8\n0\t0.8\t0.82\n10\t0.86\t0.91')

    render(
      <Harness
        initial={{
          type: 'curve',
          mode: '2d',
          table: {
            outputVoltages: [1.8],
            outputCurrents: [0, 20],
            values: [[0.85, 0.9]],
          },
        }}
        onEmit={onEmit}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Paste table' }))

    await waitFor(() => expect(onEmit).toHaveBeenCalled())
    expect(onEmit.mock.lastCall?.[0]).toMatchObject({
      type: 'curve',
      mode: '2d',
      table: {
        outputVoltages: [1, 1.8],
        outputCurrents: [0, 10],
        values: [
          [0.8, 0.86],
          [0.82, 0.91],
        ],
      },
    })
  })

  it('shows an error and keeps the previous model when a pasted 2d matrix is invalid', async () => {
    const onEmit = vi.fn()
    const { readText } = mockClipboard()
    readText.mockResolvedValue('Iout \\ Vout\t1.0\t1.8\n0\t0.8')

    render(
      <Harness
        initial={{
          type: 'curve',
          mode: '2d',
          table: {
            outputVoltages: [1.8],
            outputCurrents: [0, 20],
            values: [[0.85, 0.9]],
          },
        }}
        onEmit={onEmit}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Paste table' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('same number of columns'))
    expect(onEmit).not.toHaveBeenCalled()
  })

  it('updates a 2d matrix cell through inline editing', async () => {
    const onEmit = vi.fn()
    render(
      <Harness
        initial={{
          type: 'curve',
          mode: '2d',
          table: {
            outputVoltages: [1.8],
            outputCurrents: [0, 10],
            values: [[0.85, 0.9]],
          },
        }}
        onEmit={onEmit}
      />
    )

    fireEvent.change(screen.getByLabelText('Efficiency cell 2-1'), { target: { value: '95' } })

    await waitFor(() => expect(onEmit).toHaveBeenCalled())
    expect(onEmit.mock.lastCall?.[0]).toMatchObject({
      type: 'curve',
      mode: '2d',
      table: {
        values: [[0.85, 0.95]],
      },
    })
  })

  it('keeps an empty 2d efficiency cell blank instead of showing zero efficiency', async () => {
    const onEmit = vi.fn()
    render(
      <Harness
        initial={{
          type: 'curve',
          mode: '2d',
          table: {
            outputVoltages: [1.8],
            outputCurrents: [0, 10],
            values: [[0.85, 0.9]],
          },
        }}
        onEmit={onEmit}
      />
    )

    fireEvent.change(screen.getByLabelText('Efficiency cell 2-1'), { target: { value: '' } })
    fireEvent.blur(screen.getByLabelText('Efficiency cell 2-1'))

    await waitFor(() => expect(onEmit).toHaveBeenCalled())
    expect(onEmit.mock.lastCall?.[0]).toMatchObject({
      type: 'curve',
      mode: '2d',
      table: {
        values: [[0.85, null]],
      },
    })
    expect((screen.getByLabelText('Efficiency cell 2-1') as HTMLInputElement).value).toBe('')
  })

  it('copies the visible 2d matrix as TSV', async () => {
    const onEmit = vi.fn()
    const { writeText } = mockClipboard()
    writeText.mockResolvedValue(undefined)

    render(
      <Harness
        initial={{
          type: 'curve',
          mode: '2d',
          table: {
            outputVoltages: [1.0, 1.8],
            outputCurrents: [0, 10],
            values: [
              [0.8, 0.86],
              [0.82, 0.91],
            ],
          },
        }}
        onEmit={onEmit}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy table' }))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText).toHaveBeenCalledWith('Iout \\ Vout\t1\t1.8\n0\t0.8\t0.82\n10\t0.86\t0.91')
  })

  it('rescales 2d current headers for per-phase scope without changing voltages', async () => {
    const onEmit = vi.fn()
    render(
      <Harness
        initial={{
          type: 'curve',
          mode: '2d',
          table: {
            outputVoltages: [1.0, 1.8],
            outputCurrents: [0, 20, 40],
            values: [
              [0.8, 0.86, 0.9],
              [0.82, 0.91, 0.94],
            ],
          },
        }}
        maxCurrent={40}
        modelNode={{ Iout_max: 40, phaseCount: 2, Vout: 1.8 }}
        onEmit={onEmit}
      />
    )

    fireEvent.change(screen.getByLabelText('Efficiency data scope'), { target: { value: 'perPhase' } })

    await waitFor(() => expect(onEmit).toHaveBeenCalled())
    expect(onEmit.mock.lastCall?.[0]).toMatchObject({
      type: 'curve',
      mode: '2d',
      perPhase: true,
      table: {
        outputVoltages: [1.0, 1.8],
        outputCurrents: [0, 10, 20],
      },
    })
  })

  it('renders compact fixed-width 2d columns with full-width editors and formatted values', () => {
    render(
      <Harness
        initial={{
          type: 'curve',
          mode: '2d',
          table: {
            outputVoltages: [0.6, 1.8],
            outputCurrents: [0, 1.7],
            values: [
              [0, 0],
              [0, 0.84],
            ],
          },
        }}
        maxCurrent={20}
        modelNode={{ Iout_max: 20, Vout: 1.8 }}
      />
    )

    const table = screen.getByTestId('efficiency-matrix')
    const cols = table.querySelectorAll('col')

    expect(cols).toHaveLength(3)
    expect(cols[0]?.getAttribute('style')).toContain('3.75rem')
    expect(cols[1]?.getAttribute('style')).toContain('3.35rem')
    expect(cols[2]?.getAttribute('style')).toContain('3.35rem')

    const voltageCell = screen.getByLabelText('Voltage column 2') as HTMLInputElement
    const currentCell = screen.getByLabelText('Current row 1') as HTMLInputElement
    const efficiencyCell = screen.getByLabelText('Efficiency cell 2-2') as HTMLInputElement

    expect(currentCell.className).toContain('w-full')
    expect(voltageCell.className).toContain('w-full')
    expect(efficiencyCell.className).toContain('w-full')

    expect(currentCell.value).toBe('0.0')
    expect(voltageCell.value).toBe('1.80')
    expect(efficiencyCell.value).toBe('84.0%')
  })

  it('renders the 1d curve editor with the same compact layout and percent-formatted cells', () => {
    render(
      <Harness
        initial={{
          type: 'curve',
          mode: '1d',
          base: 'Iout_max',
          points: [
            { current: 0, eta: 0.8 },
            { current: 15, eta: 0.93 },
            { current: 25, eta: 0.92 },
            { current: 40, eta: 0.9 },
            { current: 50, eta: 0.88 },
          ],
        }}
        maxCurrent={50}
        modelNode={{ Iout_max: 50, Vout: 1.8 }}
      />
    )

    expect(screen.getByText('Efficiency curve')).toBeTruthy()
    expect(screen.getByText('Operating point')).toBeTruthy()

    const table = screen.getByTestId('efficiency-curve-1d-table')
    const cols = table.querySelectorAll('col')

    expect(cols).toHaveLength(2)
    expect(table.className).toContain('w-full')
    expect(cols[0]?.getAttribute('style')).toContain('50%')
    expect(cols[1]?.getAttribute('style')).toContain('50%')

    const currentCell = screen.getByLabelText('Current row 1') as HTMLInputElement
    const efficiencyCell = screen.getByLabelText('Efficiency row 1') as HTMLInputElement

    expect(currentCell.className).toContain('w-full')
    expect(efficiencyCell.className).toContain('w-full')
    expect(currentCell.value).toBe('0.0')
    expect(efficiencyCell.value).toBe('80.0%')
  })

  it('renders a 2d efficiency vs current graph legend for each voltage and the operating point', () => {
    render(
      <Harness
        initial={{
          type: 'curve',
          mode: '2d',
          table: {
            outputVoltages: [0.6, 1.8],
            outputCurrents: [0, 1.7, 2.5],
            values: [
              [0, 0, 0],
              [0, 0.84, 0.9],
            ],
          },
        }}
        maxCurrent={20}
        modelNode={{ Iout_max: 20, Vout: 1.8 }}
      />
    )

    expect(screen.getByText('Vout 0.60 V')).toBeTruthy()
    expect(screen.getByText('Vout 1.80 V')).toBeTruthy()
    expect(screen.getByText('Operating point')).toBeTruthy()
    expect(screen.getAllByTestId('efficiency-2d-legend-item')).toHaveLength(2)
  })
})
