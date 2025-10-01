import React from 'react'
import type { AnyNode, DualOutputConverterBranch, DualOutputConverterNode, NodeType, Project } from '../models'
import { useStore } from '../state/store'
import { Button } from './ui/button'
import {
  collectProjectNodeGroups,
  type NodeIndexEntry,
  type ProjectNodeGroup,
} from '../utils/nodeGrouping'
import { genId } from '../utils'
import type { QuickPreset } from '../utils/quickPresets'

type NodeBulkEditorModalProps = {
  isOpen: boolean
  onClose: () => void
}

type PendingPatch = {
  key: string
  patch: Partial<AnyNode>
  path: string[]
  nodeId: string
}

type DraftNewNode = {
  tempId: string
  node: AnyNode
  source?: { kind: 'preset'; presetId: string } | null
}

const NODE_TYPE_OPTIONS: NodeType[] = [
  'Source',
  'Converter',
  'DualOutputConverter',
  'Load',
  'Bus',
  'Subsystem',
  'SubsystemInput',
  'Note',
]

const compareNodes = (nodeA?: AnyNode, nodeB?: AnyNode): number => {
  if (!nodeA && !nodeB) return 0
  if (!nodeA) return -1
  if (!nodeB) return 1
  if (nodeA.type !== nodeB.type) {
    return nodeA.type.localeCompare(nodeB.type)
  }
  const nameA = (nodeA.name || '').toLowerCase()
  const nameB = (nodeB.name || '').toLowerCase()
  if (nameA !== nameB) {
    return nameA.localeCompare(nameB)
  }
  return nodeA.id.localeCompare(nodeB.id)
}

const cloneNode = (node: AnyNode): AnyNode => JSON.parse(JSON.stringify(node)) as AnyNode

const numberToInput = (value: unknown): string => (Number.isFinite(value) ? String(value) : '')

const coerceNumber = (value: string): number | undefined => {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

const coerceInt = (value: string, { min = 1 }: { min?: number } = {}): number | undefined => {
  const num = coerceNumber(value)
  if (!Number.isFinite(num)) return undefined
  const intVal = Math.round(num as number)
  return Math.max(min, intVal)
}

const ParameterField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1 text-xs text-slate-600">
    <span className="font-semibold text-slate-700">{label}</span>
    <div className="w-[500px] max-w-full">
      {children}
    </div>
  </label>
)

const CheckboxField = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) => (
  <label className="flex items-center gap-2 text-xs text-slate-600">
    <input
      type="checkbox"
      className="h-4 w-4"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
    />
    <span className="font-semibold text-slate-700">{label}</span>
  </label>
)

