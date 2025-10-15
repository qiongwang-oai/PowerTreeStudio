import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, Connection, Edge as RFEdge, Node as RFNode, useNodesState, useEdgesState, addEdge, applyNodeChanges, applyEdgeChanges, OnEdgesDelete, OnNodesDelete, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import { Project, AnyNode, Edge, CanvasMarkup } from '../../models'
import { compute, etaFromModel } from '../../calc'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import { useStore } from '../../state/store'
import type { ClipboardPayload } from '../../state/store'
import OrthogonalEdge from '../edges/OrthogonalEdge'
import { voltageToEdgeColor } from '../../utils/color'
import { edgeGroupKey, computeEdgeGroupInfo } from '../../utils/edgeGroups'
import { createNodePreset, NODE_PRESET_MIME, withPosition, deserializePresetDescriptor, dataTransferHasNodePreset } from '../../utils/nodePresets'
import { dataTransferHasQuickPreset, readQuickPresetDragPayload, materializeQuickPreset } from '../../utils/quickPresets'
import { useQuickPresetDialogs } from '../quick-presets/QuickPresetDialogsContext'
import { genId } from '../../utils'
import { formatPower, powerTooltipLabel } from '../../utils/format'
import type {
  InspectorSelection,
  MultiSelection,
  SelectionMode,
  SelectionModeChangeOptions,
  SelectionModeSource,
} from '../../types/selection'
import {
  emptyMultiSelection,
  ensureMultiSelection,
  mergeMultiSelections,
  normalizeBounds,
  boundsIntersects,
  pointsToBounds,
  selectionHasItems,
  toggleInMultiSelection,
  normalizeMultiSelection,
  type Bounds,
} from '../../utils/multiSelection'
import { collectClipboardPayload as collectClipboardPayloadShared, applyClipboardPayload } from '../../utils/selectionClipboard'
import {
  computeSubsystemNodeMinHeight,
  getSubsystemPortPosition,
  sanitizeSubsystemHandleOrder,
  orderSubsystemPorts,
} from '../SubsystemNodeLayout'
import { Button } from '../ui/button'
import { Tooltip } from '../ui/tooltip'
import { MousePointer, BoxSelect, Undo2, Redo2 } from 'lucide-react'
import { clampPointToBounds, DEFAULT_SUBSYSTEM_BOUNDS, getKeyboardNudgeDeltaForEvent, computeEdgeMidpointNudge } from '../../utils/nudgeSelection'
import {
  applyKeyboardPan,
  getKeyboardPanIntent,
  getKeyboardPanTranslation,
  isKeyboardPanOverrideActive,
} from '../../utils/keyboardPan'

type PowerDisplay = { text: string; tooltip?: string }

const isMultiSelectModifier = (event: { metaKey?: boolean; ctrlKey?: boolean }): boolean =>
  Boolean(event.metaKey || event.ctrlKey)

function formatPowerDisplay(value: unknown): PowerDisplay {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const formatted = formatPower(value)
    return {
      text: `${formatted.value} ${formatted.unit}`,
      tooltip: powerTooltipLabel(value),
    }
  }
  return { text: '—', tooltip: undefined }
}

function renderPowerDisplay(value: unknown) {
  const { text, tooltip } = formatPowerDisplay(value)
  return <span title={tooltip}>{text}</span>
}

function CustomNode(props: NodeProps) {
  const { data, selected } = props
  const isMultiSelected = Boolean((data as any)?.__multiSelected)
  const isSelected = !!selected || isMultiSelected
  const accentColor = '#0284c7'
  const nodeType = (data as any).type
  const rawParallel = typeof (data as any)?.parallelCount === 'number' ? (data as any).parallelCount : 1
  const parallelCount = Number.isFinite(rawParallel) && rawParallel > 0 ? Math.floor(rawParallel) : 1
  const isParallelStackType = nodeType === 'Load' || nodeType === 'Subsystem'
  const showStack = isParallelStackType && parallelCount > 1
  const maxVisibleStack = 5
  const stackGap = 4
  const behindCount = showStack ? Math.min(parallelCount - 1, maxVisibleStack - 1) : 0
  const bracketDepth = stackGap * behindCount
  const bracketLabel = `x${parallelCount}`
  const baseBraceSize = 18
  const bracketFontSize = Math.max(baseBraceSize, bracketDepth + 10)
  const braceBottomAdjust = 6
  const baseShadow = '0 1px 2px rgba(15, 23, 42, 0.06)'
  const stackShadowParts = showStack
    ? Array.from({ length: behindCount }).map((_, idx) => {
        const depth = idx + 1
        const offset = stackGap * depth
        const fade = 0.38 - depth * 0.07
        const alpha = Math.max(0.18, fade)
        return `${offset}px ${offset}px 0 1px rgba(71, 85, 105, ${alpha.toFixed(2)})`
      })
    : []
  const bracketElement = (showStack && bracketDepth > 0) ? (
    <div
      style={{
        position: 'absolute',
        top: bracketDepth - bracketFontSize + braceBottomAdjust,
        left: '100%',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          fontSize: bracketFontSize,
          lineHeight: 1,
          fontFamily: 'serif',
          color: '#475569',
          display: 'block',
          transform: 'rotate(-39deg)',
          transformOrigin: 'top right',
        }}
      >
        {'}'}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#1e293b',
          transform: `translateY(${-(bracketFontSize * 0.25)}px)`,
        }}
      >
        {bracketLabel}
      </span>
    </div>
  ) : null

  const combinedShadow = stackShadowParts.length
    ? `${stackShadowParts.join(', ')}, ${baseShadow}`
    : baseShadow
  const bgClass = nodeType === 'Source' ? 'bg-green-50'
    : nodeType === 'Converter' ? 'bg-blue-50'
    : nodeType === 'DualOutputConverter' ? 'bg-sky-50'
    : nodeType === 'Load' ? 'bg-orange-50'
    : nodeType === 'Subsystem' ? 'bg-violet-50'
    : nodeType === 'SubsystemInput' ? 'bg-slate-50'
    : 'bg-white'
  const borderClass = isSelected ? 'border-sky-500 shadow-lg' : 'border-slate-300'
  const subsystemPorts = nodeType === 'Subsystem' && Array.isArray((data as any).inputPorts)
    ? (data as any).inputPorts
    : []
  const subsystemPortCount = subsystemPorts.length
  const dynamicMinHeight = nodeType === 'Subsystem'
    ? computeSubsystemNodeMinHeight(subsystemPortCount)
    : undefined
  const outputs = Array.isArray((data as any)?.outputs) ? (data as any).outputs : []
  const formatVoltage = (value: unknown) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return null
    return `${num} V`
  }
  const inputConnectionCount = Number((data as any)?.inputConnectionCount) || 0
  const inputVoltageText = formatVoltage((data as any)?.inputVoltage)
  const rawOutputVoltage = (data as any)?.outputVoltage
  const outputVoltageText = (() => {
    if (typeof rawOutputVoltage !== 'number') return null
    if (!Number.isFinite(rawOutputVoltage)) return null
    if (rawOutputVoltage <= 0) return null
    return formatVoltage(rawOutputVoltage)
  })()
  const fallbackInputVoltageText = (() => {
    if (nodeType === 'Bus') {
      return formatVoltage((data as any)?.outputVoltage ?? (data as any)?.V_bus)
    }
    if (nodeType === 'SubsystemInput') {
      return formatVoltage((data as any)?.outputVoltage ?? (data as any)?.Vout)
    }
    return null
  })()
  return (
    <div
      className={`rounded-lg border ${borderClass} ${bgClass} px-2 py-1 text-xs text-center min-w-[140px] relative`}
      style={{
        boxShadow: combinedShadow,
        minHeight: dynamicMinHeight,
        display: 'flex',
        flexDirection: 'column',
        alignItems: nodeType === 'Subsystem' ? 'stretch' : 'center',
        justifyContent: nodeType === 'Subsystem' ? 'flex-start' : 'center',
        paddingTop: nodeType === 'Subsystem' ? 3 : undefined,
        paddingBottom: nodeType === 'Subsystem' ? 3 : undefined,
      }}
    >
      {isSelected && (
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: 1 }}>
          <div style={{ position: 'absolute', top: -4, left: -4, width: 16, height: 16, borderTop: `4px solid ${accentColor}`, borderLeft: `4px solid ${accentColor}`, borderTopLeftRadius: 12 }} />
          <div style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderTop: `4px solid ${accentColor}`, borderRight: `4px solid ${accentColor}`, borderTopRightRadius: 12 }} />
          <div style={{ position: 'absolute', bottom: -4, left: -4, width: 16, height: 16, borderBottom: `4px solid ${accentColor}`, borderLeft: `4px solid ${accentColor}`, borderBottomLeftRadius: 12 }} />
          <div style={{ position: 'absolute', bottom: -4, right: -4, width: 16, height: 16, borderBottom: `4px solid ${accentColor}`, borderRight: `4px solid ${accentColor}`, borderBottomRightRadius: 12 }} />
        </div>
      )}
      {(nodeType==='Converter' || nodeType==='DualOutputConverter' || nodeType==='Load' || nodeType==='Bus') && (
        <>
          <Handle type="target" position={Position.Left} id="input" style={{ background: '#555' }} />
          <div
            style={{
              position: 'absolute',
              left: -8,
              top: 'calc(50% + 3px)',
              transform: 'translate(-100%, 0)',
              fontSize: '10px',
              color: '#666',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              textAlign: 'right',
            }}
          >
            {(() => {
              if (nodeType === 'Load') {
                return `${Number(((data as any).Vreq ?? 0))} V`
              }
              if (nodeType === 'Converter' || nodeType === 'DualOutputConverter') {
                return inputConnectionCount > 0 && inputVoltageText ? inputVoltageText : 'input'
              }
              if (nodeType === 'Bus') {
                if (inputConnectionCount > 0 && inputVoltageText) return inputVoltageText
                return fallbackInputVoltageText ?? 'input'
              }
              return 'input'
            })()}
          </div>
        </>
      )}
      {nodeType==='SubsystemInput' && (
        <>
          <Handle type="target" position={Position.Left} id={props.id} style={{ background: '#555' }} />
          <div
            style={{
              position: 'absolute',
              left: -8,
              top: 'calc(50% + 3px)',
              transform: 'translate(-100%, 0)',
              fontSize: '10px',
              color: '#666',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              textAlign: 'right',
            }}
          >
            {(inputConnectionCount > 0 && inputVoltageText ? inputVoltageText : (fallbackInputVoltageText ?? formatVoltage((data as any)?.Vout) ?? 'input'))}
          </div>
        </>
      )}
      {nodeType==='Subsystem' && (
        (() => {
          const ports = subsystemPorts
          const count = ports.length
          if (count === 0) return (
            <>
              <Handle type="target" position={Position.Left} id="input" style={{ background: '#555' }} />
              <div
                style={{
                  position: 'absolute',
                  left: -8,
                  top: 'calc(50% + 3px)',
                  transform: 'translate(-100%, 0)',
                  fontSize: '10px',
                  color: '#666',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  textAlign: 'right',
                }}
              >
                {(() => {
                  const connections = Number((data as any)?.inputConnectionCount) || 0
                  const voltageText = formatVoltage((data as any)?.inputVoltage)
                  if (connections > 0 && voltageText) return voltageText
                  return voltageText ?? 'input'
                })()}
              </div>
            </>
          )
          return (
            <>
              {ports.map((p:any, idx:number) => {
                const pct = getSubsystemPortPosition(idx, count)
                const connectionCount = Number((p as any)?.connectionCount) || 0
                const portInputVoltageText = formatVoltage((p as any)?.inputVoltage)
                const definedVoltageText = portInputVoltageText ?? formatVoltage(p.Vout)
                const voltageText = connectionCount > 0 && portInputVoltageText ? portInputVoltageText : (definedVoltageText ?? 'input')
                const portName = (() => {
                  const pick = (value: unknown) => typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
                  const fallbackId = p?.id != null ? String(p.id).trim() : ''
                  return pick((p as any)?.name) ?? pick((p as any)?.label) ?? (fallbackId || 'input')
                })()
                const labelParts = [portName, voltageText].filter(Boolean)
                const label = labelParts.join(' | ')
                const labelOffset = 3
                return (
                  <React.Fragment key={p.id}>
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={p.id}
                      style={{ background: '#555', top: `${pct}%`, transform: 'translate(-50%, -50%)' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        left: -8,
                        top: `calc(${pct}% + ${labelOffset}px)`,
                        transform: 'translate(-100%, 0)',
                        fontSize: '10px',
                        color: '#334155',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        textAlign: 'right',
                      }}
                    >
                      {label}
                    </div>
                  </React.Fragment>
                )
              })}
            </>
          )
        })()
      )}
      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <div style={{ width: '100%' }}>{data.label}</div>
      </div>
      {/* Dot overlay intentionally removed when parallel count exceeds threshold */}
      {bracketElement}
      {nodeType === 'DualOutputConverter'
        ? (() => {
            const count = outputs.length || 1
            return (
              <>
                {(outputs.length ? outputs : [{ id: 'outputA', label: 'Output A', Vout: 0 }]).map((output: any, idx: number) => {
                  const handleId = output?.id || `output-${idx}`
                  const label = output?.label || `Output ${String.fromCharCode(65 + idx)}`
                  const voltageValue = Number(output?.Vout)
                  const branchVoltageText = Number.isFinite(voltageValue) && voltageValue > 0 ? `${voltageValue} V` : null
                  const topOffset = 50 + ((idx - (count - 1) / 2) * 24)
                  return (
                    <React.Fragment key={handleId}>
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={handleId}
                        style={{ background: '#555', top: `${topOffset}%` }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          right: -8,
                          top: `${topOffset}%`,
                          transform: 'translate(100%, -50%)',
                          fontSize: '10px',
                          color: '#666',
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                          textAlign: 'left',
                        }}
                      >
                        {branchVoltageText ?? label}
                      </div>
                    </React.Fragment>
                  )
                })}
              </>
            )
          })()
        : (nodeType === 'Source' || nodeType === 'Converter' || nodeType === 'SubsystemInput' || nodeType === 'Bus') && (
          <>
            <Handle type="source" position={Position.Right} id="output" style={{ background: '#555' }} />
            <div
              style={{
                position: 'absolute',
                right: -8,
                top: 'calc(50% + 3px)',
                transform: 'translate(100%, 0)',
                fontSize: '10px',
                color: '#666',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                textAlign: 'left',
              }}
            >
              {(() => {
                if (nodeType === 'Converter' || nodeType === 'Bus' || nodeType === 'SubsystemInput') {
                  return outputVoltageText ?? formatVoltage((data as any)?.outputVoltage) ?? 'output'
                }
                return 'output'
              })()}
            </div>
          </>
        )}
    </div>
  )
}

