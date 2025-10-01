import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { AnyNode, Project } from '../models'
import { useStore } from '../state/store'
import NodeBulkEditorModal from '../components/NodeBulkEditorModal'

const makeProject = (nodes: AnyNode[]): Project => ({
  id: 'proj-modal',
  name: 'Modal Project',
  units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
  defaultMargins: { currentPct: 10, powerPct: 10, voltageDropPct: 5, voltageMarginPct: 3 },
  scenarios: ['Typical', 'Max', 'Idle'],
  currentScenario: 'Typical',
  nodes,
  edges: [],
})

describe('NodeBulkEditorModal', () => {
  it('updates source node values and closes on save', async () => {
    const load: AnyNode = {
      id: 'load-1',
      type: 'Load',
      name: 'Compute Load',
      Vreq: 5,
      I_typ: 1,
      I_max: 2,
    } as any
    const subsystem: AnyNode = {
      id: 'sub-1',
      type: 'Subsystem',
      name: 'Subsystem A',
      inputV_nom: 12,
      project: makeProject([load]),
    } as any
    const source: AnyNode = {
      id: 'src-1',
      type: 'Source',
      name: 'Main Source',
      Vout: 12,
    } as any
    const project = makeProject([source, subsystem])
    const { setProject } = useStore.getState()
    setProject(project)

    const handleClose = vi.fn()
    render(<NodeBulkEditorModal isOpen onClose={handleClose} />)

    const modal = screen.getAllByRole('dialog')[0]

    fireEvent.click(within(modal).getByRole('button', { name: 'Expand Top Level System' }))

    expect(within(modal).getAllByText('Subsystem A').length).toBeGreaterThan(0)

    const voutInput = within(modal).getAllByLabelText('Vout (V)')[0] as HTMLInputElement
    expect(voutInput.value).toBe('12')
    fireEvent.change(voutInput, { target: { value: '13.5' } })

    const saveButton = within(modal).getAllByRole('button', { name: /save changes/i }).find(button => !button.hasAttribute('disabled'))
    expect(saveButton).toBeDefined()
    fireEvent.click(saveButton!)

    const updatedProject = useStore.getState().project
    const updatedSource = updatedProject.nodes.find(node => node.id === 'src-1') as any

    expect(updatedSource?.Vout).toBe(13.5)
  })

  it('allows adding a new load node to the top level and saving', async () => {
    const source: AnyNode = {
      id: 'src-1',
      type: 'Source',
      name: 'Main Source',
      Vout: 12,
    } as any
    const project = makeProject([source])
    const { setProject } = useStore.getState()
    setProject(project)

    const handleClose = vi.fn()
    render(<NodeBulkEditorModal isOpen onClose={handleClose} />)

    const modal = screen.getAllByRole('dialog')[0]

    fireEvent.click(within(modal).getByRole('button', { name: 'Expand Top Level System' }))

    fireEvent.click(within(modal).getByRole('button', { name: 'Add new node in Top Level System' }))

    const nameInputs = within(modal).getAllByDisplayValue('New Load')
    expect(nameInputs.length).toBeGreaterThan(0)
    fireEvent.change(nameInputs[0], { target: { value: 'Aux Load' } })

    const vreqInput = within(modal).getAllByLabelText('Vreq (V)')[0] as HTMLInputElement
    fireEvent.change(vreqInput, { target: { value: '4.5' } })

    const saveButton = within(modal).getAllByRole('button', { name: /save changes/i }).find(button => !button.hasAttribute('disabled'))
    expect(saveButton).toBeDefined()
    fireEvent.click(saveButton!)

    const updatedProject = useStore.getState().project
    expect(updatedProject.nodes.some(node => node.name === 'Aux Load')).toBe(true)
  })

  it('allows adding a node from a quick preset and saving', async () => {
    const { setProject, quickPresets } = useStore.getState()
    setProject(makeProject([]))
    const preset = quickPresets[0]
    const presetId = preset.id

    const handleClose = vi.fn()
    render(<NodeBulkEditorModal isOpen onClose={handleClose} />)

    const modal = screen.getAllByRole('dialog')[0]
    fireEvent.click(within(modal).getByRole('button', { name: 'Expand Top Level System' }))

    fireEvent.click(within(modal).getByRole('button', { name: 'Open add menu in Top Level System' }))

    const presetButton = within(modal)
      .getAllByRole('button')
      .find(element => element.textContent && element.textContent.includes(preset.name))
    expect(presetButton).toBeDefined()
    fireEvent.click(presetButton!)

    expect(within(modal).getAllByText(/Preset:/i).some(el => el.textContent?.includes(preset.name))).toBe(true)

    const saveButton = within(modal).getAllByRole('button', { name: /save changes/i }).find(button => !button.hasAttribute('disabled'))
    expect(saveButton).toBeDefined()
    fireEvent.click(saveButton!)

    const updatedProject = useStore.getState().project
    expect(updatedProject.nodes.some(node => node.name === preset.node?.name || node.name === preset.name)).toBe(true)
  })
})