const buildPatch = (original: AnyNode, draft: AnyNode): Partial<AnyNode> => {
  const patch: Partial<AnyNode> = {}
  if (draft.name !== original.name) {
    patch.name = draft.name
  }

  switch (original.type) {
    case 'Source': {
      const next = draft as AnyNode & { Vout?: number; I_max?: number; P_max?: number; count?: number; redundancy?: string }
      const prev = original as AnyNode & { Vout?: number; I_max?: number; P_max?: number; count?: number; redundancy?: string }
      if (next.Vout !== prev.Vout) patch.Vout = next.Vout
      if (next.I_max !== prev.I_max) patch.I_max = next.I_max
      if (next.P_max !== prev.P_max) patch.P_max = next.P_max
      if (next.count !== prev.count) patch.count = next.count
      if (next.redundancy !== prev.redundancy) patch.redundancy = next.redundancy
      break
    }
    case 'Converter': {
      const next = draft as AnyNode & {
        Vin_min?: number
        Vin_max?: number
        Vout?: number
        Iout_max?: number
        Pout_max?: number
        phaseCount?: number
        topology?: string
        controllerPartNumber?: string
        powerStagePartNumber?: string
      }
      const prev = original as typeof next
      if (next.Vin_min !== prev.Vin_min) patch.Vin_min = next.Vin_min
      if (next.Vin_max !== prev.Vin_max) patch.Vin_max = next.Vin_max
      if (next.Vout !== prev.Vout) patch.Vout = next.Vout
      if (next.Iout_max !== prev.Iout_max) patch.Iout_max = next.Iout_max
      if (next.Pout_max !== prev.Pout_max) patch.Pout_max = next.Pout_max
      if (next.phaseCount !== prev.phaseCount) patch.phaseCount = next.phaseCount
      if ((next.topology || '') !== (prev.topology || '')) patch.topology = next.topology
      if ((next.controllerPartNumber || '') !== (prev.controllerPartNumber || '')) patch.controllerPartNumber = next.controllerPartNumber
      if ((next.powerStagePartNumber || '') !== (prev.powerStagePartNumber || '')) patch.powerStagePartNumber = next.powerStagePartNumber
      break
    }
    case 'DualOutputConverter': {
      const next = draft as DualOutputConverterNode
      const prev = original as DualOutputConverterNode
      if (next.Vin_min !== prev.Vin_min) patch.Vin_min = next.Vin_min
      if (next.Vin_max !== prev.Vin_max) patch.Vin_max = next.Vin_max
      if ((next.topology || '') !== (prev.topology || '')) patch.topology = next.topology
      if ((next.controllerPartNumber || '') !== (prev.controllerPartNumber || '')) patch.controllerPartNumber = next.controllerPartNumber
      if ((next.powerStagePartNumber || '') !== (prev.powerStagePartNumber || '')) patch.powerStagePartNumber = next.powerStagePartNumber
      const nextOutputs = Array.isArray(next.outputs) ? next.outputs : []
      const prevOutputs = Array.isArray(prev.outputs) ? prev.outputs : []
      let outputsChanged = nextOutputs.length !== prevOutputs.length
      if (!outputsChanged) {
        outputsChanged = nextOutputs.some((branch, idx) => {
          const prevBranch = prevOutputs[idx]
          if (!prevBranch) return true
          return (
            branch.id !== prevBranch.id ||
            (branch.label || '') !== (prevBranch.label || '') ||
            branch.Vout !== prevBranch.Vout ||
            branch.Iout_max !== prevBranch.Iout_max ||
            branch.Pout_max !== prevBranch.Pout_max ||
            branch.phaseCount !== prevBranch.phaseCount
          )
        })
      }
      if (outputsChanged) {
        patch.outputs = nextOutputs.map((branch, idx) => {
          const prevBranch = prevOutputs[idx]
          const preservedEfficiency = prevBranch?.efficiency ?? branch.efficiency
          const sanitized: DualOutputConverterBranch = {
            ...branch,
            efficiency: preservedEfficiency,
          }
          return sanitized
        })
      }
      break
    }
    case 'Load': {
      const next = draft as AnyNode & {
        Vreq?: number
        I_typ?: number
        I_max?: number
        I_idle?: number
        Utilization_typ?: number
        Utilization_max?: number
        numParalleledDevices?: number
        critical?: boolean
      }
      const prev = original as typeof next
      if (next.Vreq !== prev.Vreq) patch.Vreq = next.Vreq
      if (next.I_typ !== prev.I_typ) patch.I_typ = next.I_typ
      if (next.I_max !== prev.I_max) patch.I_max = next.I_max
      if (next.I_idle !== prev.I_idle) patch.I_idle = next.I_idle
      if (next.Utilization_typ !== prev.Utilization_typ) patch.Utilization_typ = next.Utilization_typ
      if (next.Utilization_max !== prev.Utilization_max) patch.Utilization_max = next.Utilization_max
      if (next.numParalleledDevices !== prev.numParalleledDevices) patch.numParalleledDevices = next.numParalleledDevices
      if ((next.critical ?? true) !== (prev.critical ?? true)) patch.critical = next.critical
      break
    }
    case 'Bus': {
      const next = draft as AnyNode & { V_bus?: number }
      const prev = original as AnyNode & { V_bus?: number }
      if (next.V_bus !== prev.V_bus) patch.V_bus = next.V_bus
      break
    }
    case 'SubsystemInput': {
      const next = draft as AnyNode & { Vout?: number }
      const prev = original as AnyNode & { Vout?: number }
      if (next.Vout !== prev.Vout) patch.Vout = next.Vout
      break
    }
    case 'Subsystem': {
      const next = draft as AnyNode & { inputV_nom?: number; numParalleledSystems?: number }
      const prev = original as AnyNode & { inputV_nom?: number; numParalleledSystems?: number }
      if (next.inputV_nom !== prev.inputV_nom) patch.inputV_nom = next.inputV_nom
      if (next.numParalleledSystems !== prev.numParalleledSystems) patch.numParalleledSystems = next.numParalleledSystems
      break
    }
    case 'Note': {
      const next = draft as AnyNode & { text?: string }
      const prev = original as AnyNode & { text?: string }
      if ((next.text || '') !== (prev.text || '')) patch.text = next.text
      break
    }
    default:
      break
  }

  return patch
}