function buildNodeDisplayData(node: AnyNode, computeNodes: Record<string, any> | undefined, edges?: Edge[], allNodes?: AnyNode[]) {
  const nodeResult = computeNodes?.[node.id]
  const incomingEdges = Array.isArray(edges)
    ? edges.filter(edge => edge.to === node.id)
    : []
  const nodeLookup = Array.isArray(allNodes)
    ? new Map(allNodes.map(n => [n.id, n]))
    : undefined
  const getSourceNode = (id: string): AnyNode | undefined => {
    if (nodeLookup) return nodeLookup.get(id)
    if (Array.isArray(allNodes)) return allNodes.find(n => n.id === id)
    return undefined
  }
  const resolveNodeOutputVoltage = (sourceNode: AnyNode | undefined, computeNode: any, handleId?: string): number | undefined => {
    if (!sourceNode) return undefined
    const raw = sourceNode as any
    const toNumber = (value: unknown): number | undefined => {
      const num = Number(value)
      return Number.isFinite(num) ? num : undefined
    }
    switch (sourceNode.type) {
      case 'Source':
        return toNumber(raw.Vout)
      case 'Converter':
        return toNumber(raw.Vout)
      case 'DualOutputConverter': {
        const outputs = Array.isArray(raw.outputs) ? raw.outputs : []
        const fallback = outputs.length > 0 ? outputs[0] : undefined
        const branch = handleId ? outputs.find((b: any) => b?.id === handleId) : undefined
        const candidate = branch?.Vout ?? fallback?.Vout
        const direct = toNumber(candidate)
        if (direct !== undefined) return direct
        const metrics = computeNode?.__outputs || {}
        const metricKey = branch?.id || fallback?.id
        if (metricKey && Number.isFinite(metrics[metricKey]?.Vout)) {
          return Number(metrics[metricKey].Vout)
        }
        return undefined
      }
      case 'Bus':
        return toNumber(raw.V_bus)
      case 'SubsystemInput':
        return toNumber(raw.Vout)
      case 'Subsystem': {
        const metrics = computeNode?.__portVoltageMap
        if (metrics && handleId && Number.isFinite(metrics[handleId])) {
          return Number(metrics[handleId])
        }
        const projectNodes = Array.isArray(raw.project?.nodes) ? raw.project.nodes as AnyNode[] : []
        const port = projectNodes.find((n: any) => n.id === handleId && n.type === 'SubsystemInput') as any
        return toNumber(port?.Vout)
      }
      default:
        return undefined
    }
  }
  const getVoltageFromEdge = (edge: Edge): number | undefined => {
    const source = getSourceNode(edge.from)
    if (!source) return undefined
    const value = resolveNodeOutputVoltage(source, computeNodes?.[edge.from], (edge as any).fromHandle as string | undefined)
    return Number.isFinite(value) ? Number(value) : undefined
  }
  const EDGE_DEFAULT_KEY = '__default__'
  const edgesByHandle = new Map<string, Edge[]>()
  for (const edge of incomingEdges) {
    const handle = (edge as any).toHandle as string | undefined
    const key = handle ?? EDGE_DEFAULT_KEY
    const bucket = edgesByHandle.get(key)
    if (bucket) bucket.push(edge)
    else edgesByHandle.set(key, [edge])
  }
  const edgesForHandle = (handleId?: string, allowDefaultFallback = false): Edge[] => {
    if (handleId) {
      const direct = edgesByHandle.get(handleId) || []
      if (handleId === 'input') {
        const defaults = edgesByHandle.get(EDGE_DEFAULT_KEY) || []
        if (defaults.length === 0) return direct
        return direct.length ? [...direct, ...defaults] : [...defaults]
      }
      if (allowDefaultFallback && direct.length === 0) {
        return edgesByHandle.get(EDGE_DEFAULT_KEY) || []
      }
      return direct
    }
    return edgesByHandle.get(EDGE_DEFAULT_KEY) || []
  }
  const inferVoltageForHandle = (handleId?: string, allowDefaultFallback = false): number | undefined => {
    const list = edgesForHandle(handleId, allowDefaultFallback)
    for (const edge of list) {
      const value = getVoltageFromEdge(edge)
      if (value !== undefined) return value
    }
    return undefined
  }
  const defaultTargetHandleId = node.type === 'SubsystemInput' ? node.id : 'input'
  const defaultHandleEdges = edgesForHandle(defaultTargetHandleId, node.type === 'SubsystemInput')
  const defaultHandleConnectionCount = defaultHandleEdges.length
  const defaultHandleVoltage = inferVoltageForHandle(defaultTargetHandleId, node.type === 'SubsystemInput')
  const resolvedInputVoltage = (() => {
    if (typeof defaultHandleVoltage === 'number' && Number.isFinite(defaultHandleVoltage)) {
      return defaultHandleVoltage
    }
    const vin = nodeResult?.V_upstream
    return typeof vin === 'number' && Number.isFinite(vin) ? vin : undefined
  })()
  const data: any = { type: node.type }
  if (node.type === 'Converter' || node.type === 'DualOutputConverter' || node.type === 'Bus' || node.type === 'SubsystemInput') {
    data.inputConnectionCount = defaultHandleConnectionCount
    if (typeof resolvedInputVoltage === 'number' && Number.isFinite(resolvedInputVoltage)) {
      data.inputVoltage = resolvedInputVoltage
    }
  }
  if (node.type === 'Converter') {
    const vout = (node as any).Vout
    if (typeof vout === 'number' && Number.isFinite(vout)) data.outputVoltage = vout
  }
  if (node.type === 'Bus') {
    const vbus = (node as any).V_bus
    if (typeof vbus === 'number' && Number.isFinite(vbus)) data.outputVoltage = vbus
  }
  if (node.type === 'Subsystem') {
    const projectNodes = Array.isArray((node as any).project?.nodes)
      ? (node as any).project.nodes
      : []
    const subsystemInputs = projectNodes.filter((x:any)=>x.type==='SubsystemInput')
    const inputPortInfos = subsystemInputs.map((x:any)=>{
      const fallback = Number(x.Vout)
      const fallbackVoltage = Number.isFinite(fallback) ? fallback : undefined
      const inferred = inferVoltageForHandle(x.id, true)
      const connections = edgesForHandle(x.id, true).length
      return {
        id: x.id,
        Vout: x.Vout,
        name: x.name,
        connectionCount: connections,
        inputVoltage: typeof inferred === 'number' && Number.isFinite(inferred) ? inferred : fallbackVoltage,
      }
    })
    const portIds = inputPortInfos
      .map(port => (typeof port?.id === 'string' ? port.id : ''))
      .filter(id => id.length > 0)
    const storedOrder = (node as any).inputHandleOrder
    const sanitizedOrder = sanitizeSubsystemHandleOrder(portIds, storedOrder)
    const orderedPorts = orderSubsystemPorts(inputPortInfos, sanitizedOrder)
    data.inputPorts = orderedPorts
    if (sanitizedOrder.length > 0) {
      data.inputHandleOrder = sanitizedOrder
    }
  }
  if (node.type === 'SubsystemInput') {
    const vout = (node as any).Vout
    if (typeof vout === 'number' && Number.isFinite(vout)) {
      data.Vout = vout
      data.outputVoltage = vout
    }
  }
  if (node.type === 'DualOutputConverter') data.outputs = (node as any).outputs || []
  return data
}

const parallelCountForNode = (node: any): number => {
  if (!node) return 1
  if (node.type === 'Load') {
    const value = Number(node.numParalleledDevices)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1
  }
  if (node.type === 'Subsystem') {
    const value = Number(node.numParalleledSystems)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1
  }
  return 1
}

export default function SubsystemCanvas({
  subsystemId,
  subsystemPath,
  project,
  onSelect,
  onOpenNested,
  selectionMode,
  selectionModeSource,
  onSelectionModeChange,
}:{
  subsystemId: string
  subsystemPath?: string[]
  project: Project
  onSelect: (selection: InspectorSelection | MultiSelection | null) => void
  onOpenNested?: (id: string) => void
  selectionMode: SelectionMode
  selectionModeSource: SelectionModeSource
  onSelectionModeChange: (mode: SelectionMode, options?: SelectionModeChangeOptions) => void
}) {
  const addEdgeStore = useStore(s=>s.nestedSubsystemAddEdge)
  const updatePos = useStore(s=>s.nestedSubsystemUpdateNodePos)
  const removeNode = useStore(s=>s.nestedSubsystemRemoveNode)
  const removeEdge = useStore(s=>s.nestedSubsystemRemoveEdge)
  const updateEdgeNested = useStore(s=>s.nestedSubsystemUpdateEdge)
  const addNodeNested = useStore(s=>s.nestedSubsystemAddNode)
  const bulkUpdateNodesStore = useStore(s=>s.bulkUpdateNodes)
  const quickPresets = useStore(s=>s.quickPresets)
  const quickPresetDialogs = useQuickPresetDialogs()
  const clipboard = useStore(s=>s.clipboard)
  const setClipboard = useStore(s=>s.setClipboard)
  const openSubsystemIds = useStore(s=>s.openSubsystemIds)
  const undo = useStore(s=>s.undo)
  const redo = useStore(s=>s.redo)
  const pastLen = useStore(s=>s.past.length)
  const futureLen = useStore(s=>s.future.length)
  const reactFlowInstance = useReactFlow()
  const { screenToFlowPosition } = reactFlowInstance

  const path = useMemo(()=> (subsystemPath && subsystemPath.length>0)? subsystemPath : [subsystemId], [subsystemPath, subsystemId])
  const groupMidpointInfo = useMemo(() => computeEdgeGroupInfo(project.edges), [project.edges])
  const liveMidpointDraft = useRef(new Map<string, { offset: number; absoluteAxisCoord?: number; axis: 'x' | 'y' }>())
  const setEdgesRef = useRef<React.Dispatch<React.SetStateAction<RFEdge[]>> | null>(null)
  const multiDragStateRef = useRef<{ originId: string; positions: Map<string, { x: number; y: number }> } | null>(null)
  useEffect(() => {
    liveMidpointDraft.current.clear()
  }, [project.edges])
  const isTopmostEditor = useMemo(()=>{
    if (!openSubsystemIds || openSubsystemIds.length === 0) return true
    if (path.length !== openSubsystemIds.length) return false
    return path.every((id, idx)=>openSubsystemIds[idx] === id)
  }, [openSubsystemIds, path])
  const [contextMenu, setContextMenu] = useState<{ type: 'node'|'pane'; x:number; y:number; targetId?: string }|null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string|null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string|null>(null)
  const [selectedMarkupId, setSelectedMarkupId] = useState<string | null>(null)
  const [multiSelection, setMultiSelection] = useState<MultiSelection | null>(null)
  const [multiSelectionPreview, setMultiSelectionPreview] = useState<MultiSelection | null>(null)
  const activeMultiSelection = multiSelectionPreview ?? multiSelection
  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const marqueeStateRef = useRef<{
    originClient: { x: number; y: number }
    originFlow: { x: number; y: number }
    additive: boolean
    forcedMulti: boolean
  } | null>(null)
const skipPaneClickRef = useRef(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const markups = Array.isArray(project.markups) ? project.markups : []

  const nodeTypes = useMemo(() => ({ custom: CustomNode }), [])
  const edgeTypes = useMemo(() => ({ orthogonal: OrthogonalEdge }), [])
  const computeResult = useMemo(()=> compute(project), [project])

  const rfNodesInit: RFNode[] = useMemo(()=>project.nodes.map(n=>{
    const parallelCount = parallelCountForNode(n as any)
    const extra = buildNodeDisplayData(n, computeResult.nodes, project.edges, project.nodes as AnyNode[])
    return {
    id: n.id,
    data: {
      label: (
        <div className="flex flex-col items-stretch gap-1">
          <div className="text-center font-semibold">{n.name}</div>
          <div className="flex items-stretch justify-between gap-2">
            <div className="text-left">
              {n.type === 'Source' && 'Vout' in n ? (
                <div>
                  <div style={{fontSize:'11px',color:'#555'}}>Vout: {(n as any).Vout}V</div>
                </div>
              ) : n.type === 'Converter' && 'Vout' in n && 'efficiency' in n ? (
                <div>
                  <div style={{fontSize:'11px',color:'#555'}}>Vout: {(n as any).Vout}V</div>
                  <div style={{fontSize:'11px',color:'#555'}}>η: {(() => {
                    const nodeResult = computeResult.nodes[n.id];
                    const eff = (n as any).efficiency;
                    if (eff?.type === 'curve' && nodeResult) {
                      const eta = etaFromModel(eff, nodeResult.P_out ?? 0, nodeResult.I_out ?? 0, n as any);
                      return (eta * 100).toFixed(1) + '%';
                    } else if (eff?.type === 'fixed') {
                      return ((eff.value ?? 0) * 100).toFixed(1) + '%';
                    } else if (eff?.points?.[0]?.eta) {
                      return ((eff.points[0].eta ?? 0) * 100).toFixed(1) + '%';
                    } else {
                      return '—';
                    }
                  })()}</div>
                </div>
               ) : n.type === 'DualOutputConverter' ? (
                (() => {
                  const nodeResult = computeResult.nodes[n.id] as any
                  const metrics: Record<string, any> = nodeResult?.__outputs || {}
                  const outputs = Array.isArray((n as any).outputs) ? (n as any).outputs : []
                  const fallback = outputs.length > 0 ? outputs[0] : undefined
                  const pin = nodeResult?.P_in
                  const pout = nodeResult?.P_out
                  return (
                    <div style={{display:'flex', alignItems:'stretch', gap:8}}>
                      <div className="text-left" style={{minWidth:120}}>
                        {outputs.map((branch:any, idx:number) => {
                          const handleId = branch?.id || (idx === 0 ? (fallback?.id || 'outputA') : `${fallback?.id || 'outputA'}-${idx}`)
                          const metric = metrics[handleId] || {}
                          const eta = typeof metric.eta === 'number' ? metric.eta : undefined
                          const label = branch?.label || `Output ${String.fromCharCode(65 + idx)}`
                          return (
                            <div key={handleId} style={{fontSize:'11px',color:'#555'}}>
                              <div>{label}: {(branch?.Vout ?? 0)}V, η: {eta !== undefined ? (eta * 100).toFixed(1) + '%' : '—'}</div>
                              <div style={{fontSize:'10px',color:'#64748b'}}>
                                P_out: {renderPowerDisplay(metric.P_out)} | I_out: {Number.isFinite(metric.I_out) ? `${(metric.I_out || 0).toFixed(3)} A` : '—'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <span style={{display:'inline-block', alignSelf:'stretch', width:1, background:'#cbd5e1'}} />
                      <div className="text-left" style={{minWidth:90}}>
                        <div style={{fontSize:'11px',color:'#1e293b'}}>P_in: {renderPowerDisplay(pin)}</div>
                        <div style={{fontSize:'11px',color:'#1e293b'}}>P_out: {renderPowerDisplay(pout)}</div>
                      </div>
                    </div>
                  )
                })()
               ) : n.type === 'Load' && 'Vreq' in n && 'I_typ' in n && 'I_max' in n ? (
                <div style={{display:'flex', alignItems:'stretch', gap:8}}>
                  <div className="text-left">
                    <div style={{fontSize:'11px',color:'#555'}}>I_typ: {(n as any).I_typ}A</div>
                    <div style={{fontSize:'11px',color:'#555'}}>I_max: {(n as any).I_max}A</div>
                    <div style={{fontSize:'11px',color:'#555'}}>Paralleled: {((n as any).numParalleledDevices ?? 1)}</div>
                  </div>
                  <span style={{display:'inline-block', alignSelf:'stretch', width:1, background:'#cbd5e1'}} />
                  <div className="text-left" style={{minWidth:70}}>
                    <div style={{fontSize:'11px',color:'#1e293b'}}>P_in: {renderPowerDisplay(computeResult.nodes[n.id]?.P_in)}</div>
                  </div>
                </div>
               ) : n.type === 'Subsystem' ? (
                <div>
                  <div style={{fontSize:'11px',color:'#555'}}>Paralleled: {((n as any).numParalleledSystems ?? 1)}</div>
                </div>
               ) : n.type === 'SubsystemInput' ? (
                <div>
                  <div style={{fontSize:'11px',color:'#555'}}>Subsystem Input</div>
                  <div style={{fontSize:'11px',color:'#555'}}>Vout: {(n as any).Vout ?? 0}V</div>
                </div>
               ) : n.type === 'Note' && 'text' in n ? (
                <div>
                  <div style={{fontSize:'11px',color:'#555', whiteSpace:'pre-wrap'}}>{(n as any).text}</div>
                </div>
               ) : null}
            </div>
          </div>
        </div>
      ),
      type: (n as AnyNode).type,
      parallelCount,
      ...(n.type==='Load'? { Vreq: (n as any).Vreq } : {}),
      ...(n.type==='Subsystem'? { inputPorts: (extra as any).inputPorts } : {}),
      ...(n.type==='DualOutputConverter'? { outputs: (extra as any).outputs, outputMetrics: ((computeResult.nodes[n.id] as any)||{}).__outputs || {} } : {}),
      ...(extra || {}),
    },
    position: { x: n.x ?? (Math.random()*400)|0, y: n.y ?? (Math.random()*300)|0 },
    type: 'custom',
    draggable: true,
    selected: false,
  }
  }), [project.nodes, project.edges, computeResult.nodes])

  const [nodes, setNodes, ] = useNodesState(rfNodesInit)

  const clearMultiSelection = useCallback(
    (options?: { preserveTemporary?: boolean }) => {
      setMultiSelection(null)
      setMultiSelectionPreview(null)
      setMarqueeRect(null)
      marqueeStateRef.current = null
      if (
        !options?.preserveTemporary &&
        selectionMode === 'multi' &&
        selectionModeSource === 'temporary'
      ) {
        onSelectionModeChange('single', { source: 'temporary' })
      }
    },
    [onSelectionModeChange, selectionMode, selectionModeSource]
  )

  const handleSingleSelectClick = useCallback(() => {
    onSelectionModeChange('single')
  }, [onSelectionModeChange])

  const handleMultiSelectClick = useCallback(() => {
    const nextMode: SelectionMode = selectionMode === 'multi' ? 'single' : 'multi'
    onSelectionModeChange(nextMode)
  }, [onSelectionModeChange, selectionMode])

  const isSelectActive = selectionMode === 'single'
  const isMultiActive = selectionMode === 'multi'

  const mergeSelections = useCallback(
    (base: MultiSelection | null, addition: MultiSelection): MultiSelection =>
      mergeMultiSelections(base, addition),
    []
  )

  const applyMultiSelection = useCallback(
    (selection: MultiSelection | null, options?: SelectionModeChangeOptions) => {
      const normalized = normalizeMultiSelection(selection)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setSelectedMarkupId(null)
      setMultiSelectionPreview(null)
      setMultiSelection(normalized)
      if (normalized) {
        if (selectionMode !== 'multi') {
          onSelectionModeChange('multi', options)
        }
        onSelect(normalized)
      } else {
        onSelect(null)
        if (selectionMode === 'multi' && selectionModeSource === 'temporary') {
          onSelectionModeChange('single', options ?? { source: 'temporary' })
        }
      }
    },
    [onSelect, onSelectionModeChange, selectionMode, selectionModeSource]
  )

  const getSelectionSeed = useCallback((): MultiSelection => {
    if (multiSelection && selectionHasItems(multiSelection)) {
      return ensureMultiSelection(multiSelection)
    }
    const seed = emptyMultiSelection()
    if (selectedNodeId) seed.nodes.push(selectedNodeId)
    if (selectedEdgeId) seed.edges.push(selectedEdgeId)
    if (selectedMarkupId) seed.markups.push(selectedMarkupId)
    return seed
  }, [multiSelection, selectedEdgeId, selectedMarkupId, selectedNodeId])

  const selectSingleNode = useCallback(
    (nodeId: string) => {
      onSelect({ kind: 'node', id: nodeId })
      setSelectedNodeId(nodeId)
      setSelectedEdgeId(null)
      setSelectedMarkupId(null)
    },
    [onSelect]
  )

  const selectSingleEdge = useCallback(
    (edgeId: string) => {
      onSelect({ kind: 'edge', id: edgeId })
      setSelectedEdgeId(edgeId)
      setSelectedNodeId(null)
      setSelectedMarkupId(null)
    },
    [onSelect]
  )

  const selectSingleNodeWithClear = useCallback(
    (nodeId: string) => {
      clearMultiSelection({ preserveTemporary: false })
      selectSingleNode(nodeId)
    },
    [clearMultiSelection, selectSingleNode]
  )

  const selectSingleEdgeWithClear = useCallback(
    (edgeId: string) => {
      clearMultiSelection({ preserveTemporary: false })
      selectSingleEdge(edgeId)
    },
    [clearMultiSelection, selectSingleEdge]
  )

  const toggleWithModifier = useCallback(
    (
      payload: { kind: 'node' | 'edge'; id: string },
      fallback: () => void
    ) => {
      const seed = getSelectionSeed()
      if (!selectionHasItems(seed)) {
        fallback()
        return
      }
      const toggled = toggleInMultiSelection(seed, payload)
      const normalized = normalizeMultiSelection(toggled)
      if (!normalized) {
        applyMultiSelection(null, { source: 'temporary' })
        return
      }
      const total =
        normalized.nodes.length + normalized.edges.length + normalized.markups.length
      if (total <= 1) {
        applyMultiSelection(null, { source: 'temporary' })
        fallback()
        return
      }
      applyMultiSelection(normalized, { source: 'temporary' })
    },
    [applyMultiSelection, getSelectionSeed]
  )

  const computeSelectionWithinBounds = useCallback(
    (bounds: Bounds): MultiSelection => {
      const rfNodes = reactFlowInstance.getNodes()
      const nodeIds: string[] = []
      const nodeBoundsMap = new Map<string, Bounds>()
      for (const node of rfNodes) {
        const position = node.positionAbsolute ?? node.position
        const width = Number.isFinite(node.width) ? (node.width as number) : 200
        const height = Number.isFinite(node.height) ? (node.height as number) : 120
        const rect: Bounds = {
          minX: position.x,
          maxX: position.x + width,
          minY: position.y,
          maxY: position.y + height,
        }
        nodeBoundsMap.set(node.id, rect)
        if (boundsIntersects(rect, bounds)) {
          nodeIds.push(node.id)
        }
      }

      const nodeIdSet = new Set(nodeIds)
      const edgeIds: string[] = []
      const rfEdges = reactFlowInstance.getEdges()
      for (const edge of rfEdges) {
        const sourceRect = nodeBoundsMap.get(edge.source)
        const targetRect = nodeBoundsMap.get(edge.target)
        if (!sourceRect || !targetRect) continue
        const combined: Bounds = {
          minX: Math.min(sourceRect.minX, sourceRect.maxX, targetRect.minX, targetRect.maxX),
          maxX: Math.max(sourceRect.minX, sourceRect.maxX, targetRect.minX, targetRect.maxX),
          minY: Math.min(sourceRect.minY, sourceRect.maxY, targetRect.minY, targetRect.maxY),
          maxY: Math.max(sourceRect.minY, sourceRect.maxY, targetRect.minY, targetRect.maxY),
        }
        if (boundsIntersects(combined, bounds) || (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))) {
          edgeIds.push(edge.id)
        }
      }

      const markupIds: string[] = []
      for (const markup of markups) {
        let rect: Bounds | null = null
        if (markup.type === 'text' || markup.type === 'rectangle') {
          const width = markup.type === 'rectangle' ? markup.size.width : markup.size?.width ?? 220
          const height = markup.type === 'rectangle'
            ? markup.size.height
            : Math.max(18, (markup.fontSize ?? 16) * 1.4)
          rect = {
            minX: markup.position.x,
            maxX: markup.position.x + width,
            minY: markup.position.y,
            maxY: markup.position.y + height,
          }
        } else if (markup.type === 'line') {
          rect = pointsToBounds([
            { x: markup.start.x, y: markup.start.y },
            { x: markup.end.x, y: markup.end.y },
          ])
        }
        if (rect && boundsIntersects(rect, bounds)) {
          markupIds.push(markup.id)
        }
      }

      return {
        kind: 'multi',
        nodes: nodeIds,
        edges: edgeIds,
        markups: markupIds,
      }
    },
    [markups, reactFlowInstance]
  )

  const startMarqueeSelection = useCallback(
    (originClient: { x: number; y: number }, additive: boolean, forcedMulti = false) => {
      if (!wrapperRef.current) return
      const bounds = wrapperRef.current.getBoundingClientRect()
      const originFlow = screenToFlowPosition(originClient)
      marqueeStateRef.current = { originClient, originFlow, additive, forcedMulti }
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setSelectedMarkupId(null)
      setMultiSelectionPreview(null)
      setMarqueeRect({
        left: originClient.x - bounds.left,
        top: originClient.y - bounds.top,
        width: 0,
        height: 0,
      })

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const state = marqueeStateRef.current
        if (!state || (selectionMode !== 'multi' && !state.forcedMulti)) return
        const current = { x: moveEvent.clientX, y: moveEvent.clientY }
        const rectLeft = Math.min(state.originClient.x, current.x) - bounds.left
        const rectTop = Math.min(state.originClient.y, current.y) - bounds.top
        const rectWidth = Math.abs(current.x - state.originClient.x)
        const rectHeight = Math.abs(current.y - state.originClient.y)
        setMarqueeRect({ left: rectLeft, top: rectTop, width: rectWidth, height: rectHeight })
        const currentFlow = screenToFlowPosition(current)
        const flowBounds = normalizeBounds(state.originFlow, currentFlow)
        const draft = computeSelectionWithinBounds(flowBounds)
        const preview = state.additive ? mergeSelections(multiSelection, draft) : draft
        setMultiSelectionPreview(preview)
      }

      const handlePointerUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerCancel)
        const state = marqueeStateRef.current
        marqueeStateRef.current = null
        if (!state) return
        const current = { x: upEvent.clientX, y: upEvent.clientY }
        const flowBounds = normalizeBounds(state.originFlow, screenToFlowPosition(current))
        let result = computeSelectionWithinBounds(flowBounds)
        if (state.additive) {
          result = mergeSelections(multiSelection, result)
        }
        setMarqueeRect(null)
        setMultiSelectionPreview(null)
        if (selectionHasItems(result)) {
        skipPaneClickRef.current = true
          applyMultiSelection(result, state.forcedMulti ? { source: 'temporary' } : undefined)
        } else if (!state.additive) {
          applyMultiSelection(null, state.forcedMulti ? { source: 'temporary' } : undefined)
        }
      }

      const handlePointerCancel = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerCancel)
        const state = marqueeStateRef.current
        marqueeStateRef.current = null
        setMarqueeRect(null)
        setMultiSelectionPreview(null)
        if (state?.forcedMulti) {
          onSelectionModeChange('single', { source: 'temporary' })
        }
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerCancel)
    },
    [applyMultiSelection, computeSelectionWithinBounds, mergeSelections, multiSelection, onSelectionModeChange, screenToFlowPosition, selectionMode]
  )

  const resolveNodeSnapshotById = useCallback(
    (nodeId: string): AnyNode | null => {
      const node = project.nodes.find(n => n.id === nodeId)
      return node ? (JSON.parse(JSON.stringify(node)) as AnyNode) : null
    },
    [project.nodes]
  )

  const resolveEdgeSnapshotById = useCallback(
    (edgeId: string): Edge | null => {
      const edge = project.edges.find(e => e.id === edgeId)
      return edge ? (JSON.parse(JSON.stringify(edge)) as Edge) : null
    },
    [project.edges]
  )

  const resolveMarkupSnapshotById = useCallback(
    (markupId: string): CanvasMarkup | null => {
      const markup = markups.find(m => m.id === markupId)
      return markup ? (JSON.parse(JSON.stringify(markup)) as CanvasMarkup) : null
    },
    [markups]
  )

  const collectClipboardPayload = useCallback(
    (selection: MultiSelection): ClipboardPayload | null =>
      collectClipboardPayloadShared(selection, {
        resolveNodeSnapshot: resolveNodeSnapshotById,
        resolveEdgeSnapshot: resolveEdgeSnapshotById,
        resolveMarkupSnapshot: resolveMarkupSnapshotById,
      }),
    [resolveEdgeSnapshotById, resolveMarkupSnapshotById, resolveNodeSnapshotById]
  )

  const performPaste = useCallback(
    (target: { x: number; y: number }) => {
      const payload = clipboard
      if (!payload) return false
      if (!payload.nodes.length && !payload.markups.length) return false
      const { newNodeIds, newEdgeIds, newMarkupIds } = applyClipboardPayload({
        payload,
        target,
        generateNodeId: () => genId('node_'),
        generateEdgeId: () => genId('edge_'),
        addNode: node => addNodeNested(path, node),
        addEdge: edge => addEdgeStore(path, edge),
      })
      if (newNodeIds.length || newEdgeIds.length || newMarkupIds.length) {
        applyMultiSelection({ kind: 'multi', nodes: newNodeIds, edges: newEdgeIds, markups: newMarkupIds })
        return true
      }
      return false
    },
    [addEdgeStore, addNodeNested, applyMultiSelection, clipboard, path]
  )

  const deleteSelection = useCallback(
    (selection: MultiSelection) => {
      for (const nodeId of selection.nodes) {
        removeNode(path, nodeId)
      }
      for (const edgeId of selection.edges) {
        removeEdge(path, edgeId)
      }
      // Markup deletion not yet supported inside subsystem canvas
      applyMultiSelection(null)
    },
    [applyMultiSelection, path, removeEdge, removeNode]
  )

  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const node of nodes) {
      map.set(node.id, { x: node.position.x, y: node.position.y })
    }
    return map
  }, [nodes])

  const getGroupOffset = useCallback((edge: { from: string; to?: string; fromHandle?: string | null }) => {
    const info = groupMidpointInfo.get(edgeGroupKey(edge))
    if (!info) return 0.5
    const { midpointX, offset } = info
    if (midpointX === undefined) return offset
    const sourcePos = nodePositions.get(edge.from)
    const targetPos = edge.to ? nodePositions.get(edge.to) : undefined
    const startX = sourcePos?.x
    const endX = targetPos?.x
    if (typeof startX === 'number' && typeof endX === 'number' && Number.isFinite(startX) && Number.isFinite(endX) && Math.abs(endX - startX) > 1e-3) {
      const ratio = (midpointX - startX) / (endX - startX)
      if (Number.isFinite(ratio)) {
        return Math.min(1, Math.max(0, ratio))
      }
    }
    return offset
  }, [groupMidpointInfo, nodePositions])

  useEffect(() => {
    if (selectionMode !== 'multi') {
      setMultiSelection(null)
      setMultiSelectionPreview(null)
      setMarqueeRect(null)
      marqueeStateRef.current = null
    }
  }, [selectionMode])

  const handleMidpointChange = useCallback((edgeId: string, payload: { offset: number; absoluteAxisCoord?: number; axis: 'x' | 'y' }) => {
    const setter = setEdgesRef.current
    if (!setter) return
    if (!Number.isFinite(payload.offset)) return
    const sourceEdge = project.edges.find(e => e.id === edgeId)
    if (!sourceEdge) return
    const key = edgeGroupKey({ from: sourceEdge.from, fromHandle: sourceEdge.fromHandle })
    const clamped = Math.min(1, Math.max(0, payload.offset))
    let usableAbsolute = payload.absoluteAxisCoord
    if (typeof usableAbsolute !== 'number' || !Number.isFinite(usableAbsolute)) {
      const sourcePos = nodePositions.get(sourceEdge.from)
      const targetPos = sourceEdge.to ? nodePositions.get(sourceEdge.to) : undefined
      if (sourcePos && targetPos) {
        const start = payload.axis === 'y' ? sourcePos.y : sourcePos.x
        const end = payload.axis === 'y' ? targetPos.y : targetPos.x
        if (Number.isFinite(start) && Number.isFinite(end) && Math.abs(end - start) > 1e-3) {
          usableAbsolute = start + (end - start) * clamped
        }
      }
    }
    liveMidpointDraft.current.set(key, { ...payload, offset: clamped, absoluteAxisCoord: usableAbsolute })
    setter(prev => prev.map(edge => {
      const data: any = edge.data
      if (!data || data.groupKey !== key) return edge
      const nextData: any = { ...data, midpointOffset: clamped }
      if (typeof usableAbsolute === 'number' && Number.isFinite(usableAbsolute)) {
        nextData.midpointX = usableAbsolute
      }
      return { ...edge, data: nextData }
    }))
  }, [nodePositions, project.edges])

  const handleMidpointCommit = useCallback((edgeId: string, payload: { offset: number; absoluteAxisCoord?: number; axis: 'x' | 'y' }) => {
    if (!updateEdgeNested) return
    if (!Number.isFinite(payload.offset)) return
    const sourceEdge = project.edges.find(e => e.id === edgeId)
    if (!sourceEdge) return
    const key = edgeGroupKey({ from: sourceEdge.from, fromHandle: sourceEdge.fromHandle })
    const draft = liveMidpointDraft.current.get(key)
    liveMidpointDraft.current.delete(key)
    const clamped = Math.min(1, Math.max(0, payload.offset))
    let usableAbsolute = payload.absoluteAxisCoord
    if ((typeof usableAbsolute !== 'number' || !Number.isFinite(usableAbsolute)) && draft && typeof draft.absoluteAxisCoord === 'number' && Number.isFinite(draft.absoluteAxisCoord)) {
      usableAbsolute = draft.absoluteAxisCoord
    }
    if (typeof usableAbsolute !== 'number' || !Number.isFinite(usableAbsolute)) {
      const sourcePos = nodePositions.get(sourceEdge.from)
      const targetPos = sourceEdge.to ? nodePositions.get(sourceEdge.to) : undefined
      if (sourcePos && targetPos) {
        const axis = draft?.axis ?? payload.axis ?? 'x'
        const start = axis === 'y' ? sourcePos.y : sourcePos.x
        const end = axis === 'y' ? targetPos.y : targetPos.x
        if (Number.isFinite(start) && Number.isFinite(end) && Math.abs(end - start) > 1e-3) {
          usableAbsolute = start + (end - start) * clamped
        }
      }
    }
    for (const edge of project.edges) {
      if (edgeGroupKey({ from: edge.from, fromHandle: edge.fromHandle }) !== key) continue
      const patch: Partial<Edge> = { midpointOffset: clamped }
      if (typeof usableAbsolute === 'number' && Number.isFinite(usableAbsolute)) {
        patch.midpointX = usableAbsolute
      }
      updateEdgeNested(path, edge.id, patch)
    }
  }, [nodePositions, path, project.edges, updateEdgeNested])

  useEffect(() => {
    if (!updateEdgeNested) return
    const processed = new Set<string>()
    for (const edge of project.edges) {
      const key = edgeGroupKey({ from: edge.from, fromHandle: edge.fromHandle })
      if (processed.has(key)) continue
      processed.add(key)
      const info = groupMidpointInfo.get(key)
      if (!info || info.midpointX !== undefined) continue
      const sourcePos = nodePositions.get(edge.from)
      const targetPos = nodePositions.get(edge.to)
      if (!sourcePos || !targetPos) continue
      const startX = sourcePos.x
      const endX = targetPos.x
      if (!Number.isFinite(startX) || !Number.isFinite(endX) || Math.abs(endX - startX) <= 1e-3) continue
      const midpointX = startX + (endX - startX) * info.offset
      if (!Number.isFinite(midpointX)) continue
      for (const groupEdge of project.edges) {
        if (edgeGroupKey({ from: groupEdge.from, fromHandle: groupEdge.fromHandle }) !== key) continue
        updateEdgeNested(path, groupEdge.id, { midpointX })
      }
    }
  }, [groupMidpointInfo, nodePositions, path, project.edges, updateEdgeNested])

  const rfEdgesInit: RFEdge[] = useMemo(()=>project.edges.map(e=>{
    const I = computeResult.edges[e.id]?.I_edge ?? 0
    const strokeWidth = Math.max(2, 2 + 3 * Math.log10(I + 1e-3))
    const parent = project.nodes.find(n=>n.id===e.from) as any
    const child = project.nodes.find(n=>n.id===e.to) as any
    const parentV = parent?.type==='Source'? parent?.Vout
      : parent?.type==='Converter'? parent?.Vout
      : parent?.type==='Bus'? parent?.V_bus
      : parent?.type==='SubsystemInput'? parent?.Vout
      : undefined
    const childRange = child?.type==='Converter'? { min: child?.Vin_min, max: child?.Vin_max } : undefined
    const childDirectVin = child?.type==='Load'? child?.Vreq
      : child?.type==='Subsystem'? (()=>{
          const portId = (e as any).toHandle
          if (portId){
            const p = (child as any)?.project?.nodes?.find((x:any)=>x.id===portId)
            return p?.Vout
          }
          const ports = (child as any)?.project?.nodes?.filter((x:any)=>x.type==='SubsystemInput')
          return ports?.length===1? ports[0]?.Vout : undefined
        })()
      : undefined
    const convRangeViolation = (parentV!==undefined && childRange!==undefined) ? !(parentV>=childRange.min && parentV<=childRange.max) : false
    const eqViolation = (parentV!==undefined && childDirectVin!==undefined) ? (parentV !== childDirectVin) : false
    const mismatch = convRangeViolation || eqViolation
    const key = edgeGroupKey({ from: e.from, fromHandle: e.fromHandle })
    const info = groupMidpointInfo.get(key)
    const midpointOffset = getGroupOffset({ from: e.from, to: e.to, fromHandle: e.fromHandle })
    const resistanceLabel = (e.interconnect?.R_milliohm ?? 0).toFixed(2)
    const currentLabel = I.toFixed(1)
    const baseLabel = `${resistanceLabel} mΩ | ${currentLabel} A`
    const label = convRangeViolation ? `${baseLabel} | Converter Vin Range Violation` : (eqViolation ? `${baseLabel} | Vin != Vout` : baseLabel)
    const edgeColor = voltageToEdgeColor(parentV)
    const defaultColor = mismatch ? '#ef4444' : edgeColor
    const edgeData = {
      midpointOffset,
      midpointX: info?.midpointX,
      onMidpointChange: handleMidpointChange,
      onMidpointCommit: handleMidpointCommit,
      screenToFlow: screenToFlowPosition,
      defaultColor,
      extendMidpointRange: true,
      groupKey: key,
    }
    return ({
      id: e.id,
      type: 'orthogonal',
      source: e.from,
      target: e.to,
      sourceHandle: (e as any).fromHandle,
      targetHandle: (e as any).toHandle,
      animated: false,
      label,
      labelStyle: { fill: defaultColor },
      style: { strokeWidth, stroke: defaultColor },
      data: edgeData,
      selected: false,
    })
  }), [project.edges, project.nodes, computeResult, getGroupOffset, handleMidpointChange, handleMidpointCommit, screenToFlowPosition])

  const [edges, setEdges, ] = useEdgesState(rfEdgesInit)
  useEffect(() => {
    setEdgesRef.current = setEdges
  }, [setEdges])

  useEffect(()=>{
    setNodes(prev => {
      const prevById = new Map(prev.map(p=>[p.id, p]))
      const mapped: RFNode[] = project.nodes.map(n=>{
        const existing = prevById.get(n.id)
        const fallbackPosition = existing?.position ?? { x: (Math.random()*400)|0, y: (Math.random()*300)|0 }
        const position = {
          x: typeof n.x === 'number' ? n.x : fallbackPosition.x,
          y: typeof n.y === 'number' ? n.y : fallbackPosition.y,
        }
        const parallelCount = parallelCountForNode(n as any)
        return {
          id: n.id,
          data: {
            label: (
              <div className="flex flex-col items-stretch gap-1">
                <div className="text-center font-semibold">{n.name}</div>
                <div className="flex items-stretch justify-between gap-2">
                  <div className="text-left">
                    {n.type === 'Source' && 'Vout' in n ? (
                      <div>
                        <div style={{fontSize:'11px',color:'#555'}}>Vout: {(n as any).Vout}V</div>
                      </div>
                    ) : n.type === 'Converter' && 'Vout' in n && 'efficiency' in n ? (
                      <div>
                        <div style={{fontSize:'11px',color:'#555'}}>Vout: {(n as any).Vout}V</div>
                        <div style={{fontSize:'11px',color:'#555'}}>η: {(() => {
                          const nodeResult = computeResult.nodes[n.id];
                          const eff = (n as any).efficiency;
                          if (eff?.type === 'curve' && nodeResult) {
                            const eta = etaFromModel(eff, nodeResult.P_out ?? 0, nodeResult.I_out ?? 0, n as any);
                            return (eta * 100).toFixed(1) + '%';
                          } else if (eff?.type === 'fixed') {
                            return ((eff.value ?? 0) * 100).toFixed(1) + '%';
                          } else if (eff?.points?.[0]?.eta) {
                            return ((eff.points[0].eta ?? 0) * 100).toFixed(1) + '%';
                          } else {
                            return '—';
                          }
                        })()}</div>
                      </div>
           ) : n.type === 'Load' && 'Vreq' in n && 'I_typ' in n && 'I_max' in n ? (
                      <div style={{display:'flex', alignItems:'stretch', gap:8}}>
                        <div className="text-left">
                          <div style={{fontSize:'11px',color:'#555'}}>I_typ: {(n as any).I_typ}A</div>
                          <div style={{fontSize:'11px',color:'#555'}}>I_max: {(n as any).I_max}A</div>
                          <div style={{fontSize:'11px',color:'#555'}}>Paralleled: {((n as any).numParalleledDevices ?? 1)}</div>
                        </div>
                        <span style={{display:'inline-block', alignSelf:'stretch', width:1, background:'#cbd5e1'}} />
                        <div className="text-left" style={{minWidth:70}}>
                    <div style={{fontSize:'11px',color:'#1e293b'}}>P_in: {renderPowerDisplay(computeResult.nodes[n.id]?.P_in)}</div>
                        </div>
                      </div>
           ) : n.type === 'Subsystem' ? (
            <div>
              <div style={{fontSize:'11px',color:'#555'}}>Vin: {(n as any).inputV_nom}V</div>
              <div style={{fontSize:'11px',color:'#555'}}>Paralleled: {((n as any).numParalleledSystems ?? 1)}</div>
            </div>
           ) : n.type === 'SubsystemInput' ? (
            <div>
              <div style={{fontSize:'11px',color:'#555'}}>Subsystem Input</div>
              <div style={{fontSize:'11px',color:'#555'}}>Vout: {(n as any).Vout ?? 0}V</div>
            </div>
           ) : n.type === 'Note' && 'text' in n ? (
             <div>
               <div style={{fontSize:'11px',color:'#555', whiteSpace:'pre-wrap'}}>{(n as any).text}</div>
             </div>
           ) : null}
                  </div>
                </div>
              </div>
            ),
            type: (n as AnyNode).type,
            parallelCount,
            ...(n.type==='Load'? { Vreq: (n as any).Vreq } : {}),
            ...(n.type==='Subsystem'? { inputPorts: ((n as any).project?.nodes||[]).filter((x:any)=>x.type==='SubsystemInput').map((x:any)=>({ id:x.id, Vout:x.Vout, name: x.name })) } : {})
          },
          position,
          type: 'custom',
          draggable: true,
          selected: existing?.selected ?? false,
        }
      })
      return mapped
    })
  }, [project.nodes, setNodes])

  useEffect(()=>{
    setNodes(prev => prev.map(rn => {
      const n = project.nodes.find(x=>x.id===rn.id)
      if (!n) return rn
      const left = (
        <div className="text-left">
          {n.type === 'Source' && 'Vout' in n ? (
            <div>
              <div style={{fontSize:'11px',color:'#555'}}>Vout: {(n as any).Vout}V</div>
            </div>
          ) : n.type === 'Converter' && 'Vout' in n && 'efficiency' in n ? (
            <div>
              <div style={{fontSize:'11px',color:'#555'}}>Vout: {(n as any).Vout}V</div>
              <div style={{fontSize:'11px',color:'#555'}}>η: {(() => {
                const nodeResult = computeResult.nodes[n.id];
                const eff = (n as any).efficiency;
                if (eff?.type === 'curve' && nodeResult) {
                  const eta = etaFromModel(eff, nodeResult.P_out ?? 0, nodeResult.I_out ?? 0, n as any);
                  return (eta * 100).toFixed(1) + '%';
                } else if (eff?.type === 'fixed') {
                  return ((eff.value ?? 0) * 100).toFixed(1) + '%';
                } else if (eff?.points?.[0]?.eta) {
                  return ((eff.points[0].eta ?? 0) * 100).toFixed(1) + '%';
                } else {
                  return '—';
                }
              })()}</div>
            </div>
          ) : n.type === 'Bus' ? (
            (() => {
              const nodeResult = computeResult.nodes[n.id];
              const resistance = Number((n as any).R_milliohm ?? 0);
              const resistanceText = Number.isFinite(resistance)
                ? `${resistance.toLocaleString(undefined, { maximumFractionDigits: 2 })} mΩ`
                : '—';
              const lossDisplay = formatPowerDisplay(nodeResult?.loss);
              return (
                <div>
                  <div style={{fontSize:'11px',color:'#555'}}>R: {resistanceText}</div>
                  <div style={{fontSize:'11px',color:'#555'}}>Dissipation: <span title={lossDisplay.tooltip}>{lossDisplay.text}</span></div>
                </div>
              );
            })()
          ) : n.type === 'DualOutputConverter' ? (
            (() => {
              const nodeResult = computeResult.nodes[n.id] as any
              const metrics: Record<string, any> = nodeResult?.__outputs || {}
              const outputs = Array.isArray((n as any).outputs) ? (n as any).outputs : []
              const fallback = outputs.length > 0 ? outputs[0] : undefined
              const pin = nodeResult?.P_in
              const pout = nodeResult?.P_out
              return (
                <div style={{display:'flex', alignItems:'stretch', gap:8}}>
                  <div className="text-left" style={{minWidth:120}}>
                    {outputs.map((branch:any, idx:number) => {
                      const handleId = branch?.id || (idx === 0 ? (fallback?.id || 'outputA') : `${fallback?.id || 'outputA'}-${idx}`)
                      const metric = metrics[handleId] || {}
                      const eta = typeof metric.eta === 'number' ? metric.eta : undefined
                      const label = branch?.label || `Output ${String.fromCharCode(65 + idx)}`
                      return (
                        <div key={handleId} style={{fontSize:'11px',color:'#555'}}>
                          <div>{label}: {(branch?.Vout ?? 0)}V, η: {eta !== undefined ? (eta * 100).toFixed(1) + '%' : '—'}</div>
                          <div style={{fontSize:'10px',color:'#64748b'}}>P_out: {renderPowerDisplay(metric.P_out)} | I_out: {Number.isFinite(metric.I_out) ? `${(metric.I_out || 0).toFixed(3)} A` : '—'}</div>
                        </div>
                      )
                    })}
                  </div>
                  <span style={{display:'inline-block', alignSelf:'stretch', width:1, background:'#cbd5e1'}} />
                  <div className="text-left" style={{minWidth:90}}>
                    <div style={{fontSize:'11px',color:'#1e293b'}}>P_in: {renderPowerDisplay(pin)}</div>
                    <div style={{fontSize:'11px',color:'#1e293b'}}>P_out: {renderPowerDisplay(pout)}</div>
                  </div>
                </div>
              )
            })()
          ) : n.type === 'Load' && 'I_typ' in n && 'I_max' in n ? (
            <div style={{display:'flex', alignItems:'stretch', gap:8}}>
              <div className="text-left">
                <div style={{fontSize:'11px',color:'#555'}}>I_typ: {(n as any).I_typ}A</div>
                <div style={{fontSize:'11px',color:'#555'}}>I_max: {(n as any).I_max}A</div>
                <div style={{fontSize:'11px',color:'#555'}}>Paralleled: {((n as any).numParalleledDevices ?? 1)}</div>
              </div>
              <span style={{display:'inline-block', alignSelf:'stretch', width:1, background:'#cbd5e1'}} />
              <div className="text-left" style={{minWidth:70}}>
                <div style={{fontSize:'11px',color:'#1e293b'}}>P_in: {renderPowerDisplay(computeResult.nodes[n.id]?.P_in)}</div>
              </div>
            </div>
          ) : n.type === 'Subsystem' ? (
            <div>
              <div style={{fontSize:'11px',color:'#555'}}>Inputs: {((n as any).project?.nodes?.filter((x:any)=>x.type==='SubsystemInput')?.map((x:any)=>`${x.Vout}V`).join(', ') || '—')}</div>
              <div style={{fontSize:'11px',color:'#555'}}>Paralleled: {((n as any).numParalleledSystems ?? 1)}</div>
            </div>
          ) : n.type === 'Note' && 'text' in n ? (
            <div>
              <div style={{fontSize:'11px',color:'#555', whiteSpace:'pre-wrap'}}>{(n as any).text}</div>
            </div>
          ) : null}
        </div>
      )
      const nodeRes = computeResult.nodes[n.id]
      let right: React.ReactNode = null
      if (n.type === 'Subsystem'){
        const pinSingle = (nodeRes as any)?.P_in_single
        const pinTotal = nodeRes?.P_in
        if (pinSingle !== undefined || pinTotal !== undefined){
          right = (
            <>
              <div className="w-px bg-slate-300 mx-1" />
              <div className="text-left min-w-[70px]">
                {pinSingle !== undefined && (
                  <div style={{ fontSize: '10px', color: '#1e293b' }}>P_in(single): {renderPowerDisplay(pinSingle)}</div>
                )}
                {pinTotal !== undefined && (
                  <div style={{ fontSize: '10px', color: '#1e293b' }}>P_in(total): {renderPowerDisplay(pinTotal)}</div>
                )}
              </div>
            </>
          )
        }
      } else {
        const pout = nodeRes?.P_out
        const pin = nodeRes?.P_in
        // For DualOutputConverter, P_in/P_out are already rendered in the left block
        const showPout = (pout !== undefined) && (n.type !== 'Load' && n.type !== 'DualOutputConverter')
        const showPin = (pin !== undefined) && (n.type === 'Converter' || n.type === 'Bus')
        right = (showPout || showPin) ? (
          <>
            <div className="w-px bg-slate-300 mx-1" />
            <div className="text-left min-w-[70px]">
              {showPin && (
                <div style={{ fontSize: '10px', color: '#1e293b' }}>P_in: {renderPowerDisplay(pin)}</div>
              )}
              {showPout && (
                <div style={{ fontSize: '10px', color: '#1e293b' }}>P_out: {renderPowerDisplay(pout)}</div>
              )}
            </div>
          </>
        ) : null
      }
      const extra = buildNodeDisplayData(n, computeResult.nodes, project.edges, project.nodes as AnyNode[])
      return {
        ...rn,
        data: {
          ...rn.data,
          parallelCount: parallelCountForNode(n as any),
          label: (
            <div className="flex flex-col items-stretch gap-1">
              <div className="text-center font-semibold">{n.name}</div>
              <div className="flex items-stretch justify-between gap-2">
                {left}
                {right}
              </div>
            </div>
          ),
          ...(n.type==='Subsystem'? { inputPorts: (extra as any).inputPorts } : {}),
          ...(n.type==='DualOutputConverter'? { outputs: (extra as any).outputs, outputMetrics: ((computeResult.nodes[n.id] as any)||{}).__outputs || {} } : {}),
          ...(extra || {}),
        }
      }
    }))
  }, [computeResult, project.nodes, project.edges, setNodes])

  useEffect(() => {
    setNodes(prev => prev.map(rn => {
      const inMulti = activeMultiSelection?.nodes.includes(rn.id) ?? false
      const shouldSelect = selectedNodeId === rn.id || inMulti
      const nextData = inMulti !== Boolean((rn.data as any)?.__multiSelected)
        ? { ...rn.data, __multiSelected: inMulti }
        : rn.data
      if (rn.selected === shouldSelect && nextData === rn.data) return rn
      return { ...rn, selected: shouldSelect, data: nextData }
    }))
  }, [activeMultiSelection, selectedNodeId, setNodes])

  useEffect(() => {
    setEdges(prev => {
      const prevById = new Map(prev.map(p => [p.id, p]))
      return project.edges.map(e => {
        const I = computeResult.edges[e.id]?.I_edge ?? 0
        const strokeWidth = Math.max(2, 2 + 3 * Math.log10(I + 1e-3))
        const parent = project.nodes.find(n => n.id === e.from) as any
        const child = project.nodes.find(n => n.id === e.to) as any
        let parentV: number | undefined
        if (parent?.type === 'Source') parentV = parent?.Vout
        else if (parent?.type === 'Converter') parentV = parent?.Vout
        else if (parent?.type === 'DualOutputConverter') {
          const outputs = Array.isArray(parent?.outputs) ? parent.outputs : []
          const fallback = outputs.length > 0 ? outputs[0] : undefined
          const handleId = (e as any).fromHandle as string | undefined
          const branch = handleId ? outputs.find((b: any) => b?.id === handleId) : undefined
          parentV = (branch || fallback)?.Vout
        } else if (parent?.type === 'Bus') parentV = parent?.V_bus
        else if (parent?.type === 'SubsystemInput') parentV = parent?.Vout
        const childRange = (child?.type === 'Converter' || child?.type === 'DualOutputConverter') ? { min: child?.Vin_min, max: child?.Vin_max } : undefined
        const childDirectVin = child?.type === 'Load' ? child?.Vreq
          : child?.type === 'Subsystem' ? (() => {
              const portId = (e as any).toHandle
              if (portId) {
                const p = (child as any)?.project?.nodes?.find((x: any) => x.id === portId)
                return p?.Vout
              }
              const ports = (child as any)?.project?.nodes?.filter((x: any) => x.type === 'SubsystemInput')
              return ports?.length === 1 ? ports[0]?.Vout : undefined
            })()
          : undefined
        const convRangeViolation = (parentV !== undefined && childRange !== undefined) ? !(parentV >= childRange.min && parentV <= childRange.max) : false
        const eqViolation = (parentV !== undefined && childDirectVin !== undefined) ? (parentV !== childDirectVin) : false
        const mismatch = convRangeViolation || eqViolation
        const key = edgeGroupKey({ from: e.from, fromHandle: e.fromHandle })
        const info = groupMidpointInfo.get(key)
        const midpointOffset = getGroupOffset({ from: e.from, to: e.to, fromHandle: e.fromHandle })
        const resistanceLabel = (e.interconnect?.R_milliohm ?? 0).toFixed(2)
        const currentLabel = I.toFixed(1)
        const baseLabel = `${resistanceLabel} mΩ | ${currentLabel} A`
        const label = convRangeViolation ? `${baseLabel} | Converter Vin Range Violation` : (eqViolation ? `${baseLabel} | Vin != Vout` : baseLabel)
        const edgeColor = voltageToEdgeColor(parentV)
        const defaultColor = mismatch ? '#ef4444' : edgeColor
        const edgeData = {
          midpointOffset,
          midpointX: info?.midpointX,
          onMidpointChange: handleMidpointChange,
          onMidpointCommit: handleMidpointCommit,
          screenToFlow: screenToFlowPosition,
          defaultColor,
          extendMidpointRange: true,
          groupKey: key,
        }
        const existing = prevById.get(e.id)
        return {
          id: e.id,
          type: 'orthogonal',
          source: e.from,
          target: e.to,
          sourceHandle: (e as any).fromHandle,
          targetHandle: (e as any).toHandle,
          animated: false,
          label,
          labelStyle: { fill: defaultColor },
          style: { strokeWidth, stroke: defaultColor },
          data: edgeData,
          selected: existing?.selected ?? false,
        }
      })
    })
  }, [project.edges, project.nodes, setEdges, computeResult, getGroupOffset, handleMidpointChange, handleMidpointCommit, screenToFlowPosition])

  useEffect(() => {
    setEdges(prev => prev.map(edge => {
      const inMulti = activeMultiSelection?.edges.includes(edge.id) ?? false
      const shouldSelect = selectedEdgeId === edge.id || inMulti
      const nextData = inMulti !== Boolean((edge.data as any)?.isMultiSelected)
        ? { ...edge.data, isMultiSelected: inMulti }
        : edge.data
      if (edge.selected === shouldSelect && nextData === edge.data) return edge
      return { ...edge, selected: shouldSelect, data: nextData }
    }))
  }, [activeMultiSelection, selectedEdgeId, setEdges])

  const handleNodesChange = useCallback((changes:any)=>{
    setNodes(nds=>applyNodeChanges(changes, nds))
    for (const ch of changes){
      if (ch.type === 'position' && ch.dragging === false){
        const n = nodes.find(x=>x.id===ch.id)
        const pos = n?.position || ch.position
        if (pos) updatePos(path, ch.id, pos.x, pos.y)
      }
    }
  }, [nodes, path, updatePos])

  const onConnect = useCallback((c: Connection)=>{
    const reaches = (start:string, goal:string)=>{
      const adj: Record<string,string[]> = {}
      project.edges.forEach(e=>{ (adj[e.from]=adj[e.from]||[]).push(e.to) })
      const stack=[start]; const seen=new Set<string>([start])
      while(stack.length){ const u=stack.pop()!; if (u===goal) return true; for (const v of (adj[u]||[])) if (!seen.has(v)){ seen.add(v); stack.push(v) } }
      return false
    }
    const resolvedConnection = (() => {
      if (!c.target) return c
      const targetNode = project.nodes.find(n => n.id === c.target)
      if (!targetNode || (targetNode as any).type !== 'SubsystemInput') return c
      const portId = targetNode.id
      const owningSubsystem = project.nodes.find(n => (n as any).type === 'Subsystem' && Array.isArray((n as any).project?.nodes) && (n as any).project.nodes.some((inner: any) => inner.id === portId))
      if (!owningSubsystem) return c
      return {
        ...c,
        target: owningSubsystem.id,
        targetHandle: portId,
      }
    })()
    if (resolvedConnection.source && resolvedConnection.target && reaches(resolvedConnection.target, resolvedConnection.source)) return
    if (resolvedConnection.source && resolvedConnection.target) {
      const newFromHandle = resolvedConnection.sourceHandle ?? null
      const newToHandle = resolvedConnection.targetHandle ?? null
      const alreadyExists = project.edges.some(existing => {
        if (existing.from !== resolvedConnection.source || existing.to !== resolvedConnection.target) return false
        const existingFromHandle = (existing as any).fromHandle ?? null
        const existingToHandle = (existing as any).toHandle ?? null
        return existingFromHandle === newFromHandle && existingToHandle === newToHandle
      })
      if (alreadyExists) return
    }
    const edgeId = genId('edge_')
    const baseOffset = (resolvedConnection.source && resolvedConnection.target)
      ? getGroupOffset({ from: resolvedConnection.source, to: resolvedConnection.target, fromHandle: resolvedConnection.sourceHandle ?? undefined })
      : 0.5
    const groupKey = resolvedConnection.source
      ? edgeGroupKey({ from: resolvedConnection.source, fromHandle: resolvedConnection.sourceHandle ?? undefined })
      : undefined
    const groupInfo = groupKey ? groupMidpointInfo.get(groupKey) : undefined
    const baseMidpointX = groupInfo?.midpointX
    const parent = project.nodes.find(n=>n.id===resolvedConnection.source) as any
    const parentV = parent?.type==='Source'? parent?.Vout
      : parent?.type==='Converter'? parent?.Vout
      : parent?.type==='Bus'? parent?.V_bus
      : parent?.type==='SubsystemInput'? parent?.Vout
      : undefined
    const defaultColor = voltageToEdgeColor(parentV)
    const edgeData = {
      midpointOffset: baseOffset,
      ...(baseMidpointX !== undefined ? { midpointX: baseMidpointX } : {}),
      onMidpointChange: handleMidpointChange,
      onMidpointCommit: handleMidpointCommit,
      screenToFlow: screenToFlowPosition,
      defaultColor,
      extendMidpointRange: true,
      groupKey,
    }
    setEdges(eds=>addEdge({
      ...resolvedConnection,
      id: edgeId,
      type: 'orthogonal',
      source: resolvedConnection.source as any,
      target: resolvedConnection.target as any,
      sourceHandle: resolvedConnection.sourceHandle,
      targetHandle: resolvedConnection.targetHandle,
      data: edgeData,
      style: { strokeWidth: 2, stroke: defaultColor },
      labelStyle: { fill: defaultColor },
      selected: false,
    } as any, eds))
    if (resolvedConnection.source && resolvedConnection.target) {
      const payload: any = {
        id: edgeId,
        from: resolvedConnection.source,
        to: resolvedConnection.target,
        fromHandle: (resolvedConnection.sourceHandle as any) || undefined,
        toHandle: (resolvedConnection.targetHandle as any) || undefined,
        midpointOffset: baseOffset,
      }
      if (baseMidpointX !== undefined) payload.midpointX = baseMidpointX
      addEdgeStore(path, payload)
    }
  }, [addEdgeStore, getGroupOffset, groupMidpointInfo, handleMidpointChange, handleMidpointCommit, nodePositions, path, project.edges, project.nodes, screenToFlowPosition])

  const onNodesDelete: OnNodesDelete = useCallback((deleted)=>{
    if (!isTopmostEditor) return
    for (const n of deleted){ removeNode(path, n.id) }
  }, [isTopmostEditor, removeNode, path])

  const onEdgesDelete: OnEdgesDelete = useCallback((deleted)=>{
    if (!isTopmostEditor) return
    for (const e of deleted){ removeEdge(path, e.id) }
  }, [isTopmostEditor, removeEdge, path])

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: RFNode) => {
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    setContextMenu({ type: 'node', x: event.clientX, y: event.clientY, targetId: node.id })
  }, [])

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    setContextMenu({ type: 'pane', x: event.clientX, y: event.clientY })
  }, [])

  const handleCopy = useCallback(() => {
    if (!contextMenu || contextMenu.type !== 'node' || !contextMenu.targetId) return
    const selection: MultiSelection = {
      kind: 'multi',
      nodes: [contextMenu.targetId],
      edges: [],
      markups: [],
    }
    const payload = collectClipboardPayload(selection)
    if (payload) {
      setClipboard(payload)
    }
    setContextMenu(null)
  }, [collectClipboardPayload, contextMenu, setClipboard])

  const handleDelete = useCallback(()=>{
    if (!contextMenu || contextMenu.type !== 'node' || !contextMenu.targetId) return
    removeNode(path, contextMenu.targetId)
    if (selectedNodeId === contextMenu.targetId) {
      setSelectedNodeId(null)
      onSelect(null)
    }
    applyMultiSelection(null)
    setContextMenu(null)
  }, [applyMultiSelection, contextMenu, onSelect, path, removeNode, selectedNodeId])

  const handleSaveQuickPreset = useCallback(() => {
    if (!contextMenu || contextMenu.type !== 'node' || !contextMenu.targetId) return
    const node = project.nodes.find(n => n.id === contextMenu.targetId)
    if (!node) return
    const snapshot = JSON.parse(JSON.stringify(node)) as AnyNode
    quickPresetDialogs.openCaptureDialog({ kind: 'node', node: snapshot })
    setContextMenu(null)
  }, [contextMenu, project, quickPresetDialogs])

  const handlePaste = useCallback(() => {
    if (!contextMenu || contextMenu.type !== 'pane') return
    const flowPos = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y })
    performPaste(flowPos)
    setContextMenu(null)
  }, [contextMenu, performPaste, screenToFlowPosition])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopmostEditor) return
      const active = document.activeElement as HTMLElement | null
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (isInput) return

      const key = e.key
      const isDelete = key === 'Delete' || key === 'Backspace'
      const isCopy = (key === 'c' || key === 'C') && (e.ctrlKey || e.metaKey)
      const isPaste = (key === 'v' || key === 'V') && (e.ctrlKey || e.metaKey)
      const panIntent = getKeyboardPanIntent(e)
      const panOverrideActive = panIntent ? isKeyboardPanOverrideActive(e) : false
      const nudgeDelta = !panOverrideActive ? getKeyboardNudgeDeltaForEvent(e) : null
      let handledArrow = false

      if (key === 'Escape') {
        clearMultiSelection()
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
        setSelectedMarkupId(null)
        onSelectionModeChange('single')
        onSelect(null)
        e.preventDefault()
        return
      }

      const currentSelection: MultiSelection | null = (() => {
        if (activeMultiSelection) return activeMultiSelection
        if (selectedNodeId) return { kind: 'multi', nodes: [selectedNodeId], edges: [], markups: [] }
        if (selectedEdgeId) return { kind: 'multi', nodes: [], edges: [selectedEdgeId], markups: [] }
        if (selectedMarkupId) return { kind: 'multi', nodes: [], edges: [], markups: [selectedMarkupId] }
        return null
      })()

      if (nudgeDelta && currentSelection?.nodes.length) {
        const nodeMap = new Map<string, AnyNode>()
        for (const node of project.nodes as AnyNode[]) {
          nodeMap.set(node.id, node)
        }

        const updates: { nodeId: string; patch: Partial<AnyNode>; subsystemPath?: string[] }[] = []
        const localNodeUpdates = new Map<string, { x: number; y: number }>()
        let clamped = false
        let moved = false

        for (const nodeId of currentSelection.nodes) {
          const node = nodeMap.get(nodeId)
          if (!node) continue
          const currentX = typeof node.x === 'number' ? node.x : 0
          const currentY = typeof node.y === 'number' ? node.y : 0
          const target = { x: currentX + nudgeDelta.dx, y: currentY + nudgeDelta.dy }
          const { point, clamped: wasClamped } = clampPointToBounds(target, DEFAULT_SUBSYSTEM_BOUNDS)
          if (point.x !== currentX || point.y !== currentY) {
            updates.push({ nodeId, subsystemPath: path, patch: { x: point.x, y: point.y } })
            localNodeUpdates.set(nodeId, { x: point.x, y: point.y })
            moved = true
          }
          if (wasClamped) clamped = true
        }

        if (localNodeUpdates.size > 0) {
          setNodes(prev =>
            prev.map(rn => {
              const update = localNodeUpdates.get(rn.id)
              if (!update) return rn
              const samePosition = rn.position?.x === update.x && rn.position?.y === update.y
              if (samePosition) return rn
              const nextPosition = { x: update.x, y: update.y }
              const nextAbsolute = rn.positionAbsolute ? { x: update.x, y: update.y } : rn.positionAbsolute
              return {
                ...rn,
                position: nextPosition,
                positionAbsolute: nextAbsolute ?? rn.positionAbsolute,
              }
            })
          )
        }

        if (updates.length > 0) {
          bulkUpdateNodesStore(updates)
        }

        if (moved || clamped) {
          e.preventDefault()
          handledArrow = true
        }
      }

      if (nudgeDelta && nudgeDelta.dx !== 0) {
        const selectionEdges = new Set<string>()
        if (currentSelection?.edges.length) {
          currentSelection.edges.forEach(id => selectionEdges.add(id))
        }
        if (selectionEdges.size === 0 && selectedEdgeId) {
          selectionEdges.add(selectedEdgeId)
        }

        if (selectionEdges.size > 0) {
          const nodeMap = new Map<string, AnyNode>()
          for (const node of project.nodes as AnyNode[]) {
            nodeMap.set(node.id, node)
          }

          const rfEdgeUpdates = new Map<string, { midpointX?: number; midpointOffset?: number }>()
          const processedGroups = new Set<string>()
          let edgeMoved = false
          let edgeClamped = false

          const applyRfUpdates = () => {
            if (rfEdgeUpdates.size === 0) return
            setEdges(prev =>
              prev.map(edge => {
                const update = rfEdgeUpdates.get(edge.id)
                if (!update) return edge
                const nextData: any = { ...(edge.data || {}) }
                if (update.midpointOffset !== undefined) nextData.midpointOffset = update.midpointOffset
                if (update.midpointX !== undefined) nextData.midpointX = update.midpointX
                return { ...edge, data: nextData }
              })
            )
          }

          const processGroup = (edge: Edge) => {
            const rawGroupKey = edgeGroupKey({ from: edge.from, fromHandle: edge.fromHandle })
            if (processedGroups.has(rawGroupKey)) return
            processedGroups.add(rawGroupKey)

            const sourceNode = nodeMap.get(edge.from)
            const targetNode = nodeMap.get(edge.to)
            if (!sourceNode || !targetNode) return
            const startX = Number((sourceNode as any).x)
            const endX = Number((targetNode as any).x)
            if (!Number.isFinite(startX) || !Number.isFinite(endX)) return

            const offsetRaw = Number.isFinite((edge as any).midpointOffset) ? Number((edge as any).midpointOffset) : 0.5
            const offsetValue = Math.min(1, Math.max(0, offsetRaw))
            const fallbackMidpoint = startX + (endX - startX) * offsetValue
            const baseMidpoint = Number.isFinite((edge as any).midpointX) ? Number((edge as any).midpointX) : fallbackMidpoint

            const result = computeEdgeMidpointNudge({
              currentMidpoint: baseMidpoint,
              deltaX: nudgeDelta.dx,
              startX,
              endX,
            })
            if (!result) return

            const movedThis = Math.abs(result.midpointX - baseMidpoint) > 1e-3
            if (!movedThis && !result.clamped) return

            const patch: Partial<Edge> = {
              midpointOffset: result.midpointOffset,
              midpointX: result.midpointX,
            }

            for (const groupEdge of project.edges) {
              if (edgeGroupKey({ from: groupEdge.from, fromHandle: groupEdge.fromHandle }) !== rawGroupKey) continue
              updateEdgeNested(path, groupEdge.id, patch)
              rfEdgeUpdates.set(groupEdge.id, {
                midpointOffset: result.midpointOffset,
                midpointX: result.midpointX,
              })
            }

            if (result.clamped) edgeClamped = true
            if (movedThis || result.clamped) edgeMoved = true
          }

          for (const edgeId of selectionEdges) {
            const projectEdge = project.edges.find(e => e.id === edgeId)
            if (!projectEdge) continue
            processGroup(projectEdge)
          }

          if (rfEdgeUpdates.size > 0) {
            applyRfUpdates()
          }

          if (edgeMoved || edgeClamped) {
            e.preventDefault()
            handledArrow = true
          }
        }
      }

      if (!handledArrow && panIntent && typeof reactFlowInstance?.getViewport === 'function') {
        const viewport = reactFlowInstance.getViewport()
        const delta = getKeyboardPanTranslation(panIntent, e, viewport.zoom)
        if ((delta.dx !== 0 || delta.dy !== 0) && applyKeyboardPan(reactFlowInstance, delta)) {
          e.preventDefault()
          return
        }
      }

      if (handledArrow) {
        return
      }

      if (isCopy && currentSelection) {
        const payload = collectClipboardPayload(currentSelection)
        if (payload) {
          setClipboard(payload)
        }
        e.preventDefault()
        return
      }

      if (isDelete && currentSelection) {
        deleteSelection(currentSelection)
        onSelect(null)
        e.preventDefault()
        return
      }

      if (isPaste) {
        const flowPos = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
        if (performPaste(flowPos)) {
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeMultiSelection, bulkUpdateNodesStore, clearMultiSelection, collectClipboardPayload, deleteSelection, isTopmostEditor, onSelect, onSelectionModeChange, path, performPaste, project.edges, project.nodes, reactFlowInstance, screenToFlowPosition, selectedEdgeId, selectedMarkupId, selectedNodeId, setClipboard, setEdges, setNodes, updateEdgeNested])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!dataTransferHasNodePreset(e.dataTransfer) && !dataTransferHasQuickPreset(e.dataTransfer)) return
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!isTopmostEditor) return
    const dt = e.dataTransfer
    if (!dt) return
    const quickPayload = readQuickPresetDragPayload(dt)
    let baseNode: AnyNode | null = null
    if (quickPayload) {
      const preset = quickPresets.find(p => p.id === quickPayload.presetId)
      if (!preset) return
      const materialized = materializeQuickPreset(preset)
      if (materialized.type === 'Source') {
        window.alert('Sources are not allowed inside embedded subsystems.')
        return
      }
      baseNode = materialized
    } else {
      if (!dataTransferHasNodePreset(dt)) return
      const raw = dt.getData(NODE_PRESET_MIME) ?? null
      const descriptor = deserializePresetDescriptor(raw)
      if (!descriptor || descriptor.type === 'Source') return
      baseNode = createNodePreset(descriptor)
    }
    if (!baseNode) return
    e.preventDefault()
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    if (!flowPos || typeof flowPos.x !== 'number' || typeof flowPos.y !== 'number') return
    setContextMenu(null)
    const placed = withPosition(baseNode, { x: flowPos.x, y: flowPos.y })
    addNodeNested(path, placed)
  }, [addNodeNested, isTopmostEditor, path, quickPresets, screenToFlowPosition, setContextMenu])

  const handleWrapperPointerDownCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.closest('.react-flow__node') || target.closest('.react-flow__handle') || target.closest('.react-flow__edge-path')) {
      return
    }
    const paneEl = target.closest('.react-flow__pane')
    if (!paneEl) return
    const modifier = isMultiSelectModifier(event)
    if (selectionMode !== 'multi' && !modifier) return
    event.stopPropagation()
    event.preventDefault()
    setContextMenu(null)
    const forcedMulti = selectionMode !== 'multi'
    if (forcedMulti) {
      onSelectionModeChange('multi', { source: 'temporary' })
    }
    startMarqueeSelection({ x: event.clientX, y: event.clientY }, event.shiftKey || modifier, forcedMulti)
  }, [onSelectionModeChange, selectionMode, setContextMenu, startMarqueeSelection])

  const canSaveQuickPresetFromContext = contextMenu?.type === 'node' && !!(contextMenu.targetId && project.nodes.some(n => n.id === contextMenu.targetId))

  return (
    <div
      ref={wrapperRef}
      className="h-full relative"
      aria-label="subsystem-canvas"
      onPointerDownCapture={handleWrapperPointerDownCapture}
      onClick={()=>setContextMenu(null)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div data-export-exclude="true" className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40">
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white/90 px-3 py-2 shadow-md">
          <Tooltip label="Select nodes">
            <Button
              variant={isSelectActive ? 'default' : 'outline'}
              size="icon"
              type="button"
              onClick={handleSingleSelectClick}
              aria-label="Select nodes"
              aria-pressed={isSelectActive}
            >
              <MousePointer className="h-5 w-5" />
            </Button>
          </Tooltip>
          <Tooltip label="Toggle multi-select">
            <Button
              variant={isMultiActive ? 'default' : 'outline'}
              size="icon"
              type="button"
              onClick={handleMultiSelectClick}
              aria-label="Toggle multi-select"
              aria-pressed={isMultiActive}
            >
              <BoxSelect className="h-5 w-5" />
            </Button>
          </Tooltip>
          <div className="h-6 w-px bg-slate-300" aria-hidden="true" />
          <Tooltip label="Undo last change">
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={undo}
              disabled={pastLen === 0}
              aria-label="Undo"
            >
              <Undo2 className="h-5 w-5" />
            </Button>
          </Tooltip>
          <Tooltip label="Redo last undone change">
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={redo}
              disabled={futureLen === 0}
              aria-label="Redo"
            >
              <Redo2 className="h-5 w-5" />
            </Button>
          </Tooltip>
        </div>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        defaultEdgeOptions={{ type: 'orthogonal', style: { strokeWidth: 2 } }}
        panOnDrag={selectionMode !== 'multi'}
        selectionOnDrag={selectionMode !== 'multi'}
        onNodeClick={(event,n)=>{
          const nodeId = n.id
          if (isMultiSelectModifier(event)) {
            toggleWithModifier({ kind: 'node', id: nodeId }, () => selectSingleNodeWithClear(nodeId))
            return
          }
          const inMulti = selectionMode === 'multi' && (activeMultiSelection?.nodes.includes(nodeId) ?? false)
          if (inMulti) {
            setSelectedNodeId(nodeId)
            setSelectedEdgeId(null)
            setSelectedMarkupId(null)
            onSelect(activeMultiSelection)
            return
          }
          selectSingleNodeWithClear(nodeId)
        }}
        onNodeDragStart={(event,n) => {
          const nodeId = n.id
          if (isMultiSelectModifier(event)) {
            toggleWithModifier({ kind: 'node', id: nodeId }, () => selectSingleNodeWithClear(nodeId))
            multiDragStateRef.current = null
            return
          }
          const inMulti = selectionMode === 'multi' && (activeMultiSelection?.nodes.includes(nodeId) ?? false)
          if (inMulti && activeMultiSelection) {
            setSelectedNodeId(nodeId)
            setSelectedEdgeId(null)
            setSelectedMarkupId(null)
            onSelect(activeMultiSelection)
            const snapshot = new Map<string, { x: number; y: number }>()
            const currentNodes = reactFlowInstance.getNodes()
            for (const id of activeMultiSelection.nodes) {
              const rfNode = currentNodes.find(node => node.id === id)
              if (rfNode) {
                snapshot.set(id, { x: rfNode.position.x, y: rfNode.position.y })
              }
            }
            multiDragStateRef.current = { originId: nodeId, positions: snapshot }
            return
          }
          multiDragStateRef.current = null
          selectSingleNodeWithClear(nodeId)
        }}
        onNodeDrag={(_,n) => {
          const state = multiDragStateRef.current
          if (!state || selectionMode !== 'multi' || !activeMultiSelection) return
          const origin = state.positions.get(n.id)
          if (!origin) return
          const dx = n.position.x - origin.x
          const dy = n.position.y - origin.y
          if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
          setNodes(prev => prev.map(rn => {
            if (!activeMultiSelection.nodes.includes(rn.id) || rn.id === n.id) return rn
            const initial = state.positions.get(rn.id)
            if (!initial) return rn
            const next = { x: initial.x + dx, y: initial.y + dy }
            return { ...rn, position: next, positionAbsolute: next }
          }))
        }}
        onNodeDragStop={(_,n) => {
          const state = multiDragStateRef.current
          if (state && selectionMode === 'multi' && activeMultiSelection) {
            const origin = state.positions.get(n.id)
            const dx = origin ? n.position.x - origin.x : 0
            const dy = origin ? n.position.y - origin.y : 0
            for (const id of activeMultiSelection.nodes) {
              const initial = state.positions.get(id)
              if (!initial) continue
              const nextX = id === n.id ? n.position.x : initial.x + dx
              const nextY = id === n.id ? n.position.y : initial.y + dy
              updatePos(path, id, nextX, nextY)
            }
          } else {
            updatePos(path, n.id, n.position.x, n.position.y)
          }
          multiDragStateRef.current = null
        }}
        onEdgeClick={(event,e)=>{
          const edgeId = e.id
          if (isMultiSelectModifier(event)) {
            toggleWithModifier({ kind: 'edge', id: edgeId }, () => selectSingleEdgeWithClear(edgeId))
            return
          }
          const inMulti = selectionMode === 'multi' && (activeMultiSelection?.edges.includes(edgeId) ?? false)
          if (inMulti) {
            setSelectedEdgeId(edgeId)
            setSelectedNodeId(null)
            setSelectedMarkupId(null)
            onSelect(activeMultiSelection)
            return
          }
          selectSingleEdgeWithClear(edgeId)
        }}
        onNodesChange={handleNodesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={() => {
          if (skipPaneClickRef.current) {
            skipPaneClickRef.current = false
            return
          }
          setSelectedNodeId(null)
          setSelectedEdgeId(null)
          setSelectedMarkupId(null)
          if (multiSelection) {
            applyMultiSelection(null, { source: selectionModeSource === 'temporary' ? 'temporary' : undefined })
          } else {
            clearMultiSelection()
            onSelect(null)
          }
        }}
        onNodeDoubleClick={(_,n)=>{ clearMultiSelection(); const t=(n as any).data?.type; if (t==='Subsystem' && onOpenNested) onOpenNested(n.id) }}
      >
        <MiniMap /><Controls /><Background gap={16} />
      </ReactFlow>
      {marqueeRect && (
        <div
          className="pointer-events-none absolute z-40 border border-sky-400 bg-sky-300/20"
          style={{
            left: marqueeRect.left,
            top: marqueeRect.top,
            width: marqueeRect.width,
            height: marqueeRect.height,
          }}
        />
      )}
      {multiSelection && !marqueeRect && selectionHasItems(multiSelection) && (
        <div className="absolute top-16 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white/95 px-4 py-2 text-sm text-slate-600 shadow-md">
            <span><span className="font-semibold text-slate-800">{multiSelection.nodes.length}</span> nodes</span>
            <span><span className="font-semibold text-slate-800">{multiSelection.edges.length}</span> edges</span>
            <span><span className="font-semibold text-slate-800">{multiSelection.markups.length}</span> markups</span>
            <span className="text-xs text-slate-400">Copy ⌘C / Delete ⌫ / Paste ⌘V</span>
          </div>
        </div>
      )}
      {contextMenu && (
        <div className="fixed z-50 bg-white border shadow-md rounded-md text-sm" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e=>e.stopPropagation()}>
          {contextMenu.type==='node' ? (
            <div className="py-1">
              <button className="block w-full text-left px-3 py-1 hover:bg-slate-100" onClick={handleCopy}>Copy</button>
              <button
                className={`block w-full text-left px-3 py-1 ${canSaveQuickPresetFromContext ? 'hover:bg-slate-100' : 'text-slate-400 cursor-not-allowed'}`}
                onClick={canSaveQuickPresetFromContext ? handleSaveQuickPreset : undefined}
              >
                Save as quick preset…
              </button>
              <button className="block w-full text-left px-3 py-1 hover:bg-slate-100 text-red-600" onClick={handleDelete}>Delete</button>
            </div>
          ) : (
            <div className="py-1">
              <button className={`block w-full text-left px-3 py-1 ${clipboard && (clipboard.nodes.length || clipboard.markups.length) ? 'hover:bg-slate-100' : 'text-slate-400 cursor-not-allowed'}`} onClick={clipboard && (clipboard.nodes.length || clipboard.markups.length) ? handlePaste : undefined}>Paste</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