function NodeBulkEditorModal({ isOpen, onClose }: NodeBulkEditorModalProps) {
  const project = useStore(state => state.project) as Project
  const bulkUpdateNodes = useStore(state => state.bulkUpdateNodes)
  const bulkAddNodes = useStore(state => state.bulkAddNodes)
  const grouping = React.useMemo(() => collectProjectNodeGroups(project), [project])
  const { groups, nodeIndex } = grouping
  const groupLookup = React.useMemo(() => {
    const map = new Map<string, ProjectNodeGroup>()
    for (const group of groups) {
      map.set(group.pathKey, group)
    }
    return map
  }, [groups])
  const [drafts, setDrafts] = React.useState<Map<string, AnyNode>>(new Map())
  const [newNodes, setNewNodes] = React.useState<Map<string, DraftNewNode[]>>(new Map())
  const [error, setError] = React.useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set())
  const sectionRefs = React.useRef<Map<string, HTMLDivElement>>(new Map())

  const createSubsystemProjectTemplate = React.useCallback((): Project => ({
    id: genId('proj_'),
    name: 'Embedded subsystem',
    units: JSON.parse(JSON.stringify(project.units)),
    defaultMargins: JSON.parse(JSON.stringify(project.defaultMargins)),
    scenarios: [...project.scenarios],
    currentScenario: project.currentScenario,
    nodes: [],
    edges: [],
  }), [project.defaultMargins, project.scenarios, project.units, project.currentScenario])

  const createNodeTemplate = React.useCallback((type: NodeType): AnyNode => {
    const id = genId('node_')
    switch (type) {
      case 'Source':
        return { id, type: 'Source', name: 'New Source', Vout: 12 }
      case 'Converter':
        return {
          id,
          type: 'Converter',
          name: 'New Converter',
          Vin_min: 10,
          Vin_max: 12,
          Vout: 5,
          efficiency: { type: 'fixed', value: 0.9 },
          phaseCount: 1,
        } as AnyNode
      case 'DualOutputConverter': {
        const branchId = genId('branch_')
        const branch: DualOutputConverterBranch = {
          id: branchId,
          label: 'Output A',
          Vout: 5,
          Iout_max: 1,
          Pout_max: 5,
          phaseCount: 1,
          efficiency: { type: 'fixed', value: 0.9 },
        }
        return {
          id,
          type: 'DualOutputConverter',
          name: 'New Dual-output Converter',
          Vin_min: 10,
          Vin_max: 12,
          outputs: [branch],
        } as AnyNode
      }
      case 'Load':
        return { id, type: 'Load', name: 'New Load', Vreq: 5, I_typ: 1, I_max: 2 }
      case 'Bus':
        return { id, type: 'Bus', name: 'New Bus', V_bus: 12 }
      case 'Subsystem':
        return {
          id,
          type: 'Subsystem',
          name: 'New Subsystem',
          inputV_nom: 12,
          numParalleledSystems: 1,
          project: createSubsystemProjectTemplate(),
        } as AnyNode
      case 'SubsystemInput':
        return { id, type: 'SubsystemInput', name: 'New Subsystem Input', Vout: 12 }
      case 'Note':
        return { id, type: 'Note', name: 'New Note', text: '' }
      default:
        return { id, type, name: 'New Node' } as AnyNode
    }
  }, [createSubsystemProjectTemplate])

  const quickPresets = useStore(state => state.quickPresets)

  const createNodeFromPreset = React.useCallback((preset: QuickPreset): AnyNode => {
    const template = cloneNode(preset.node as AnyNode)
    template.id = genId('node_')
    if (!template.name || !template.name.trim()) {
      template.name = preset.name || 'Preset Node'
    }
    return template
  }, [])

  const buildInitialDrafts = React.useCallback(() => {
    const initial = new Map<string, AnyNode>()
    for (const [key, entry] of Object.entries(nodeIndex)) {
      initial.set(key, cloneNode(entry.node))
    }
    return initial
  }, [nodeIndex])

  React.useEffect(() => {
    if (!isOpen) {
      setDrafts(new Map())
      setNewNodes(new Map())
      setCollapsedGroups(new Set())
      return
    }
    setError(null)
    setDrafts(prev => (prev.size > 0 ? prev : buildInitialDrafts()))
  }, [isOpen, buildInitialDrafts])

  React.useEffect(() => {
    if (!isOpen) return
    setCollapsedGroups(prev => {
      if (prev.size === 0) {
        const next = new Set<string>()
        for (const group of groups) {
          next.add(group.pathKey)
        }
        return next
      }
      const next = new Set(prev)
      for (const group of groups) {
        if (!next.has(group.pathKey)) {
          next.add(group.pathKey)
        }
      }
      return next
    })
  }, [groups, isOpen])

  const updateDraft = React.useCallback((key: string, updater: (draft: AnyNode) => AnyNode) => {
    const entry = nodeIndex[key]
    if (!entry) return
    setDrafts(prev => {
      const current = prev.get(key) ?? cloneNode(entry.node)
      const nextDraft = updater(cloneNode(current))
      if (!nextDraft) return prev
      const next = new Map(prev)
      next.set(key, nextDraft)
      return next
    })
  }, [nodeIndex])

  const setSectionRef = React.useCallback((pathKey: string, element: HTMLDivElement | null) => {
    const map = sectionRefs.current
    if (element) {
      map.set(pathKey, element)
    } else {
      map.delete(pathKey)
    }
  }, [])

  const toggleGroup = React.useCallback((pathKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(pathKey)) next.delete(pathKey)
      else next.add(pathKey)
      return next
    })
  }, [])

  const scrollToGroup = React.useCallback((pathKey: string) => {
    setCollapsedGroups(prev => {
      if (!prev.has(pathKey)) return prev
      const next = new Set(prev)
      next.delete(pathKey)
      return next
    })
    const target = sectionRefs.current.get(pathKey)
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'auto', block: 'start' })
    }
  }, [])

  const addNewNode = React.useCallback((pathKey: string) => {
    const template = cloneNode(createNodeTemplate('Load'))
    const draft: DraftNewNode = { tempId: genId('draft_'), node: template, source: null }
    setNewNodes(prev => {
      const next = new Map(prev)
      const list = next.get(pathKey) ? [...next.get(pathKey)!] : []
      list.push(draft)
      next.set(pathKey, list)
      return next
    })
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.delete(pathKey)
      return next
    })
  }, [createNodeTemplate])

  const addNodeFromPreset = React.useCallback((pathKey: string, presetId: string) => {
    const preset = quickPresets.find(p => p.id === presetId)
    if (!preset) return
    const node = createNodeFromPreset(preset)
    const draft: DraftNewNode = {
      tempId: genId('draft_'),
      node,
      source: { kind: 'preset', presetId },
    }
    setNewNodes(prev => {
      const next = new Map(prev)
      const list = next.get(pathKey) ? [...next.get(pathKey)!] : []
      list.push(draft)
      next.set(pathKey, list)
      return next
    })
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.delete(pathKey)
      return next
    })
  }, [createNodeFromPreset, quickPresets])

  const updateNewNode = React.useCallback((pathKey: string, tempId: string, updater: (draft: AnyNode) => AnyNode) => {
    setNewNodes(prev => {
      const list = prev.get(pathKey)
      if (!list) return prev
      let changed = false
      const nextList = list.map(entry => {
        if (entry.tempId !== tempId) return entry
        const nextNode = updater(cloneNode(entry.node))
        if (!nextNode) return entry
        changed = true
        return { ...entry, node: nextNode }
      })
      if (!changed) return prev
      const next = new Map(prev)
      next.set(pathKey, nextList)
      return next
    })
  }, [])

  const removeNewNode = React.useCallback((pathKey: string, tempId: string) => {
    setNewNodes(prev => {
      const list = prev.get(pathKey)
      if (!list) return prev
      const nextList = list.filter(entry => entry.tempId !== tempId)
      if (nextList.length === list.length) return prev
      const next = new Map(prev)
      if (nextList.length === 0) next.delete(pathKey)
      else next.set(pathKey, nextList)
      return next
    })
  }, [])

  const changeNewNodeType = React.useCallback((pathKey: string, tempId: string, type: NodeType) => {
    setNewNodes(prev => {
      const list = prev.get(pathKey)
      if (!list) return prev
      const nextList = list.map(entry => {
        if (entry.tempId !== tempId) return entry
        const preservedName = entry.node.name
        const template = cloneNode(createNodeTemplate(type))
        template.name = preservedName || template.name
        return { ...entry, node: template, source: null }
      })
      const next = new Map(prev)
      next.set(pathKey, nextList)
      return next
    })
  }, [createNodeTemplate])

  const pendingPatches = React.useMemo<PendingPatch[]>(() => {
    const patches: PendingPatch[] = []
    for (const [key, draft] of drafts.entries()) {
      const entry = nodeIndex[key]
      if (!entry) continue
      const patch = buildPatch(entry.node, draft)
      if (!patch || Object.keys(patch).length === 0) continue
      patches.push({ key, patch, path: [...entry.path], nodeId: entry.nodeId })
    }
    return patches
  }, [drafts, nodeIndex])

  const pendingAdds = React.useMemo(() => {
    const adds: { path: string[]; node: AnyNode }[] = []
    for (const [pathKey, entries] of newNodes.entries()) {
      const group = groupLookup.get(pathKey)
      if (!group) continue
      for (const entry of entries) {
        adds.push({ path: [...group.path], node: cloneNode(entry.node) })
      }
    }
    return adds
  }, [groupLookup, newNodes])

  const pendingChangesCount = pendingPatches.length + pendingAdds.length

  const handleReset = React.useCallback(() => {
    setDrafts(buildInitialDrafts())
    setNewNodes(new Map())
    setError(null)
  }, [buildInitialDrafts])

  const handleSave = React.useCallback(() => {
    if (pendingPatches.length === 0 && pendingAdds.length === 0) {
      onClose()
      return
    }
    try {
      if (pendingAdds.length) {
        bulkAddNodes(pendingAdds.map(add => ({
          node: add.node,
          subsystemPath: add.path.length ? add.path : undefined,
        })))
      }
      if (pendingPatches.length) {
        bulkUpdateNodes(pendingPatches.map(update => ({
          nodeId: update.nodeId,
          subsystemPath: update.path,
          patch: update.patch,
        })))
      }
      setNewNodes(new Map())
      setError(null)
      onClose()
    } catch (err) {
      console.error('Failed to save bulk node updates', err)
      setError(err instanceof Error ? err.message : 'Unable to save changes. Please try again.')
    }
  }, [bulkAddNodes, bulkUpdateNodes, onClose, pendingAdds, pendingPatches])

  const navigationGroups = React.useMemo(() => groups, [groups])

  const renderParameters = React.useCallback((key: string, draftNode: AnyNode, updateFn: (updater: (draft: AnyNode) => AnyNode) => void) => {
    switch (draftNode.type) {
      case 'Source': {
        const node = draftNode as AnyNode & { Vout?: number; I_max?: number; P_max?: number; count?: number; redundancy?: string }
        return (
          <div className="grid gap-3 lg:grid-cols-3">
            <ParameterField label="Vout (V)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.Vout)}
                onChange={e => updateFn(draft => ({ ...draft, Vout: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="I_max (A)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.I_max)}
                onChange={e => updateFn(draft => ({ ...draft, I_max: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="P_max (W)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.P_max)}
                onChange={e => updateFn(draft => ({ ...draft, P_max: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="Count">
              <input
                className="input"
                type="number"
                value={numberToInput(node.count)}
                min={1}
                onChange={e => updateFn(draft => ({ ...draft, count: coerceInt(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="Redundancy">
              <select
                className="input"
                value={node.redundancy ?? ''}
                onChange={e => updateFn(draft => ({ ...draft, redundancy: e.target.value || undefined }) as AnyNode)}
              >
                <option value="">Not specified</option>
                <option value="N">N</option>
                <option value="N+1">N+1</option>
              </select>
            </ParameterField>
          </div>
        )
      }
      case 'Converter': {
        const node = draftNode as AnyNode & {
          Vin_min?: number
          Vin_max?: number
          Vout?: number
          Iout_max?: number
          Pout_max?: number
          phaseCount?: number
          topology?: string
          controllerPartNumber?: string
          powerStagePartNumber?: string
        }
        return (
          <div className="grid gap-3 lg:grid-cols-3">
            <ParameterField label="Vin_min (V)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.Vin_min)}
                onChange={e => updateFn(draft => ({ ...draft, Vin_min: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="Vin_max (V)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.Vin_max)}
                onChange={e => updateFn(draft => ({ ...draft, Vin_max: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="Vout (V)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.Vout)}
                onChange={e => updateFn(draft => ({ ...draft, Vout: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="Iout_max (A)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.Iout_max)}
                onChange={e => updateFn(draft => ({ ...draft, Iout_max: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="Pout_max (W)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.Pout_max)}
                onChange={e => updateFn(draft => ({ ...draft, Pout_max: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="Phase count">
              <input
                className="input"
                type="number"
                min={1}
                value={numberToInput(node.phaseCount)}
                onChange={e => updateFn(draft => ({ ...draft, phaseCount: coerceInt(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="Topology">
              <select
                className="input"
                value={node.topology ?? ''}
                onChange={e => updateFn(draft => ({ ...draft, topology: e.target.value || undefined }) as AnyNode)}
              >
                <option value="">Not specified</option>
                <option value="buck">Buck</option>
                <option value="llc">LLC</option>
                <option value="ldo">LDO</option>
                <option value="other">Other</option>
              </select>
            </ParameterField>
            <ParameterField label="Controller part number">
              <input
                className="input"
                value={node.controllerPartNumber ?? ''}
                onChange={e => updateFn(draft => ({ ...draft, controllerPartNumber: e.target.value || undefined }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="Power stage part number">
              <input
                className="input"
                value={node.powerStagePartNumber ?? ''}
                onChange={e => updateFn(draft => ({ ...draft, powerStagePartNumber: e.target.value || undefined }) as AnyNode)}
              />
            </ParameterField>
          </div>
        )
      }
      case 'DualOutputConverter': {
        const node = draftNode as DualOutputConverterNode
        const outputs = Array.isArray(node.outputs) ? node.outputs : []
        const updateBranch = (idx: number, updater: (branch: DualOutputConverterBranch) => DualOutputConverterBranch) => {
          updateFn(draft => {
            const current = draft as DualOutputConverterNode
            const existing = Array.isArray(current.outputs) ? [...current.outputs] : []
            const baseline: DualOutputConverterBranch = existing[idx]
              ? { ...existing[idx] }
              : {
                  id: genId('branch_'),
                  label: `Output ${String.fromCharCode(65 + idx)}`,
                  Vout: 5,
                  Iout_max: 1,
                  Pout_max: 5,
                  phaseCount: 1,
                  efficiency: { type: 'fixed', value: 0.9 },
                }
            existing[idx] = updater(baseline)
            return { ...current, outputs: existing } as AnyNode
          })
        }
        return (
          <div className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-3">
              <ParameterField label="Vin_min (V)">
                <input
                  className="input"
                  type="number"
                  value={numberToInput(node.Vin_min)}
                  onChange={e => updateFn(draft => ({ ...draft, Vin_min: coerceNumber(e.target.value) }) as AnyNode)}
                />
              </ParameterField>
              <ParameterField label="Vin_max (V)">
                <input
                  className="input"
                  type="number"
                  value={numberToInput(node.Vin_max)}
                  onChange={e => updateFn(draft => ({ ...draft, Vin_max: coerceNumber(e.target.value) }) as AnyNode)}
                />
              </ParameterField>
              <ParameterField label="Topology">
                <select
                  className="input"
                  value={node.topology ?? ''}
                  onChange={e => updateFn(draft => ({ ...draft, topology: e.target.value || undefined }) as AnyNode)}
                >
                  <option value="">Not specified</option>
                  <option value="buck">Buck</option>
                  <option value="llc">LLC</option>
                  <option value="ldo">LDO</option>
                  <option value="other">Other</option>
                </select>
              </ParameterField>
              <ParameterField label="Controller part number">
                <input
                  className="input"
                  value={node.controllerPartNumber ?? ''}
                  onChange={e => updateFn(draft => ({ ...draft, controllerPartNumber: e.target.value || undefined }) as AnyNode)}
                />
              </ParameterField>
              <ParameterField label="Power stage part number">
                <input
                  className="input"
                  value={node.powerStagePartNumber ?? ''}
                  onChange={e => updateFn(draft => ({ ...draft, powerStagePartNumber: e.target.value || undefined }) as AnyNode)}
                />
              </ParameterField>
            </div>
            {outputs.map((branch, idx) => (
              <div key={branch.id || idx} className="rounded-md border border-slate-200 p-3 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Output {branch.label || branch.id || idx + 1}</div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <ParameterField label="Label">
                    <input
                      className="input"
                      value={branch.label ?? ''}
                      onChange={e => updateBranch(idx, current => ({ ...current, label: e.target.value || undefined }))}
                    />
                  </ParameterField>
                  <ParameterField label="Vout (V)">
                    <input
                      className="input"
                      type="number"
                      value={numberToInput(branch.Vout)}
                      onChange={e => updateBranch(idx, current => ({ ...current, Vout: coerceNumber(e.target.value) ?? 0 }))}
                    />
                  </ParameterField>
                  <ParameterField label="Iout_max (A)">
                    <input
                      className="input"
                      type="number"
                      value={numberToInput(branch.Iout_max)}
                      onChange={e => updateBranch(idx, current => ({ ...current, Iout_max: coerceNumber(e.target.value) }))}
                    />
                  </ParameterField>
                  <ParameterField label="Pout_max (W)">
                    <input
                      className="input"
                      type="number"
                      value={numberToInput(branch.Pout_max)}
                      onChange={e => updateBranch(idx, current => ({ ...current, Pout_max: coerceNumber(e.target.value) }))}
                    />
                  </ParameterField>
                  <ParameterField label="Phase count">
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={numberToInput(branch.phaseCount)}
                      onChange={e => updateBranch(idx, current => ({ ...current, phaseCount: coerceInt(e.target.value) }))}
                    />
                  </ParameterField>
                </div>
              </div>
            ))}
          </div>
        )
      }
      case 'Load': {
        const node = draftNode as AnyNode & {
          Vreq?: number
          I_typ?: number
          I_max?: number
          I_idle?: number
          Utilization_typ?: number
          Utilization_max?: number
          numParalleledDevices?: number
          critical?: boolean
        }
        return (
          <div className="grid gap-3 lg:grid-cols-3">
            <ParameterField label="Vreq (V)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.Vreq)}
                onChange={e => updateFn(draft => ({ ...draft, Vreq: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="I_typ (A)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.I_typ)}
                onChange={e => updateFn(draft => ({ ...draft, I_typ: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="I_max (A)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.I_max)}
                onChange={e => updateFn(draft => ({ ...draft, I_max: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="I_idle (A)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.I_idle)}
                onChange={e => updateFn(draft => ({ ...draft, I_idle: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="Utilization_typ (%)">
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={numberToInput(node.Utilization_typ)}
                onChange={e => updateFn(draft => ({ ...draft, Utilization_typ: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="Utilization_max (%)">
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={numberToInput(node.Utilization_max)}
                onChange={e => updateFn(draft => ({ ...draft, Utilization_max: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <ParameterField label="Parallel devices">
              <input
                className="input"
                type="number"
                min={1}
                value={numberToInput(node.numParalleledDevices)}
                onChange={e => updateFn(draft => ({ ...draft, numParalleledDevices: coerceInt(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
            <div className="flex items-end">
              <CheckboxField
                label="Critical load"
                checked={node.critical !== false}
                onChange={value => updateFn(draft => ({ ...draft, critical: value }) as AnyNode)}
              />
            </div>
          </div>
        )
      }
      case 'Bus': {
        const node = draftNode as AnyNode & { V_bus?: number }
        return (
          <div className="grid gap-3">
            <ParameterField label="V_bus (V)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.V_bus)}
                onChange={e => updateFn(draft => ({ ...draft, V_bus: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
          </div>
        )
      }
      case 'SubsystemInput': {
        const node = draftNode as AnyNode & { Vout?: number }
        return (
          <div className="grid gap-3">
            <ParameterField label="Vout (V)">
              <input
                className="input"
                type="number"
                value={numberToInput(node.Vout)}
                onChange={e => updateFn(draft => ({ ...draft, Vout: coerceNumber(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
          </div>
        )
      }
      case 'Subsystem': {
        const node = draftNode as AnyNode & { numParalleledSystems?: number }
        return (
          <div className="grid gap-3 lg:grid-cols-2">
            <ParameterField label="Paralleled systems">
              <input
                className="input"
                type="number"
                min={1}
                value={numberToInput(node.numParalleledSystems)}
                onChange={e => updateFn(draft => ({ ...draft, numParalleledSystems: coerceInt(e.target.value) }) as AnyNode)}
              />
            </ParameterField>
          </div>
        )
      }
      case 'Note': {
        const node = draftNode as AnyNode & { text?: string }
        return (
          <ParameterField label="Content">
            <textarea
              className="input"
              rows={3}
              value={node.text ?? ''}
              onChange={e => updateFn(draft => ({ ...draft, text: e.target.value }) as AnyNode)}
            />
          </ParameterField>
        )
      }
      default:
        return <div className="text-xs text-slate-500">No editable parameters available.</div>
    }
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="flex max-h-[90vh] w-full max-w-[1452px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">Bulk Edit Nodes</div>
              <div className="text-xs text-slate-500">Update node parameters grouped by subsystem. Efficiency models remain unchanged. Use Cmd+F (macOS) or Ctrl+F (Windows/Linux) to search within this window.</div>
              {navigationGroups.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">Jump to:</span>
                  {navigationGroups.map(group => (
                    <Button
                      key={group.pathKey}
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-slate-600"
                      onClick={() => scrollToGroup(group.pathKey)}
                    >
                      {group.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          </div>
          <div className="flex-1 overflow-auto">
            {groups.map(group => (
              <GroupSection
                key={group.pathKey || 'root'}
                group={group}
                nodeIndex={nodeIndex}
                drafts={drafts}
                renderParameters={renderParameters}
                updateDraft={updateDraft}
                newNodes={newNodes.get(group.pathKey) ?? []}
                updateNewNode={(tempId, updater) => updateNewNode(group.pathKey, tempId, updater)}
                changeNewNodeType={(tempId, type) => changeNewNodeType(group.pathKey, tempId, type)}
                removeNewNode={tempId => removeNewNode(group.pathKey, tempId)}
                onAddNode={() => addNewNode(group.pathKey)}
                onAddPreset={presetId => addNodeFromPreset(group.pathKey, presetId)}
                quickPresets={quickPresets}
                isCollapsed={collapsedGroups.has(group.pathKey)}
                onToggle={() => toggleGroup(group.pathKey)}
                sectionRef={element => setSectionRef(group.pathKey, element)}
              />
            ))}
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3">
            <div className="text-xs text-slate-500">
              {pendingChangesCount === 0 ? 'No changes pending' : `${pendingChangesCount} change${pendingChangesCount === 1 ? '' : 's'} pending`}
            </div>
            <div className="flex items-center gap-2">
              {error && <div className="text-xs text-red-600">{error}</div>}
              <Button variant="outline" size="sm" onClick={handleReset} disabled={drafts.size === 0 && pendingAdds.length === 0}>Reset</Button>
              <Button variant="success" size="sm" onClick={handleSave} disabled={pendingChangesCount === 0}>Save Changes</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type GroupSectionProps = {
  group: ProjectNodeGroup
  nodeIndex: Record<string, NodeIndexEntry>
  drafts: Map<string, AnyNode>
  renderParameters: (key: string, draftNode: AnyNode, updateFn: (updater: (draft: AnyNode) => AnyNode) => void) => React.ReactNode
  updateDraft: (key: string, updater: (draft: AnyNode) => AnyNode) => void
  newNodes: DraftNewNode[]
  updateNewNode: (tempId: string, updater: (draft: AnyNode) => AnyNode) => void
  changeNewNodeType: (tempId: string, type: NodeType) => void
  removeNewNode: (tempId: string) => void
  onAddNode: () => void
  onAddPreset: (presetId: string) => void
  quickPresets: QuickPreset[]
  isCollapsed: boolean
  onToggle: () => void
  sectionRef: (node: HTMLDivElement | null) => void
}

function GroupSection({
  group,
  nodeIndex,
  drafts,
  renderParameters,
  updateDraft,
  newNodes,
  updateNewNode,
  changeNewNodeType,
  removeNewNode,
  onAddNode,
  onAddPreset,
  quickPresets,
  isCollapsed,
  onToggle,
  sectionRef,
}: GroupSectionProps) {
  const [sortMode, setSortMode] = React.useState<'type-name' | 'name'>('type-name')
  const sortedKeys = React.useMemo(() => {
    return [...group.nodeKeys].sort((a, b) => {
      const aNode = nodeIndex[a]?.node
      const bNode = nodeIndex[b]?.node
      if (sortMode === 'name') {
        const nameA = (aNode?.name || '').toLowerCase()
        const nameB = (bNode?.name || '').toLowerCase()
        if (nameA !== nameB) return nameA.localeCompare(nameB)
        return compareNodes(aNode, bNode)
      }
      return compareNodes(aNode, bNode)
    })
  }, [group.nodeKeys, nodeIndex, sortMode])
  const sortedNewNodes = React.useMemo(() => {
    return [...newNodes].sort((a, b) => compareNodes(a.node, b.node))
  }, [newNodes])
  const presetLookup = React.useMemo(() => {
    const map = new Map<string, QuickPreset>()
    for (const preset of quickPresets) {
      map.set(preset.id, preset)
    }
    return map
  }, [quickPresets])
  const totalNodeCount = group.nodeKeys.length + newNodes.length
  const menuContainerRef = React.useRef<HTMLDivElement | null>(null)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const moreContainerRef = React.useRef<HTMLDivElement | null>(null)
  const [moreOpen, setMoreOpen] = React.useState(false)
  const [presetQuery, setPresetQuery] = React.useState('')
  const filteredPresets = React.useMemo(() => {
    const q = presetQuery.trim().toLowerCase()
    if (!q) return quickPresets
    return quickPresets.filter(p => (p.name || '').toLowerCase().includes(q) || (p.node?.type || '').toLowerCase().includes(q))
  }, [presetQuery, quickPresets])

  React.useEffect(() => {
    if (!menuOpen && !moreOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuOpen && !menuContainerRef.current?.contains(target)) {
        setMenuOpen(false)
      }
      if (moreOpen && !moreContainerRef.current?.contains(target)) {
        setMoreOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setMoreOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen, moreOpen])

  React.useEffect(() => {
    if (isCollapsed) setMenuOpen(false)
  }, [isCollapsed])

  return (
    <div ref={sectionRef} className="border-b last:border-b-0">
      <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!isCollapsed}
            aria-controls={`bulk-editor-section-${group.pathKey || 'root'}`}
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${group.label}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <span className={`text-2xl leading-none transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}>▾</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">{group.label}</span>
            <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600">{totalNodeCount} node{totalNodeCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Split Add button (primary + caret) on sm+ screens */}
          <div ref={menuContainerRef} className="relative hidden sm:flex">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Add new node in ${group.label}`}
              onClick={() => onAddNode()}
              className="rounded-r-none"
            >
              New node
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Open add menu in ${group.label}`}
              onClick={() => setMenuOpen(prev => !prev)}
              className="rounded-l-none px-2"
            >
              <span className="text-xl leading-none">▾</span>
            </Button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
                <div className="py-1">
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => {
                      onAddNode()
                      setMenuOpen(false)
                    }}
                  >
                    New node
                  </button>
                </div>
                <div className="border-t border-slate-200 p-2">
                  <input
                    type="text"
                    className="input w-full text-sm"
                    placeholder="Search presets…"
                    value={presetQuery}
                    onChange={e => setPresetQuery(e.target.value)}
                  />
                </div>
                <div className="border-t border-slate-200">
                  {filteredPresets.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-400">No matching presets</div>
                  ) : (
                    <div className="max-h-56 overflow-auto py-1">
                      {filteredPresets.map(preset => (
                        <button
                          key={preset.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                          onClick={() => {
                            onAddPreset(preset.id)
                            setMenuOpen(false)
                            setPresetQuery('')
                          }}
                        >
                          {preset.name}
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">{preset.node?.type}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Compact single Add menu on xs screens */}
          <div ref={menuContainerRef} className="relative sm:hidden">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Add node in ${group.label}`}
              onClick={() => setMenuOpen(prev => !prev)}
              className="flex items-center gap-1"
            >
              <span>Add</span>
              <span className="text-xl leading-none">▾</span>
            </Button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
                <div className="py-1">
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => {
                      onAddNode()
                      setMenuOpen(false)
                    }}
                  >
                    New node
                  </button>
                </div>
                <div className="border-t border-slate-200 p-2">
                  <input
                    type="text"
                    className="input w-full text-sm"
                    placeholder="Search presets…"
                    value={presetQuery}
                    onChange={e => setPresetQuery(e.target.value)}
                  />
                </div>
                <div className="border-t border-slate-200">
                  {filteredPresets.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-400">No matching presets</div>
                  ) : (
                    <div className="max-h-56 overflow-auto py-1">
                      {filteredPresets.map(preset => (
                        <button
                          key={preset.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                          onClick={() => {
                            onAddPreset(preset.id)
                            setMenuOpen(false)
                            setPresetQuery('')
                          }}
                        >
                          {preset.name}
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">{preset.node?.type}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* More menu */}
          <div ref={moreContainerRef} className="relative">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label={`More actions for ${group.label}`}
              onClick={() => setMoreOpen(prev => !prev)}
              className="px-2"
            >
              ⋯
            </Button>
            {moreOpen && (
              <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
                <div className="py-1">
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => {
                      // Reset drafts and new nodes for this section
                      for (const key of group.nodeKeys) {
                        const entry = nodeIndex[key]
                        if (entry) updateDraft(key, () => cloneNode(entry.node))
                      }
                      for (const draft of newNodes) {
                        removeNewNode(draft.tempId)
                      }
                      setMoreOpen(false)
                    }}
                  >
                    Reset section changes
                  </button>
                </div>
                <div className="border-t border-slate-200 py-1">
                  <button
                    type="button"
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 ${sortMode==='type-name' ? 'text-slate-900' : 'text-slate-700'}`}
                    onClick={() => { setSortMode('type-name'); setMoreOpen(false) }}
                  >
                    Sort by type, then name
                  </button>
                  <button
                    type="button"
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 ${sortMode==='name' ? 'text-slate-900' : 'text-slate-700'}`}
                    onClick={() => { setSortMode('name'); setMoreOpen(false) }}
                  >
                    Sort by name
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {!isCollapsed && (
        <div id={`bulk-editor-section-${group.pathKey || 'root'}`} className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-white">
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Name</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Parameters</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedNewNodes.map(draft => (
              <tr key={draft.tempId} className="border-b last:border-b-0 align-top">
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="input bg-sky-50 w-[300px] max-w-full"
                      value={draft.node.name ?? ''}
                      onChange={e => updateNewNode(draft.tempId, current => ({ ...current, name: e.target.value } as AnyNode))}
                    />
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-700">Pending</span>
                    {draft.source?.kind === 'preset' && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">From preset: {presetLookup.get(draft.source.presetId)?.name ?? draft.source.presetId}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex items-center gap-2">
                    <select
                      className="input w-[200px]"
                      value={draft.node.type}
                      onChange={e => changeNewNodeType(draft.tempId, e.target.value as NodeType)}
                    >
                      {NODE_TYPE_OPTIONS.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  {renderParameters(draft.tempId, draft.node, updater => updateNewNode(draft.tempId, updater))}
                </td>
                <td className="px-3 py-3 align-top text-right">
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeNewNode(draft.tempId)}>Remove</Button>
                </td>
              </tr>
            ))}
            {sortedKeys.map(key => {
              const entry = nodeIndex[key]
              if (!entry) return null
              const draftNode = drafts.get(key) ?? entry.node
              return (
                <tr key={key} className="border-b last:border-b-0 align-top">
                  <td className="px-3 py-3 align-top">
                    <input
                      className="input bg-sky-50 w-[300px] max-w-full"
                      value={draftNode.name ?? ''}
                      onChange={e => updateDraft(key, draft => ({ ...draft, name: e.target.value }))}
                    />
                    <div className="pt-1 text-[11px] uppercase tracking-wide text-slate-400">{entry.nodeId}</div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-slate-700">{draftNode.type}</div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    {renderParameters(key, draftNode, updater => updateDraft(key, updater))}
                  </td>
                  <td className="px-3 py-3 align-top text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => updateDraft(key, () => cloneNode(entry.node))}
                    >
                      Reset
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

export default React.memo(NodeBulkEditorModal)


