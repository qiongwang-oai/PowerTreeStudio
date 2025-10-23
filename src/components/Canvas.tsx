import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, Connection, Edge as RFEdge, Node as RFNode, useNodesState, useEdgesState, addEdge, applyNodeChanges, applyEdgeChanges, OnEdgesChange, OnNodesDelete, OnEdgesDelete, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import { useStore } from '../state/store'
import type { ClipboardPayload } from '../state/store'
import { compute, etaFromModel, computeDeepAggregates } from '../calc'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'
import type { AnyNode, Edge, Project, Scenario, CanvasMarkup } from '../models'
import OrthogonalEdge from './edges/OrthogonalEdge'
import { voltageToEdgeColor } from '../utils/color'
import { edgeGroupKey, computeEdgeGroupInfo } from '../utils/edgeGroups'
import type {
  InspectorSelection,
  SelectionMode,
  MultiSelection,
  SelectionModeChangeOptions,
  SelectionModeSource,
} from '../types/selection'
import { findSubsystemPath } from '../utils/subsystemPath'
import { createNodePreset, NODE_PRESET_MIME, withPosition, deserializePresetDescriptor, dataTransferHasNodePreset } from '../utils/nodePresets'
import { exportCanvasToPdf } from '../utils/exportCanvasPdf'
import { dataTransferHasQuickPreset, readQuickPresetDragPayload, materializeQuickPreset } from '../utils/quickPresets'
import { useQuickPresetDialogs } from './quick-presets/QuickPresetDialogsContext'
import MarkupLayer, { MarkupTool } from './markups/MarkupLayer'
import { genId } from '../utils'
import { formatPower, powerTooltipLabel } from '../utils/format'
import { MousePointer, BoxSelect, Undo2, Redo2 } from 'lucide-react'
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
} from '../utils/multiSelection'
import type { Bounds } from '../utils/multiSelection'
import { collectClipboardPayload as collectClipboardPayloadShared, applyClipboardPayload } from '../utils/selectionClipboard'
import {
  SUBSYSTEM_BASE_HEIGHT,
  computeSubsystemNodeMinHeight,
  getSubsystemPortPosition,
  sanitizeSubsystemHandleOrder,
  orderSubsystemPorts,
} from './SubsystemNodeLayout'
import {
  clampPointToBounds,
  DEFAULT_CANVAS_BOUNDS,
  DEFAULT_SUBSYSTEM_BOUNDS,
  computeEdgeMidpointNudge,
  getKeyboardNudgeDeltaForEvent,
} from '../utils/nudgeSelection'
import {
  applyKeyboardPan,
  getKeyboardPanIntent,
  getKeyboardPanTranslation,
  isKeyboardPanOverrideActive,
} from '../utils/keyboardPan'

const SUBSYSTEM_EMBEDDED_MIN_HEIGHT = 96
const EMBEDDED_CONTAINER_MIN_WIDTH = 320
const EMBEDDED_CONTAINER_MIN_HEIGHT = 240
const EMBEDDED_NODE_MARGIN_X = 48
const EMBEDDED_NODE_MARGIN_TOP = 32
const EMBEDDED_NODE_MARGIN_BOTTOM = 16
const EMBEDDED_EDGE_MARGIN_X = 48
const EMBEDDED_EDGE_MARGIN_TOP = 16
const EMBEDDED_EDGE_MARGIN_BOTTOM = 12
const DEFAULT_EMBEDDED_NODE_WIDTH = 200
const DEFAULT_EMBEDDED_NODE_HEIGHT = 110

const isMultiSelectModifier = (event: { metaKey?: boolean; ctrlKey?: boolean }): boolean =>
  Boolean(event.metaKey || event.ctrlKey)

type CanvasProps = {
  onSelect: (selection: InspectorSelection | null) => void
  onOpenSubsystem?: (id: string) => void
  markupTool: MarkupTool | null
  onMarkupToolChange: (tool: MarkupTool | null) => void
  selectionMode: SelectionMode
  selectionModeSource: SelectionModeSource
  onSelectionModeChange: (mode: SelectionMode, options?: SelectionModeChangeOptions) => void
}

export type CanvasHandle = {
  exportToPdf: () => Promise<void>
}

function CustomNode(props: NodeProps) {
  const { data, selected } = props;
  const isEmbeddedChild = Boolean((data as any)?.owningSubsystemId);
  const handlesConnectable = !isEmbeddedChild;
  const isSelected = !!selected;
  const accentColor = '#0284c7';
  const nodeType = data.type;
  const rawParallel = typeof (data as any)?.parallelCount === 'number' ? (data as any).parallelCount : 1;
  const parallelCount = Number.isFinite(rawParallel) && rawParallel > 0 ? Math.floor(rawParallel) : 1;
  const isParallelStackType = nodeType === 'Load' || nodeType === 'Subsystem';
  const showStack = isParallelStackType && parallelCount > 1;
  const maxVisibleStack = 5;
  const stackGap = 4;
  const behindCount = showStack ? Math.min(parallelCount - 1, maxVisibleStack - 1) : 0;
  const bracketDepth = stackGap * behindCount;
  const bracketLabel = `x${parallelCount}`;
  const baseBraceSize = 18;
  const bracketFontSize = Math.max(baseBraceSize, bracketDepth + 10);
  const braceBottomAdjust = 6;
  const baseShadow = '0 1px 2px rgba(15, 23, 42, 0.06)';
  const stackShadowParts = showStack
    ? Array.from({ length: behindCount }).map((_, idx) => {
        const depth = idx + 1;
        const offset = stackGap * depth;
        const fade = 0.38 - depth * 0.07;
        const alpha = Math.max(0.18, fade);
        return `${offset}px ${offset}px 0 1px rgba(71, 85, 105, ${alpha.toFixed(2)})`;
      })
    : [];
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
  ) : null;

  const combinedShadow = stackShadowParts.length
    ? `${stackShadowParts.join(', ')}, ${baseShadow}`
    : baseShadow;
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
      {/* Dot overlay intentionally removed when parallel count exceeds threshold */}
      {bracketElement}
      {(nodeType==='Converter' || nodeType==='DualOutputConverter' || nodeType==='Load' || nodeType==='Bus') && (
        <>
          <Handle type="target" position={Position.Left} id="input" style={{ background: '#555' }} isConnectable={handlesConnectable} />
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
          <Handle type="target" position={Position.Left} id={props.id} style={{ background: '#555' }} isConnectable={handlesConnectable} />
          <div
            style={{
              position: 'absolute',
              left: -8,
              top: 'calc(50% + 8px)',
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
              <Handle type="target" position={Position.Left} id="input" style={{ background: '#555' }} isConnectable={handlesConnectable} />
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
          const handleTranslateX = count > 1 ? '-150%' : '-50%'
          return (
            <>
              {ports.map((p:any, idx:number) => {
                const pct = getSubsystemPortPosition(idx, count)
                const labelOffset = 3
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
                return (
                  <React.Fragment key={p.id}>
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={p.id}
                      style={{ background: '#555', top: `${pct}%`, transform: `translate(${handleTranslateX}, -50%)` }}
                      isConnectable={handlesConnectable}
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
      {nodeType === 'DualOutputConverter'
        ? (() => {
            const count = outputs.length || 1
            return (
              <>
                {(outputs.length ? outputs : [{ id: 'outputA', label: 'Output A', Vout: 0 }]).map((output: any, idx: number) => {
                  const handleId = output?.id || `output-${idx}`
                  const label = output?.label || `Output ${String.fromCharCode(65 + idx)}`
                  const voltageValue = Number(output?.Vout)
                  const branchVoltageText = Number.isFinite(voltageValue) && voltageValue > 0 ? formatVoltage(voltageValue) : null
                  const topOffset = 50 + ((idx - (count - 1) / 2) * 24)
                  return (
                    <React.Fragment key={handleId}>
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={handleId}
                        style={{ background: '#555', top: `${topOffset}%` }}
                        isConnectable={handlesConnectable}
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
            <Handle type="source" position={Position.Right} id="output" style={{ background: '#555' }} isConnectable={handlesConnectable} />
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
  );
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex?.startsWith('#') ? hex.slice(1) : hex
  if (normalized.length !== 6) return `rgba(14, 165, 233, ${alpha})`
  const bigint = parseInt(normalized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function buildNodeDisplayData(node: AnyNode, computeNodes: Record<string, any> | undefined, edges?: Edge[], allNodes?: AnyNode[]) {
  const parallelCount = parallelCountForNode(node as any)
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
  const pinValue = nodeResult?.P_in
  const poutValue = nodeResult?.P_out
  const pinSingleValue = (nodeResult as any)?.P_in_single ?? (node as any)?.P_in_single
  const lossValue = nodeResult?.loss
  const outputMetrics: Record<string, any> = (nodeResult as any)?.__outputs || {}
  const formatPowerValue = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const formatted = formatPower(value)
      return {
        text: `${formatted.value} ${formatted.unit}`,
        tooltip: powerTooltipLabel(value),
      }
    }
    return { text: '—', tooltip: undefined }
  }
  type PowerEntry = { label: string; text: string; tooltip?: string }
  const buildPowerEntry = (label: string, raw: unknown): PowerEntry => ({ label, ...formatPowerValue(raw) })
  const renderPowerBlock = (entries: PowerEntry[]) => (
    <div className="text-left" style={{ minWidth: 110 }}>
      {entries.map(entry => (
        <div
          key={entry.label}
          style={{ fontSize: '11px', color: '#1e293b' }}
          title={entry.tooltip}
        >
          {entry.label}: {entry.text}
        </div>
      ))}
    </div>
  )
  const withPower = (content: React.ReactNode, entries: PowerEntry[]) => (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
      <div className="text-left">{content}</div>
      {entries.length > 0 && (
        <>
          <span style={{ display: 'inline-block', alignSelf: 'stretch', width: 1, background: '#cbd5e1' }} />
          {renderPowerBlock(entries)}
        </>
      )}
    </div>
  )
  const label = (
    <div className="flex flex-col items-stretch gap-1">
      <div className="text-center font-semibold" data-node-label>
        {node.name}
      </div>
      <div className="flex items-stretch justify-between gap-2">
        <div className="text-left">
          {node.type === 'Source' && 'Vout' in node ? (
            <div>
              <div style={{fontSize:'11px',color:'#555'}}>Vout: {(node as any).Vout}V</div>
            </div>
          ) : node.type === 'Converter' && 'Vout' in node && 'efficiency' in node ? (
            withPower(
              <div>
                <div style={{fontSize:'11px',color:'#555'}}>Vout: {(node as any).Vout}V</div>
                <div style={{fontSize:'11px',color:'#555'}}>η: {(() => {
                  const eff = (node as any).efficiency
                  if (eff?.type === 'curve' && nodeResult) {
                    const eta = etaFromModel(eff, nodeResult?.P_out ?? 0, nodeResult?.I_out ?? 0, node as any)
                    return (eta * 100).toFixed(1) + '%'
                  } else if (eff?.type === 'fixed') {
                    return ((eff.value ?? 0) * 100).toFixed(1) + '%'
                  } else if ((eff as any)?.points?.[0]?.eta) {
                    return (((eff as any).points[0].eta ?? 0) * 100).toFixed(1) + '%'
                  }
                  return '—'
                })()}</div>
              </div>,
              [
                buildPowerEntry('P_in', pinValue),
                buildPowerEntry('P_out', poutValue),
              ]
            )
          ) : node.type === 'Bus' ? (
            withPower(
              (() => {
                const resistance = Number((node as any).R_milliohm ?? 0)
                const resistanceText = Number.isFinite(resistance)
                  ? `${resistance.toLocaleString(undefined, { maximumFractionDigits: 2 })} mΩ`
                  : '—'
                const lossDisplay = formatPowerValue(lossValue)
                return (
                  <div>
                    <div style={{ fontSize: '11px', color: '#555' }}>R: {resistanceText}</div>
                    <div style={{ fontSize: '11px', color: '#555' }}>
                      Dissipation: <span title={lossDisplay.tooltip}>{lossDisplay.text}</span>
                    </div>
                  </div>
                )
              })(),
              [
                buildPowerEntry('P_in', pinValue),
                buildPowerEntry('P_out', poutValue),
              ]
            )
          ) : node.type === 'DualOutputConverter' ? (
            withPower(
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {(() => {
                  const outputs = Array.isArray((node as any).outputs) ? (node as any).outputs : []
                  const fallback = outputs.length > 0 ? outputs[0] : undefined
                  return outputs.map((branch:any, idx:number) => {
                    const handleId = branch?.id || (idx === 0 ? (fallback?.id || 'outputA') : `${fallback?.id || 'outputA'}-${idx}`)
                    const metric = outputMetrics[handleId] || {}
                    const label = branch?.label || `Output ${String.fromCharCode(65 + idx)}`
                    const eta = typeof metric.eta === 'number' ? metric.eta : undefined
                    return (
                      <div key={handleId} style={{fontSize:'11px',color:'#555'}}>
                        <div>{label}: {(branch?.Vout ?? 0)}V, η: {eta !== undefined ? (eta * 100).toFixed(1) + '%' : '—'}</div>
                        {(() => {
                          const powerDisplay = formatPowerValue(metric.P_out)
                          return (
                            <div style={{fontSize:'10px',color:'#64748b'}}>
                              P_out: <span title={powerDisplay.tooltip}>{powerDisplay.text}</span> | I_out: {Number.isFinite(metric.I_out) ? `${(metric.I_out || 0).toFixed(3)} A` : '—'}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })
                })()}
              </div>,
              [
                buildPowerEntry('P_in', pinValue),
                buildPowerEntry('P_out', poutValue),
              ]
            )
          ) : node.type === 'Load' && 'Vreq' in node && 'I_typ' in node && 'I_max' in node ? (
            (() => {
              const parallelCount = Math.max(1, Math.round((node as any).numParalleledDevices ?? 1))
              const entries: PowerEntry[] = [buildPowerEntry('P_in', pinValue)]
              entries.push({ label: 'Paralleled', text: `${parallelCount}`, tooltip: 'Number of paralleled devices' })
              return withPower(
                <div>
                  <div style={{fontSize:'11px',color:'#555'}}>I_typ: {(node as any).I_typ}A</div>
                  <div style={{fontSize:'11px',color:'#555'}}>I_max: {(node as any).I_max}A</div>
                </div>,
                entries
              )
            })()
          ) : node.type === 'Subsystem' ? (
            withPower(
              <div>
                <div style={{fontSize:'11px',color:'#555'}}>Paralleled: {((node as any).numParalleledSystems ?? 1)}</div>
              </div>,
              [
                buildPowerEntry('P_in total', pinValue),
                buildPowerEntry('P_in single', pinSingleValue),
              ]
            )
          ) : node.type === 'SubsystemInput' ? (
            withPower(
              <div>
                <div style={{fontSize:'11px',color:'#555'}}>Subsystem Input</div>
                <div style={{fontSize:'11px',color:'#555'}}>Vout: {(node as any).Vout ?? 0}V</div>
              </div>,
              [
                buildPowerEntry('P_in', pinValue),
              ]
            )
          ) : node.type === 'Note' && 'text' in node ? (
            <div>
              <div style={{fontSize:'11px',color:'#555', whiteSpace:'pre-wrap'}}>{(node as any).text}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
  const data: any = {
    label,
    type: node.type,
    parallelCount,
  }
  if (node.type === 'Converter' || node.type === 'DualOutputConverter' || node.type === 'Bus' || node.type === 'SubsystemInput') {
    data.inputConnectionCount = defaultHandleConnectionCount
    if (typeof resolvedInputVoltage === 'number' && Number.isFinite(resolvedInputVoltage)) {
      data.inputVoltage = resolvedInputVoltage
    }
  }
  if (node.type === 'Converter') {
    const vout = (node as any).Vout
    if (typeof vout === 'number' && Number.isFinite(vout)) {
      data.outputVoltage = vout
    }
  }
  if (node.type === 'Bus') {
    const vbus = (node as any).V_bus
    if (typeof vbus === 'number' && Number.isFinite(vbus)) {
      data.outputVoltage = vbus
    }
  }
  if (node.type === 'Load') data.Vreq = (node as any).Vreq
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
    if (!Array.isArray(data.inputPorts) || data.inputPorts.length === 0) {
      data.inputConnectionCount = defaultHandleConnectionCount
      if (typeof resolvedInputVoltage === 'number' && Number.isFinite(resolvedInputVoltage)) {
        data.inputVoltage = resolvedInputVoltage
      }
    }
  }
  if (node.type === 'SubsystemInput') {
    const vout = (node as any).Vout
    if (typeof vout === 'number' && Number.isFinite(vout)) {
      data.Vout = vout
      data.outputVoltage = vout
    }
  }
  if (node.type === 'DualOutputConverter'){
    data.outputs = (node as any).outputs || []
    data.outputMetrics = outputMetrics
  }
  return data
}

function EmbeddedSubsystemContainerNode(props: NodeProps) {
  const { data, selected } = props
  const color: string = data.color || '#0ea5e9'
  const name: string = data.name || 'Subsystem'
  const parallel: number = Number(data.parallelCount) || 1
  const width: number = data.width || 320
  const height: number = data.height || 240
  const overlay = hexToRgba(color, 0.2)
  const borderColor = color
  return (
    <div
      style={{
        width,
        height,
        border: `2px dashed ${borderColor}`,
        borderRadius: 16,
        background: overlay,
        boxShadow: selected ? '0 0 0 3px rgba(14, 165, 233, 0.35)' : 'none',
        position: 'relative',
        transition: 'box-shadow 0.2s ease'
      }}
    >
      <Handle type="source" position={Position.Right} id="output" style={{ background: color }} isConnectable={false} />
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ padding: '2px 8px', background: 'rgba(15, 23, 42, 0.65)', color: 'white', borderRadius: 8, fontSize: 12 }}>{name}</div>
        <div style={{ padding: '2px 8px', background: 'rgba(14, 165, 233, 0.85)', color: 'white', borderRadius: 8, fontSize: 12 }}>x{parallel}</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
    </div>
  )
}

type ExpandedSubsystemLayout = {
  subsystemId: string
  subsystemPath: string[]
  containerId: string
  containerPosition: { x: number; y: number }
  width: number
  height: number
  embeddedProject: Project
  childNodes: { node: AnyNode; rfId: string; position: { x: number; y: number } }[]
  inputNodeMap: Map<string, string>
  analysis: ReturnType<typeof compute>
  edgeMeta: Map<string, { offset?: number; localMidpoint?: number }>
  contentOffset: { x: number; y: number }
}

function estimateEmbeddedNodeSize(node: AnyNode): { width: number; height: number } {
  const rawWidth = Number((node as any).width)
  const rawHeight = Number((node as any).height)
  const hasWidth = Number.isFinite(rawWidth) && rawWidth > 0
  const hasHeight = Number.isFinite(rawHeight) && rawHeight > 0
  switch (node.type) {
    case 'Load':
      return {
        width: hasWidth ? rawWidth : 236,
        // Align closer to the rendered card height so container padding stays tight.
        height: hasHeight ? rawHeight : 108,
      }
    case 'Converter':
      return {
        width: hasWidth ? rawWidth : 210,
        height: hasHeight ? rawHeight : 102,
      }
    case 'Source':
      return {
        width: hasWidth ? rawWidth : 190,
        height: hasHeight ? rawHeight : 94,
      }
    case 'SubsystemInput':
      return {
        width: hasWidth ? rawWidth : 200,
        height: hasHeight ? rawHeight : 100,
      }
    case 'Subsystem': {
      const ports = Array.isArray((node as any).project?.nodes)
        ? (node as any).project.nodes.filter((n: any) => n.type === 'SubsystemInput')
        : []
      const estimatedHeight = computeSubsystemNodeMinHeight(ports.length)
      return {
        width: hasWidth ? rawWidth : 240,
        height: hasHeight ? rawHeight : Math.max(estimatedHeight, SUBSYSTEM_EMBEDDED_MIN_HEIGHT),
      }
    }
    case 'Bus':
      return {
        width: hasWidth ? rawWidth : 200,
        height: hasHeight ? rawHeight : 102,
      }
    case 'Note': {
      const text = String((node as any).text ?? '')
      const lines = text.length ? Math.min(text.split(/\r?\n/g).length, 6) : 1
      return {
        width: hasWidth ? rawWidth : 240,
        height: hasHeight ? rawHeight : 96 + lines * 18,
      }
    }
    default:
      return {
        width: hasWidth ? rawWidth : DEFAULT_EMBEDDED_NODE_WIDTH,
        height: hasHeight ? rawHeight : DEFAULT_EMBEDDED_NODE_HEIGHT,
      }
  }
}

function buildExpandedSubsystemLayouts(project: Project, expandedViews: Record<string, { offset: { x: number; y: number } }>): Map<string, ExpandedSubsystemLayout> {
  const layouts = new Map<string, ExpandedSubsystemLayout>()
  for (const [subsystemId, view] of Object.entries(expandedViews)) {
    const subsystem = project.nodes.find(n => n.id === subsystemId && (n as any).type === 'Subsystem') as any
    if (!subsystem || !subsystem.project) continue
    const embeddedProject = subsystem.project as Project
    const subsystemPath = findSubsystemPath(project, subsystemId) ?? [subsystemId]
    const nodes = embeddedProject.nodes as AnyNode[]
    if (!Array.isArray(nodes)) continue
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const child of nodes) {
      const x = typeof child.x === 'number' ? child.x : 0
      const y = typeof child.y === 'number' ? child.y : 0
      const { width: approxWidth, height: approxHeight } = estimateEmbeddedNodeSize(child)
      minX = Math.min(minX, x - EMBEDDED_NODE_MARGIN_X)
      minY = Math.min(minY, y - EMBEDDED_NODE_MARGIN_TOP)
      maxX = Math.max(maxX, x + approxWidth + EMBEDDED_NODE_MARGIN_X)
      maxY = Math.max(maxY, y + approxHeight + EMBEDDED_NODE_MARGIN_BOTTOM)
    }
    for (const edge of embeddedProject.edges) {
      const midpointX = Number((edge as any).midpointX)
      if (Number.isFinite(midpointX)) {
        minX = Math.min(minX, midpointX - EMBEDDED_EDGE_MARGIN_X)
        maxX = Math.max(maxX, midpointX + EMBEDDED_EDGE_MARGIN_X)
      }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      minX = 0
      minY = 0
      maxX = EMBEDDED_CONTAINER_MIN_WIDTH
      maxY = EMBEDDED_CONTAINER_MIN_HEIGHT
    }
    minY -= EMBEDDED_EDGE_MARGIN_TOP
    maxY += EMBEDDED_EDGE_MARGIN_BOTTOM
    const width = Math.max(EMBEDDED_CONTAINER_MIN_WIDTH, maxX - minX)
    const height = Math.max(EMBEDDED_CONTAINER_MIN_HEIGHT, maxY - minY)
    const containerId = `${subsystemId}::container`
    const containerPosition = {
      x: (typeof subsystem.x === 'number' ? subsystem.x : 0) + (view.offset?.x ?? 0),
      y: (typeof subsystem.y === 'number' ? subsystem.y : 0) + (view.offset?.y ?? 0),
    }
    const inputNodeMap = new Map<string, string>()
    const childNodes: { node: AnyNode; rfId: string; position: { x: number; y: number } }[] = []
    for (const child of nodes) {
      const rfId = `${subsystemId}::${child.id}`
      const position = {
        x: (typeof child.x === 'number' ? child.x : 0) - minX,
        y: (typeof child.y === 'number' ? child.y : 0) - minY,
      }
      childNodes.push({ node: child, rfId, position })
      if ((child as any).type === 'SubsystemInput') {
        inputNodeMap.set(child.id, rfId)
      }
    }
    const cloned: Project = JSON.parse(JSON.stringify(embeddedProject))
    cloned.currentScenario = project.currentScenario
    const analysis = compute(cloned)
    const edgeGroups = computeEdgeGroupInfo(embeddedProject.edges)
    const edgeMeta = new Map<string, { offset?: number; localMidpoint?: number }>()
    for (const edge of embeddedProject.edges) {
      const info = edgeGroups.get(edgeGroupKey({ from: edge.from, fromHandle: edge.fromHandle }))
      const offset = (typeof edge.midpointOffset === 'number') ? edge.midpointOffset : info?.offset
      const baseMidpoint = (typeof edge.midpointX === 'number') ? edge.midpointX : info?.midpointX
      const localMidpoint = (typeof baseMidpoint === 'number') ? (baseMidpoint - minX) : undefined
      edgeMeta.set(edge.id, { offset, localMidpoint })
    }
    layouts.set(subsystemId, {
      subsystemId,
      subsystemPath,
      containerId,
      containerPosition,
      width,
      height,
      embeddedProject,
      childNodes,
      inputNodeMap,
      analysis,
      edgeMeta,
      contentOffset: { x: minX, y: minY },
    })
  }
  return layouts
}

const parallelCountForNode = (node: any): number => {
  if (!node) return 1;
  if (node.type === 'Load') {
    const value = Number(node.numParalleledDevices);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
  }
  if (node.type === 'Subsystem') {
    const value = Number(node.numParalleledSystems);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
  }
  return 1;
}

const parseNestedNodeId = (id: string) => {
  if (!id.includes('::')) return null
  if (id.endsWith('::container')) return null
  const idx = id.indexOf('::')
  if (idx === -1) return null
  const subsystemId = id.slice(0, idx)
  const nodeId = id.slice(idx + 2)
  if (!subsystemId || !nodeId) return null
  return { subsystemId, nodeId }
}

const parseNestedEdgeId = (id: string) => {
  const marker = '::edge::'
  const idx = id.indexOf(marker)
  if (idx === -1) return null
  const subsystemId = id.slice(0, idx)
  const edgeId = id.slice(idx + marker.length)
  if (!subsystemId || !edgeId) return null
  return { subsystemId, edgeId }
}

const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  {
    onSelect,
    onOpenSubsystem,
    markupTool,
    onMarkupToolChange,
    selectionMode,
    selectionModeSource,
    onSelectionModeChange,
  },
  ref
) {
  const project = useStore(s=>s.project)
  const addEdgeStore = useStore(s=>s.addEdge)
  const addNodeStore = useStore(s=>s.addNode)
  const updatePos = useStore(s=>s.updateNodePos)
  const removeNode = useStore(s=>s.removeNode)
  const removeEdge = useStore(s=>s.removeEdge)
  const updateEdgeStore = useStore(s=>s.updateEdge)
  const nestedAddNode = useStore(s=>s.nestedSubsystemAddNode)
  const nestedUpdateNodePos = useStore(s=>s.nestedSubsystemUpdateNodePos)
  const bulkUpdateNodesStore = useStore(s=>s.bulkUpdateNodes)
  const nestedRemoveNode = useStore(s=>s.nestedSubsystemRemoveNode)
  const nestedRemoveEdge = useStore(s=>s.nestedSubsystemRemoveEdge)
  const nestedUpdateEdge = useStore(s=>s.nestedSubsystemUpdateEdge)
  const clipboard = useStore(s=>s.clipboard)
  const setClipboard = useStore(s=>s.setClipboard)
  const quickPresets = useStore(s => s.quickPresets)
  const quickPresetDialogs = useQuickPresetDialogs()
  const reactFlowInstance = useReactFlow()
  const { screenToFlowPosition } = reactFlowInstance
  const openSubsystemIds = useStore(s => s.openSubsystemIds)
  const expandedSubsystemViews = useStore(s=>s.expandedSubsystemViews)
  const setSubsystemViewOffset = useStore(s=>s.setSubsystemViewOffset)
  const collapseSubsystemView = useStore(s=>s.collapseSubsystemView)
  const addMarkupStore = useStore(s=>s.addMarkup)
  const updateMarkupStore = useStore(s=>s.updateMarkup)
  const removeMarkupStore = useStore(s=>s.removeMarkup)
  const undo = useStore(s=>s.undo)
  const redo = useStore(s=>s.redo)
  const pastLen = useStore(s=>s.past.length)
  const futureLen = useStore(s=>s.future.length)

  const markups = project.markups ?? []
  const [selectedMarkupId, setSelectedMarkupId] = useState<string | null>(null)

  const groupMidpointInfo = useMemo(() => computeEdgeGroupInfo(project.edges), [project.edges])
  const liveMidpointDraft = useRef(new Map<string, { offset: number; absoluteAxisCoord?: number; axis: 'x' | 'y' }>())
  const setEdgesRef = useRef<React.Dispatch<React.SetStateAction<RFEdge[]>> | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    liveMidpointDraft.current.clear()
  }, [project.edges])
  const expandedLayouts = useMemo(() => buildExpandedSubsystemLayouts(project, expandedSubsystemViews), [project, expandedSubsystemViews])
  const [contextMenu, setContextMenu] = useState<{ type: 'node'|'pane'; x:number; y:number; targetId?: string }|null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string|null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string|null>(null)
  const [multiSelection, setMultiSelection] = useState<MultiSelection | null>(null)
  const [multiSelectionPreview, setMultiSelectionPreview] = useState<MultiSelection | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const marqueeStateRef = useRef<{
    originClient: { x: number; y: number }
    originFlow: { x: number; y: number }
    additive: boolean
    forcedMulti: boolean
  } | null>(null)
  const skipPaneClickRef = useRef(false)
  const activeMultiSelection = multiSelectionPreview ?? multiSelection

  const handleSingleSelectClick = useCallback(() => {
    if (markupTool !== null) {
      onMarkupToolChange(null)
    }
    onSelectionModeChange('single')
  }, [markupTool, onMarkupToolChange, onSelectionModeChange])

  const handleMultiSelectClick = useCallback(() => {
    const nextMode: SelectionMode = selectionMode === 'multi' ? 'single' : 'multi'
    if (nextMode === 'multi' && markupTool !== null) {
      onMarkupToolChange(null)
    }
    onSelectionModeChange(nextMode)
  }, [markupTool, onMarkupToolChange, onSelectionModeChange, selectionMode])

  const isSelectActive = selectionMode === 'single' && markupTool === null
  const isMultiActive = selectionMode === 'multi'

  const clearMultiSelection = useCallback(
    (options?: { preserveTemporary?: boolean }) => {
      setMultiSelection(null)
      setMultiSelectionPreview(null)
      setMarqueeRect(null)
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

  const emitSelectionForNode = useCallback((nodeId: string) => {
    const nested = parseNestedNodeId(nodeId)
    if (nested) {
      const layout = expandedLayouts.get(nested.subsystemId)
      if (layout) {
        onSelect({ kind: 'nested-node', subsystemPath: layout.subsystemPath, nodeId: nested.nodeId })
        return
      }
    }
    if (nodeId.endsWith('::container')) {
      const subsystemId = nodeId.split('::')[0]
      onSelect({ kind: 'node', id: subsystemId })
      return
    }
    onSelect({ kind: 'node', id: nodeId })
  }, [expandedLayouts, onSelect])

  const emitSelectionForEdge = useCallback((edgeId: string) => {
    const nested = parseNestedEdgeId(edgeId)
    if (nested) {
      const layout = expandedLayouts.get(nested.subsystemId)
      if (layout) {
        onSelect({ kind: 'nested-edge', subsystemPath: layout.subsystemPath, edgeId: nested.edgeId })
        return
      }
    }
    onSelect({ kind: 'edge', id: edgeId })
  }, [expandedLayouts, onSelect])

  const emitSelectionForMarkup = useCallback((markupId: string) => {
    onSelect({ kind: 'markup', id: markupId })
  }, [onSelect])

  const selectSingleNode = useCallback(
    (nodeId: string) => {
      emitSelectionForNode(nodeId)
      setSelectedNodeId(nodeId)
      setSelectedEdgeId(null)
      setSelectedMarkupId(null)
    },
    [emitSelectionForNode]
  )

  const selectSingleEdge = useCallback(
    (edgeId: string) => {
      emitSelectionForEdge(edgeId)
      setSelectedEdgeId(edgeId)
      setSelectedNodeId(null)
      setSelectedMarkupId(null)
    },
    [emitSelectionForEdge]
  )

  const selectSingleMarkup = useCallback(
    (markupId: string) => {
      emitSelectionForMarkup(markupId)
      setSelectedMarkupId(markupId)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
    },
    [emitSelectionForMarkup]
  )

  const toggleWithModifier = useCallback(
    (
      payload: { kind: 'node' | 'edge' | 'markup'; id: string },
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

  const handleMarkupSelect = useCallback(
    (markupId: string | null, event?: React.PointerEvent | React.MouseEvent) => {
      if (markupId && event && isMultiSelectModifier(event)) {
        toggleWithModifier(
          { kind: 'markup', id: markupId },
          () => selectSingleMarkup(markupId)
        )
        return
      }

      if (markupId) {
        clearMultiSelection({ preserveTemporary: true })
        selectSingleMarkup(markupId)
      } else if (selectedMarkupId !== null) {
        setSelectedMarkupId(null)
        onSelect(null)
      }
    },
    [clearMultiSelection, onSelect, selectSingleMarkup, selectedMarkupId, toggleWithModifier]
  )

  const selectSingleNodeWithClear = useCallback(
    (nodeId: string) => {
      clearMultiSelection({ preserveTemporary: true })
      selectSingleNode(nodeId)
    },
    [clearMultiSelection, selectSingleNode]
  )

  const selectSingleEdgeWithClear = useCallback(
    (edgeId: string) => {
      clearMultiSelection({ preserveTemporary: true })
      selectSingleEdge(edgeId)
    },
    [clearMultiSelection, selectSingleEdge]
  )

  const handleNodeClickById = useCallback(
    (event: React.MouseEvent, nodeId: string) => {
      if (isMultiSelectModifier(event)) {
        toggleWithModifier({ kind: 'node', id: nodeId }, () => selectSingleNodeWithClear(nodeId))
        return
      }
      selectSingleNodeWithClear(nodeId)
    },
    [selectSingleNodeWithClear, toggleWithModifier]
  )

  const handleNodeDragStartEvent = useCallback(
    (event: React.MouseEvent, node: RFNode) => {
      const nodeId = node.id
      if (isMultiSelectModifier(event)) {
        toggleWithModifier({ kind: 'node', id: nodeId }, () => selectSingleNodeWithClear(nodeId))
        return
      }
      if (multiSelection && multiSelection.nodes.includes(nodeId)) {
        return
      }
      selectSingleNodeWithClear(nodeId)
    },
    [multiSelection, selectSingleNodeWithClear, toggleWithModifier]
  )

  const handleEdgeClickById = useCallback(
    (event: React.MouseEvent, edgeId: string) => {
      if (isMultiSelectModifier(event)) {
        toggleWithModifier({ kind: 'edge', id: edgeId }, () => selectSingleEdgeWithClear(edgeId))
        return
      }
      selectSingleEdgeWithClear(edgeId)
    },
    [selectSingleEdgeWithClear, toggleWithModifier]
  )

  const handlePaneClick = useCallback(() => {
    if (skipPaneClickRef.current) {
      skipPaneClickRef.current = false
      return
    }
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    handleMarkupSelect(null)
    if (multiSelection) {
      applyMultiSelection(null, { source: selectionModeSource === 'temporary' ? 'temporary' : undefined })
    } else if (selectionMode === 'multi' && selectionModeSource === 'temporary') {
      onSelectionModeChange('single', { source: 'temporary' })
      onSelect(null)
    } else {
      onSelect(null)
    }
  }, [applyMultiSelection, handleMarkupSelect, multiSelection, onSelect, onSelectionModeChange, selectionMode, selectionModeSource])

  useEffect(() => {
    if (selectedMarkupId && !markups.some(m => m.id === selectedMarkupId)) {
      setSelectedMarkupId(null)
      if (!selectedNodeId && !selectedEdgeId) {
        onSelect(null)
      }
    }
  }, [markups, selectedMarkupId, selectedNodeId, selectedEdgeId, onSelect])

  useEffect(() => {
    if (markupTool) {
      handleMarkupSelect(null)
    }
  }, [markupTool, handleMarkupSelect])

  useEffect(() => {
    if (selectionMode !== 'multi') {
      setMultiSelection(null)
      setMultiSelectionPreview(null)
      setMarqueeRect(null)
    }
  }, [selectionMode])

  const handleMarkupCreate = useCallback((markup: CanvasMarkup) => {
    addMarkupStore(markup)
    handleMarkupSelect(markup.id)
    onMarkupToolChange(null)
  }, [addMarkupStore, handleMarkupSelect, onMarkupToolChange])

  const handleMarkupCommit = useCallback((id: string, next: CanvasMarkup) => {
    const existing = markups.find(m => m.id === id)
    if (existing) {
      const currentPayload = JSON.stringify(existing)
      const nextPayload = JSON.stringify(next)
      if (currentPayload === nextPayload) {
        return
      }
    }
    updateMarkupStore(id, () => next)
    setSelectedMarkupId(id)
  }, [markups, updateMarkupStore])

  const determineActiveLayout = useCallback((): ExpandedSubsystemLayout | null => {
    if (!selectedNodeId) return null
    if (selectedNodeId.endsWith('::container')) {
      const subsystemId = selectedNodeId.split('::')[0]
      return expandedLayouts.get(subsystemId) ?? null
    }
    const nested = parseNestedNodeId(selectedNodeId)
    if (!nested) return null
    return expandedLayouts.get(nested.subsystemId) ?? null
  }, [expandedLayouts, selectedNodeId])

  const computeSelectionWithinBounds = useCallback((bounds: Bounds): MultiSelection => {
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
      if (markup.type === 'text') {
        const width = markup.size?.width ?? 220
        const height = markup.size?.height ?? Math.max(18, (markup.fontSize ?? 16) * 1.4)
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
      } else if (markup.type === 'rectangle') {
        rect = {
          minX: markup.position.x,
          maxX: markup.position.x + markup.size.width,
          minY: markup.position.y,
          maxY: markup.position.y + markup.size.height,
        }
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
  }, [markups, reactFlowInstance])

  const exportToPdf = useCallback(async () => {
    if (!wrapperRef.current) {
      console.warn('Canvas wrapper not ready for export')
      return
    }
    try {
      const nodesSnapshot = reactFlowInstance.getNodes()
      const edgesSnapshot = reactFlowInstance.getEdges()
      const viewportSnapshot = reactFlowInstance.getViewport()
      await exportCanvasToPdf({
        wrapper: wrapperRef.current,
        nodes: nodesSnapshot,
        edges: edgesSnapshot,
        viewport: viewportSnapshot,
        fileName: project.name || 'PowerTreeCanvas',
      })
    } catch (err) {
      console.error('Failed to export canvas as PDF', err)
      const message = err instanceof Error && err.message ? err.message : 'Unable to export canvas as PDF. Please try again.'
      window.alert(message)
    }
  }, [project.name, reactFlowInstance])

  useImperativeHandle(ref, () => ({ exportToPdf }), [exportToPdf])

  const nodeTypes = useMemo(() => ({ custom: CustomNode, embeddedSubsystemContainer: EmbeddedSubsystemContainerNode }), [])
  const edgeTypes = useMemo(() => ({ orthogonal: OrthogonalEdge }), [])

  const computeResult = useMemo(()=> compute(project), [project])

  // Detailed metrics for banner
  const { criticalLoadPower, nonCriticalLoadPower, edgeLoss, converterLoss, totalSystemPower, overallEta } = useMemo(()=>{
    const deep = computeDeepAggregates(project)
    const sourceInput = computeResult.totals.sourceInput || 0
    const eta = sourceInput > 0 ? (deep.criticalLoadPower / sourceInput) : 0
    return {
      criticalLoadPower: deep.criticalLoadPower,
      nonCriticalLoadPower: deep.nonCriticalLoadPower,
      edgeLoss: deep.edgeLoss,
      converterLoss: deep.converterLoss,
      totalSystemPower: deep.totalLoadPower + deep.edgeLoss + deep.converterLoss,
      overallEta: eta,
    }
  }, [project, computeResult])

  const bannerPowerMetrics = useMemo(() => {
    const entries = [
      { key: 'total', label: 'Total', raw: totalSystemPower },
      { key: 'critical', label: 'Critical', raw: criticalLoadPower },
      { key: 'nonCritical', label: 'Non-critical', raw: nonCriticalLoadPower },
      { key: 'edgeLoss', label: 'Copper loss', raw: edgeLoss },
      { key: 'converterLoss', label: 'Converter loss', raw: converterLoss },
    ] as const

    return entries.map((entry) => ({
      ...entry,
      formatted: formatPower(entry.raw),
      tooltip: powerTooltipLabel(entry.raw),
    }))
  }, [totalSystemPower, criticalLoadPower, nonCriticalLoadPower, edgeLoss, converterLoss])

  const rfNodesInit: RFNode[] = useMemo(() => {
    const nodes: RFNode[] = []
    const expandedIds = new Set(expandedLayouts.keys())
    for (const node of project.nodes as AnyNode[]) {
      if (node.type === 'Subsystem' && expandedIds.has(node.id)) {
        const layout = expandedLayouts.get(node.id)
        if (!layout) continue
        const color = (node as any).embeddedViewColor || '#0ea5e9'
        nodes.push({
          id: layout.containerId,
          type: 'embeddedSubsystemContainer',
          position: layout.containerPosition,
          data: {
            subsystemId: node.id,
            name: node.name,
            parallelCount: (node as any).numParalleledSystems ?? 1,
            color,
            width: layout.width,
            height: layout.height,
          },
          draggable: true,
          selectable: true,
          style: { width: layout.width, height: layout.height },
        })
        for (const child of layout.childNodes) {
          const childData = buildNodeDisplayData(child.node, layout.analysis.nodes, layout.embeddedProject.edges, layout.embeddedProject.nodes as AnyNode[])
          nodes.push({
            id: child.rfId,
            type: 'custom',
            position: child.position,
            data: {
              ...childData,
              owningSubsystemId: node.id,
              originalNodeId: child.node.id,
              // mark this node as an embedded child so its handles are not connectable
              disableEmbeddedConnections: true,
            },
            parentNode: layout.containerId,
            extent: 'parent',
            draggable: true,
            selectable: true,
          })
        }
      } else {
        const data = buildNodeDisplayData(node, computeResult.nodes, project.edges, project.nodes as AnyNode[])
        nodes.push({
          id: node.id,
          type: 'custom',
          position: { x: node.x ?? (Math.random()*400)|0, y: node.y ?? (Math.random()*300)|0 },
          data,
          draggable: true,
          selectable: true,
        })
      }
    }
    return nodes
  }, [project.nodes, project.edges, computeResult.nodes, expandedLayouts])

  const [nodes, setNodes, ] = useNodesState(rfNodesInit)

  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const node of nodes) {
      const abs = (node as any).positionAbsolute
      if (abs && typeof abs.x === 'number' && typeof abs.y === 'number') {
        map.set(node.id, { x: abs.x, y: abs.y })
      } else {
        map.set(node.id, { x: node.position.x, y: node.position.y })
      }
    }
    return map
  }, [nodes])

  const resolveNodePosition = useCallback((id?: string) => {
    if (!id) return undefined
    const direct = nodePositions.get(id)
    if (direct) return direct
    if (expandedLayouts.has(id)) {
      const layout = expandedLayouts.get(id)!
      return nodePositions.get(layout.containerId) ?? layout.containerPosition
    }
    return undefined
  }, [expandedLayouts, nodePositions])

  const findLayoutAtPoint = useCallback((point: { x: number; y: number }) => {
    for (const layout of expandedLayouts.values()) {
      const containerPos = nodePositions.get(layout.containerId) ?? layout.containerPosition
      const withinX = point.x >= containerPos.x && point.x <= containerPos.x + layout.width
      const withinY = point.y >= containerPos.y && point.y <= containerPos.y + layout.height
      if (withinX && withinY) {
        return { layout, containerPos }
      }
    }
    return null
  }, [expandedLayouts, nodePositions])

  const startMarqueeSelection = useCallback(
    (originClient: { x: number; y: number }, additive: boolean, forcedMulti = false) => {
    if (!wrapperRef.current) return
    const bounds = wrapperRef.current.getBoundingClientRect()
    marqueeStateRef.current = {
      originClient,
      originFlow: screenToFlowPosition(originClient),
      additive,
      forcedMulti,
    }
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setSelectedMarkupId(null)
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
  }, [applyMultiSelection, computeSelectionWithinBounds, mergeSelections, multiSelection, onSelectionModeChange, screenToFlowPosition, selectionMode])

  const handleWrapperPointerDownCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (markupTool) return
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
  }, [markupTool, onSelectionModeChange, selectionMode, startMarqueeSelection])

  const handleCanvasDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!dataTransferHasNodePreset(e.dataTransfer) && !dataTransferHasQuickPreset(e.dataTransfer)) return
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const placeNodeAtPosition = useCallback((node: AnyNode, flowPos: { x: number; y: number }) => {
    const match = findLayoutAtPoint(flowPos)
    if (match) {
      if (node.type === 'Source') return
      const { layout, containerPos } = match
      const localX = flowPos.x - containerPos.x
      const localY = flowPos.y - containerPos.y
      const actualX = localX + layout.contentOffset.x
      const actualY = localY + layout.contentOffset.y
      const placedNested = withPosition(node, { x: actualX, y: actualY })
      nestedAddNode(layout.subsystemPath, placedNested)
      return
    }
    const placed = withPosition(node, { x: flowPos.x, y: flowPos.y })
    addNodeStore(placed)
  }, [addNodeStore, findLayoutAtPoint, nestedAddNode])

  const handleCanvasDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const dt = e.dataTransfer
    if (!dt) return
    const quickPayload = readQuickPresetDragPayload(dt)
    let baseNode: AnyNode | null = null
    if (quickPayload) {
      const preset = quickPresets.find(p => p.id === quickPayload.presetId)
      if (!preset) return
      baseNode = materializeQuickPreset(preset)
    } else {
      if (!dataTransferHasNodePreset(dt)) return
      const raw = dt.getData(NODE_PRESET_MIME) ?? null
      const descriptor = deserializePresetDescriptor(raw)
      if (!descriptor) return
      baseNode = createNodePreset(descriptor)
    }
    if (!baseNode) return
    e.preventDefault()
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    if (!flowPos || typeof flowPos.x !== 'number' || typeof flowPos.y !== 'number') return
    setContextMenu(null)
    placeNodeAtPosition(baseNode, flowPos)
  }, [placeNodeAtPosition, quickPresets, screenToFlowPosition, setContextMenu])

  const getGroupOffset = useCallback((edge: { from: string; to?: string; fromHandle?: string | null }) => {
    const info = groupMidpointInfo.get(edgeGroupKey(edge))
    if (!info) return 0.5
    const { midpointX, offset } = info
    if (midpointX === undefined) return offset
    const sourcePos = resolveNodePosition(edge.from)
    const targetPos = resolveNodePosition(edge.to)
    const startX = sourcePos?.x
    const endX = targetPos?.x
    if (typeof startX === 'number' && typeof endX === 'number' && Number.isFinite(startX) && Number.isFinite(endX) && Math.abs(endX - startX) > 1e-3) {
      const ratio = (midpointX - startX) / (endX - startX)
      if (Number.isFinite(ratio)) {
        return Math.min(1, Math.max(0, ratio))
      }
    }
    return offset
  }, [groupMidpointInfo, resolveNodePosition])

  const handleMidpointChange = useCallback((edgeId: string, payload: { offset: number; absoluteAxisCoord?: number; axis: 'x' | 'y' }) => {
    const setter = setEdgesRef.current
    if (!setter) return
    if (!Number.isFinite(payload.offset)) return
    const sourceEdge = project.edges.find(e => e.id === edgeId)
    if (!sourceEdge) return
    const key = edgeGroupKey({ from: sourceEdge.from, fromHandle: sourceEdge.fromHandle })
    let usableAbsolute = payload.absoluteAxisCoord
    if (typeof usableAbsolute !== 'number' || !Number.isFinite(usableAbsolute)) {
      const sourcePos = resolveNodePosition(sourceEdge.from)
      const targetPos = resolveNodePosition(sourceEdge.to)
      if (sourcePos && targetPos) {
        const startX = sourcePos.x
        const endX = targetPos.x
        if (Number.isFinite(startX) && Number.isFinite(endX) && Math.abs(endX - startX) > 1e-3) {
          usableAbsolute = startX + (endX - startX) * Math.min(1, Math.max(0, payload.offset))
        }
      }
    }
    liveMidpointDraft.current.set(key, { ...payload, absoluteAxisCoord: usableAbsolute })
    setter(prev => prev.map(edge => {
      const data: any = edge.data
      if (!data || data.groupKey !== key) return edge
      const nextData: any = { ...data, midpointOffset: payload.offset }
      if (typeof usableAbsolute === 'number' && Number.isFinite(usableAbsolute)) {
        nextData.midpointX = usableAbsolute
      }
      return { ...edge, data: nextData }
    }))
  }, [project.edges, resolveNodePosition])

  const handleMidpointCommit = useCallback((edgeId: string, payload: { offset: number; absoluteAxisCoord?: number; axis: 'x' | 'y' }) => {
    if (!updateEdgeStore) return
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
      const sourcePos = resolveNodePosition(sourceEdge.from)
      const targetPos = resolveNodePosition(sourceEdge.to)
      if (sourcePos && targetPos) {
        const startX = sourcePos.x
        const endX = targetPos.x
        if (Number.isFinite(startX) && Number.isFinite(endX) && Math.abs(endX - startX) > 1e-3) {
          usableAbsolute = startX + (endX - startX) * clamped
        }
      }
    }
    for (const edge of project.edges) {
      if (edgeGroupKey({ from: edge.from, fromHandle: edge.fromHandle }) !== key) continue
      const patch: Partial<Edge> = { midpointOffset: clamped }
      if (typeof usableAbsolute === 'number' && Number.isFinite(usableAbsolute)) {
        patch.midpointX = usableAbsolute
      }
      updateEdgeStore(edge.id, patch)
    }
  }, [project.edges, resolveNodePosition, updateEdgeStore])

  useEffect(() => {
    if (!updateEdgeStore) return
    const processed = new Set<string>()
    for (const edge of project.edges) {
      const key = edgeGroupKey({ from: edge.from, fromHandle: edge.fromHandle })
      if (processed.has(key)) continue
      processed.add(key)
      const info = groupMidpointInfo.get(key)
      if (!info || info.midpointX !== undefined) continue
      const sourcePos = resolveNodePosition(edge.from)
      const targetPos = resolveNodePosition(edge.to)
      if (!sourcePos || !targetPos) continue
      const startX = sourcePos.x
      const endX = targetPos.x
      if (!Number.isFinite(startX) || !Number.isFinite(endX) || Math.abs(endX - startX) <= 1e-3) continue
      const midpointX = startX + (endX - startX) * info.offset
      if (!Number.isFinite(midpointX)) continue
      for (const groupEdge of project.edges) {
        if (edgeGroupKey({ from: groupEdge.from, fromHandle: groupEdge.fromHandle }) !== key) continue
        updateEdgeStore(groupEdge.id, { midpointX })
      }
    }
  }, [groupMidpointInfo, project.edges, resolveNodePosition, updateEdgeStore])

  const rfEdgesInit: RFEdge[] = useMemo(() => {
    const edges: RFEdge[] = []
    const expandedIds = new Set(expandedLayouts.keys())
    for (const e of project.edges) {
      const I = computeResult.edges[e.id]?.I_edge ?? 0
      const strokeWidth = 3
      const parent = project.nodes.find(n=>n.id===e.from) as any
      const child = project.nodes.find(n=>n.id===e.to) as any
      let parentV: number | undefined
      if (parent?.type==='Source') parentV = parent?.Vout
      else if (parent?.type==='Converter') parentV = parent?.Vout
      else if (parent?.type==='DualOutputConverter'){
        const outputs = Array.isArray(parent?.outputs) ? parent.outputs : []
        const fallback = outputs.length > 0 ? outputs[0] : undefined
        const handleId = (e as any).fromHandle as string | undefined
        const branch = handleId ? outputs.find((b:any)=>b?.id===handleId) : undefined
        parentV = (branch || fallback)?.Vout
      }
      else if (parent?.type==='Bus') parentV = parent?.V_bus
      else if (parent?.type==='SubsystemInput') parentV = parent?.Vout
      const childRange = (child?.type==='Converter' || child?.type==='DualOutputConverter')? { min: child?.Vin_min, max: child?.Vin_max } : undefined
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
        // Always allow extra travel so the midpoint remains draggable
        extendMidpointRange: true,
        groupKey: key,
      }
      let sourceId = e.from
      let targetId = e.to
      let sourceHandle = (e as any).fromHandle
      let targetHandle = (e as any).toHandle
      if (expandedIds.has(e.from)) {
        const layout = expandedLayouts.get(e.from)!
        sourceId = layout.containerId
        sourceHandle = 'output'
      }
      if (expandedIds.has(e.to)) {
        const layout = expandedLayouts.get(e.to)!
        const mapped = targetHandle ? layout.inputNodeMap.get(targetHandle) : undefined
        if (mapped) {
          targetId = mapped
          targetHandle = mapped
        } else if (layout.inputNodeMap.size === 1) {
          const only = Array.from(layout.inputNodeMap.values())[0]
          targetId = only
          targetHandle = only
        } else {
          targetId = layout.containerId
          targetHandle = undefined
        }
      }
      edges.push({
        id: e.id,
        type: 'orthogonal',
        source: sourceId,
        target: targetId,
        sourceHandle,
        targetHandle,
        animated: false,
        label,
        labelStyle: { fill: defaultColor },
        style: { strokeWidth, stroke: defaultColor },
        data: edgeData,
        selected: false,
      })
    }
    for (const layout of expandedLayouts.values()) {
      const containerPos = nodePositions.get(layout.containerId) ?? layout.containerPosition
      const embeddedEdges = layout.embeddedProject.edges
      for (const e of embeddedEdges) {
        const localEdgeResult = layout.analysis.edges[e.id] || {}
        const I = localEdgeResult.I_edge ?? 0
        const strokeWidth = 3
        const parent = layout.embeddedProject.nodes.find(n=>n.id===e.from) as any
        let parentV: number | undefined
        if (parent?.type==='Source') parentV = parent?.Vout
        else if (parent?.type==='Converter') parentV = parent?.Vout
        else if (parent?.type==='DualOutputConverter') {
          const outputs = Array.isArray(parent?.outputs) ? parent.outputs : []
          const fallback = outputs.length > 0 ? outputs[0] : undefined
          const handleId = (e as any).fromHandle as string | undefined
          const branch = handleId ? outputs.find((b:any)=>b?.id===handleId) : undefined
          parentV = (branch || fallback)?.Vout
        }
        else if (parent?.type==='Bus') parentV = parent?.V_bus
        else if (parent?.type==='SubsystemInput') parentV = parent?.Vout
        const baseLabel = `${(e.interconnect?.R_milliohm ?? 0).toFixed(1)} mΩ | ${I.toFixed(1)} A`
        const edgeColor = voltageToEdgeColor(parentV)
        const meta = layout.edgeMeta.get(e.id) || {}
        const midpointOffset = meta.offset ?? (typeof e.midpointOffset === 'number' ? e.midpointOffset : 0.5)
        const midpointX = typeof meta.localMidpoint === 'number'
          ? containerPos.x + meta.localMidpoint
          : undefined
        const embeddedGroupKey = edgeGroupKey({ from: e.from, fromHandle: (e as any)?.fromHandle })
        edges.push({
          id: `${layout.subsystemId}::edge::${e.id}`,
          type: 'orthogonal',
          source: `${layout.subsystemId}::${e.from}`,
          target: `${layout.subsystemId}::${e.to}`,
          sourceHandle: (e as any).fromHandle,
          targetHandle: (e as any).toHandle,
          animated: false,
          label: baseLabel,
          labelStyle: { fill: edgeColor },
          style: { strokeWidth, stroke: edgeColor },
          data: {
            midpointOffset,
            ...(typeof midpointX === 'number' ? { midpointX } : {}),
            defaultColor: edgeColor,
            groupKey: embeddedGroupKey,
            enableCrossMarkers: false,
          },
          selectable: true,
        })
      }
    }
    return edges
  }, [project.edges, project.nodes, computeResult.edges, expandedLayouts, getGroupOffset, groupMidpointInfo, handleMidpointChange, handleMidpointCommit, nodePositions, screenToFlowPosition])

  const [edges, setEdges, ] = useEdgesState(rfEdgesInit)
  setEdgesRef.current = setEdges

  useEffect(() => {
    setNodes(rfNodesInit)
  }, [rfNodesInit, setNodes])

  useEffect(() => {
    setEdges(rfEdgesInit)
  }, [rfEdgesInit, setEdges])

  useEffect(() => {
    setNodes(prev => prev.map(rn => {
      const inMulti = activeMultiSelection?.nodes.includes(rn.id) ?? false
      const shouldSelect = selectedNodeId === rn.id || inMulti
      if (rn.selected === shouldSelect) return rn
      return { ...rn, selected: shouldSelect }
    }))
  }, [activeMultiSelection, selectedNodeId, rfNodesInit, setNodes])

  useEffect(() => {
    if (!selectedNodeId) return
    if (selectedNodeId.endsWith('::container')) {
      const subsystemId = selectedNodeId.split('::')[0]
      if (!expandedSubsystemViews[subsystemId]) {
        setSelectedNodeId(subsystemId)
      }
    } else if (expandedLayouts.has(selectedNodeId)) {
      const containerId = `${selectedNodeId}::container`
      setSelectedNodeId(containerId)
    }
  }, [selectedNodeId, expandedLayouts, expandedSubsystemViews])


  useEffect(() => {
    setEdges(prev => prev.map(edge => {
      const inMulti = activeMultiSelection?.edges.includes(edge.id) ?? false
      const shouldSelect = selectedEdgeId === edge.id || inMulti
      if (edge.selected === shouldSelect) return edge
      return { ...edge, selected: shouldSelect }
    }))
  }, [activeMultiSelection, selectedEdgeId, rfEdgesInit, setEdges])

  const handleNodesChange = useCallback((changes:any)=>{
    setNodes(nds=>applyNodeChanges(changes, nds))
    for (const ch of changes){
      if (ch.type !== 'position' || ch.dragging !== false) continue
      const nested = parseNestedNodeId(ch.id)
      if (nested) {
        const layout = expandedLayouts.get(nested.subsystemId)
        if (!layout) continue
        const stateNode = nodes.find(x=>x.id === ch.id)
        const pos = ch.position || stateNode?.position
        if (!pos) continue
        const actualX = pos.x + layout.contentOffset.x
        const actualY = pos.y + layout.contentOffset.y
        nestedUpdateNodePos(layout.subsystemPath, nested.nodeId, actualX, actualY)
        continue
      }
      if (ch.id.endsWith('::container')) {
        const subsystemId = ch.id.split('::')[0]
        const subsystem = project.nodes.find(n=>n.id===subsystemId)
        const pos = ch.position || nodes.find(x=>x.id===ch.id)?.position
        if (subsystem && pos) {
          const baseX = typeof subsystem.x === 'number' ? subsystem.x : 0
          const baseY = typeof subsystem.y === 'number' ? subsystem.y : 0
          setSubsystemViewOffset(subsystemId, { x: pos.x - baseX, y: pos.y - baseY })
        }
        continue
      }
      const n = nodes.find(x=>x.id===ch.id)
      const pos = n?.position || ch.position
      if (pos) updatePos(ch.id, pos.x, pos.y)
    }
  }, [expandedLayouts, nestedUpdateNodePos, nodes, project.nodes, setSubsystemViewOffset, updatePos])

  const onConnect = useCallback((c: Connection)=>{
    const reaches = (start:string, goal:string)=>{
      const adj: Record<string,string[]> = {}
      project.edges.forEach(e=>{ (adj[e.from]=adj[e.from]||[]).push(e.to) })
      const stack=[start]; const seen=new Set<string>([start])
      while(stack.length){ const u=stack.pop()!; if (u===goal) return true; for (const v of (adj[u]||[])) if (!seen.has(v)){ seen.add(v); stack.push(v) } }
      return false
    }
    // Forbid connecting to or from any handle inside an embedded view on the main canvas
    const endpointIsEmbedded = (id?: string) => !!id && id.includes('::')
    if (endpointIsEmbedded(c.source) || endpointIsEmbedded(c.target)) {
      return
    }
    const resolvedConnection = (() => {
      if (!c.target) return c
      if (c.target.includes('::')) {
        const [subsystemId, innerId] = c.target.split('::')
        if (innerId === 'container') {
          return { ...c, target: subsystemId }
        }
        const layout = expandedLayouts.get(subsystemId)
        if (layout && layout.inputNodeMap.has(innerId)) {
          return { ...c, target: subsystemId, targetHandle: innerId }
        }
      }
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
    const baseMidpointX = (() => {
      if (!resolvedConnection.source) return undefined
      const info = groupMidpointInfo.get(edgeGroupKey({ from: resolvedConnection.source, fromHandle: resolvedConnection.sourceHandle ?? undefined }))
      if (info?.midpointX !== undefined) return info.midpointX
      const srcPos = resolveNodePosition(resolvedConnection.source)
      const tgtPos = resolveNodePosition(resolvedConnection.target)
      if (srcPos && tgtPos && Number.isFinite(srcPos.x) && Number.isFinite(tgtPos.x) && Math.abs(tgtPos.x - srcPos.x) > 1e-3) {
        return srcPos.x + (tgtPos.x - srcPos.x) * baseOffset
      }
      return undefined
    })()
    const parent = project.nodes.find(n=>n.id===resolvedConnection.source) as any
    let parentV: number | undefined
    if (parent?.type==='Source') parentV = parent?.Vout
    else if (parent?.type==='Converter') parentV = parent?.Vout
    else if (parent?.type==='DualOutputConverter') {
      const outputs = Array.isArray(parent?.outputs) ? parent.outputs : []
      const fallback = outputs.length > 0 ? outputs[0] : undefined
      const handleId = (resolvedConnection.sourceHandle as string | undefined)
      const branch = handleId ? outputs.find((b:any)=>b?.id===handleId) : undefined
      parentV = (branch || fallback)?.Vout
    }
    else if (parent?.type==='Bus') parentV = parent?.V_bus
    else if (parent?.type==='SubsystemInput') parentV = parent?.Vout
    const defaultColor = voltageToEdgeColor(parentV)
    const groupKeyForNewEdge = resolvedConnection.source
      ? edgeGroupKey({ from: resolvedConnection.source, fromHandle: resolvedConnection.sourceHandle ?? undefined })
      : undefined
    const edgeData = {
      midpointOffset: baseOffset,
      ...(baseMidpointX !== undefined ? { midpointX: baseMidpointX } : {}),
      onMidpointChange: handleMidpointChange,
      onMidpointCommit: handleMidpointCommit,
      screenToFlow: screenToFlowPosition,
      defaultColor,
      extendMidpointRange: true,
      groupKey: groupKeyForNewEdge,
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
      style: { strokeWidth: 3, stroke: defaultColor },
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
      addEdgeStore(payload)
    }
  }, [addEdgeStore, expandedLayouts, getGroupOffset, groupMidpointInfo, handleMidpointChange, handleMidpointCommit, project.edges, project.nodes, resolveNodePosition, screenToFlowPosition])

  const onNodesDelete: OnNodesDelete = useCallback((deleted)=>{
    if (openSubsystemIds && openSubsystemIds.length > 0) return
    for (const n of deleted){
      const nested = parseNestedNodeId(n.id)
      if (nested) {
        const layout = expandedLayouts.get(nested.subsystemId)
        if (layout) {
          nestedRemoveNode(layout.subsystemPath, nested.nodeId)
        }
        continue
      }
      if (n.id.endsWith('::container')) continue
      removeNode(n.id)
    }
  }, [expandedLayouts, nestedRemoveNode, openSubsystemIds, removeNode])

  const onEdgesDelete: OnEdgesDelete = useCallback((deleted)=>{
    if (openSubsystemIds && openSubsystemIds.length > 0) return
    for (const e of deleted){
      const nested = parseNestedEdgeId(e.id)
      if (nested) {
        const layout = expandedLayouts.get(nested.subsystemId)
        if (layout) {
          nestedRemoveEdge(layout.subsystemPath, nested.edgeId)
        }
        continue
      }
      removeEdge(e.id)
    }
  }, [expandedLayouts, nestedRemoveEdge, openSubsystemIds, removeEdge])

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

  const cloneNodeSnapshot = useCallback((node: AnyNode | null | undefined): AnyNode | null => {
    if (!node) return null
    return JSON.parse(JSON.stringify(node)) as AnyNode
  }, [])

  const resolveNodeSnapshotById = useCallback((nodeId: string): AnyNode | null => {
    const nested = parseNestedNodeId(nodeId)
    if (nested) {
      const layout = expandedLayouts.get(nested.subsystemId)
      const node = layout?.embeddedProject.nodes.find(n => n.id === nested.nodeId)
      return cloneNodeSnapshot(node as AnyNode | undefined)
    }
    if (nodeId.endsWith('::container')) return null
    const node = project.nodes.find(n => n.id === nodeId)
    return cloneNodeSnapshot(node)
  }, [cloneNodeSnapshot, expandedLayouts, project.nodes])

  const resolveEdgeSnapshotById = useCallback((edgeId: string): Edge | null => {
    const nested = parseNestedEdgeId(edgeId)
    if (nested) {
      const layout = expandedLayouts.get(nested.subsystemId)
      const edge = layout?.embeddedProject.edges.find(e => e.id === nested.edgeId)
      return edge ? (JSON.parse(JSON.stringify(edge)) as Edge) : null
    }
    const edge = project.edges.find(e => e.id === edgeId)
    return edge ? (JSON.parse(JSON.stringify(edge)) as Edge) : null
  }, [expandedLayouts, project.edges])

  const resolveMarkupSnapshotById = useCallback((markupId: string): CanvasMarkup | null => {
    const markup = markups.find(m => m.id === markupId)
    return markup ? (JSON.parse(JSON.stringify(markup)) as CanvasMarkup) : null
  }, [markups])

  const collectClipboardPayload = useCallback(
    (selection: MultiSelection): ClipboardPayload | null =>
      collectClipboardPayloadShared(
        selection,
        {
          resolveNodeSnapshot: (nodeId: string) => {
            if (nodeId.includes('::')) return null
            return resolveNodeSnapshotById(nodeId)
          },
          resolveEdgeSnapshot: (edgeId: string) => {
            if (edgeId.includes('::edge::')) return null
            return resolveEdgeSnapshotById(edgeId)
          },
          resolveMarkupSnapshot: resolveMarkupSnapshotById,
        }
      ),
    [resolveEdgeSnapshotById, resolveMarkupSnapshotById, resolveNodeSnapshotById]
  )

  type AlignableNode = {
    rfId: string
    nodeId: string
    subsystemPath: string[]
    width: number
    height: number
    absolute: { x: number; y: number }
    canonical: { x: number; y: number }
    centerX: number
    centerY: number
    left: number
    right: number
    top: number
    bottom: number
    owningSubsystemId?: string
    containerAbsolute?: { x: number; y: number }
    contentOffset?: { x: number; y: number }
  }

  type NodePositionMutation = {
    node: AlignableNode
    absolute: { x: number; y: number }
  }

  const collectAlignableNodes = useCallback(
    (ids: string[]): AlignableNode[] => {
      const result: AlignableNode[] = []
      for (const id of ids) {
        if (!id || id.endsWith('::container')) continue
        const rfNode = nodes.find(n => n.id === id)
        if (!rfNode) continue
        if ((rfNode as any).type === 'embeddedSubsystemContainer') continue
        if ((rfNode as any).draggable === false) continue

        const positionAbsolute = (rfNode as any).positionAbsolute ?? rfNode.position
        const absXRaw = (positionAbsolute as any)?.x
        const absYRaw = (positionAbsolute as any)?.y
        if (!Number.isFinite(absXRaw) || !Number.isFinite(absYRaw)) continue
        const absX = Number(absXRaw)
        const absY = Number(absYRaw)

        let width = typeof rfNode.width === 'number' && Number.isFinite(rfNode.width) ? rfNode.width : undefined
        let height = typeof rfNode.height === 'number' && Number.isFinite(rfNode.height) ? rfNode.height : undefined

        if (!Number.isFinite(width) || !Number.isFinite(height)) {
          const snapshot = resolveNodeSnapshotById(id)
          if (snapshot) {
            const estimated = estimateEmbeddedNodeSize(snapshot)
            if (!Number.isFinite(width)) width = estimated.width
            if (!Number.isFinite(height)) height = estimated.height
          }
        }

        const nested = parseNestedNodeId(id)
        let nodeId = id
        let subsystemPath: string[] = []
        let canonicalX = absX
        let canonicalY = absY
        let containerAbsolute: { x: number; y: number } | undefined
        let contentOffset: { x: number; y: number } | undefined
        let owningSubsystemId: string | undefined

        if (nested) {
          const layout = expandedLayouts.get(nested.subsystemId)
          if (!layout) continue
          const containerPos = nodePositions.get(layout.containerId) ?? layout.containerPosition
          if (!containerPos) continue
          containerAbsolute = { x: containerPos.x, y: containerPos.y }
          contentOffset = layout.contentOffset
          owningSubsystemId = nested.subsystemId
          subsystemPath = layout.subsystemPath
          nodeId = nested.nodeId
          canonicalX = absX - containerAbsolute.x + (contentOffset?.x ?? 0)
          canonicalY = absY - containerAbsolute.y + (contentOffset?.y ?? 0)
        }

        const widthValue = Number(width)
        const heightValue = Number(height)
        if (!Number.isFinite(widthValue) || !Number.isFinite(heightValue) || widthValue <= 0 || heightValue <= 0)
          continue

        const centerX = absX + widthValue / 2
        const centerY = absY + heightValue / 2

        result.push({
          rfId: id,
          nodeId,
          subsystemPath,
          width: widthValue,
          height: heightValue,
          absolute: { x: absX, y: absY },
          canonical: { x: canonicalX, y: canonicalY },
          centerX,
          centerY,
          left: absX,
          right: absX + widthValue,
          top: absY,
          bottom: absY + heightValue,
          owningSubsystemId,
          containerAbsolute,
          contentOffset,
        })
      }
      return result
    },
    [expandedLayouts, nodePositions, nodes, resolveNodeSnapshotById]
  )

  const commitNodePositionMutations = useCallback(
    (mutations: NodePositionMutation[]): boolean => {
      if (!mutations.length) return false
      const epsilon = 0.1
      const updates: { nodeId: string; patch: { x: number; y: number }; subsystemPath?: string[] }[] = []
      const nextPositions = new Map<string, { position: { x: number; y: number }; positionAbsolute: { x: number; y: number } }>()

      for (const { node, absolute } of mutations) {
        const { x: absXRaw, y: absYRaw } = absolute
        if (!Number.isFinite(absXRaw) || !Number.isFinite(absYRaw)) continue
        const absX = Number(absXRaw)
        const absY = Number(absYRaw)

        let canonicalX = absX
        let canonicalY = absY
        if (node.subsystemPath.length) {
          const container = node.containerAbsolute
          const offset = node.contentOffset ?? { x: 0, y: 0 }
          if (!container) continue
          canonicalX = absX - container.x + offset.x
          canonicalY = absY - container.y + offset.y
        }

        if (
          Math.abs(canonicalX - node.canonical.x) < epsilon &&
          Math.abs(canonicalY - node.canonical.y) < epsilon
        ) {
          continue
        }

        const entry: { nodeId: string; patch: { x: number; y: number }; subsystemPath?: string[] } = {
          nodeId: node.nodeId,
          patch: { x: canonicalX, y: canonicalY },
        }
        if (node.subsystemPath.length) {
          entry.subsystemPath = node.subsystemPath
        }
        updates.push(entry)

        const position = node.subsystemPath.length
          ? {
              x: canonicalX - (node.contentOffset?.x ?? 0),
              y: canonicalY - (node.contentOffset?.y ?? 0),
            }
          : { x: canonicalX, y: canonicalY }

        nextPositions.set(node.rfId, {
          position,
          positionAbsolute: { x: absX, y: absY },
        })
      }

      if (!updates.length) {
        return false
      }

      if (typeof bulkUpdateNodesStore === 'function') {
        bulkUpdateNodesStore(updates)
      }

      setNodes(prev =>
        prev.map(rfNode => {
          const next = nextPositions.get(rfNode.id)
          if (!next) return rfNode
          return {
            ...rfNode,
            position: next.position,
            positionAbsolute: next.positionAbsolute,
          }
        })
      )

      return true
    },
    [bulkUpdateNodesStore, setNodes]
  )

  type HorizontalAlignment = 'left' | 'center' | 'right'
  type VerticalAlignment = 'top' | 'middle' | 'bottom'

  const performHorizontalAlignment = useCallback(
    (mode: HorizontalAlignment) => {
      if (!contextMenu || contextMenu.type !== 'node') return
      const selectionIds = activeMultiSelection?.nodes ?? []
      const nodeIds = selectionIds.length >= 2 ? selectionIds : contextMenu.targetId ? [contextMenu.targetId] : []
      const alignables = collectAlignableNodes(nodeIds)
      if (alignables.length < 2) {
        setContextMenu(null)
        return
      }

      const reference = (() => {
        switch (mode) {
          case 'left':
            return Math.min(...alignables.map(n => n.left))
          case 'center':
            return alignables.reduce((sum, n) => sum + n.centerX, 0) / alignables.length
          case 'right':
            return Math.max(...alignables.map(n => n.right))
          default:
            return 0
        }
      })()

      const mutations: NodePositionMutation[] = alignables.map(node => {
        let targetCenterX = node.centerX
        switch (mode) {
          case 'left':
            targetCenterX = reference + node.width / 2
            break
          case 'center':
            targetCenterX = reference
            break
          case 'right':
            targetCenterX = reference - node.width / 2
            break
        }
        const newAbsX = targetCenterX - node.width / 2
        return {
          node,
          absolute: { x: newAbsX, y: node.absolute.y },
        }
      })

      commitNodePositionMutations(mutations)
      setContextMenu(null)
    },
    [activeMultiSelection, collectAlignableNodes, commitNodePositionMutations, contextMenu, setContextMenu]
  )

  const performVerticalAlignment = useCallback(
    (mode: VerticalAlignment) => {
      if (!contextMenu || contextMenu.type !== 'node') return
      const selectionIds = activeMultiSelection?.nodes ?? []
      const nodeIds = selectionIds.length >= 2 ? selectionIds : contextMenu.targetId ? [contextMenu.targetId] : []
      const alignables = collectAlignableNodes(nodeIds)
      if (alignables.length < 2) {
        setContextMenu(null)
        return
      }

      const reference = (() => {
        switch (mode) {
          case 'top':
            return Math.min(...alignables.map(n => n.top))
          case 'middle':
            return alignables.reduce((sum, n) => sum + n.centerY, 0) / alignables.length
          case 'bottom':
            return Math.max(...alignables.map(n => n.bottom))
          default:
            return 0
        }
      })()

      const mutations: NodePositionMutation[] = alignables.map(node => {
        let targetCenterY = node.centerY
        switch (mode) {
          case 'top':
            targetCenterY = reference + node.height / 2
            break
          case 'middle':
            targetCenterY = reference
            break
          case 'bottom':
            targetCenterY = reference - node.height / 2
            break
        }
        const newAbsY = targetCenterY - node.height / 2
        return {
          node,
          absolute: { x: node.absolute.x, y: newAbsY },
        }
      })

      commitNodePositionMutations(mutations)
      setContextMenu(null)
    },
    [activeMultiSelection, collectAlignableNodes, commitNodePositionMutations, contextMenu, setContextMenu]
  )

  const performDistribution = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      if (!contextMenu || contextMenu.type !== 'node') return
      const selectionIds = activeMultiSelection?.nodes ?? []
      const alignables = collectAlignableNodes(selectionIds)
      if (alignables.length < 3) {
        setContextMenu(null)
        return
      }

      const sorted = [...alignables].sort((a, b) =>
        axis === 'horizontal' ? a.centerX - b.centerX : a.centerY - b.centerY
      )
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      if (!first || !last) {
        setContextMenu(null)
        return
      }
      const span = axis === 'horizontal' ? last.centerX - first.centerX : last.centerY - first.centerY
      if (Math.abs(span) < 1e-6) {
        setContextMenu(null)
        return
      }
      const step = span / (sorted.length - 1)

      const mutations: NodePositionMutation[] = sorted.map((node, index) => {
        if (axis === 'horizontal') {
          const targetCenter = first.centerX + step * index
          return {
            node,
            absolute: {
              x: targetCenter - node.width / 2,
              y: node.absolute.y,
            },
          }
        }
        const targetCenter = first.centerY + step * index
        return {
          node,
          absolute: {
            x: node.absolute.x,
            y: targetCenter - node.height / 2,
          },
        }
      })

      commitNodePositionMutations(mutations)
      setContextMenu(null)
    },
    [activeMultiSelection, collectAlignableNodes, commitNodePositionMutations, contextMenu, setContextMenu]
  )

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
    const nested = parseNestedNodeId(contextMenu.targetId)
    if (nested) {
      const layout = expandedLayouts.get(nested.subsystemId)
      if (layout) {
        nestedRemoveNode(layout.subsystemPath, nested.nodeId)
      }
      setContextMenu(null)
      return
    }
    if (contextMenu.targetId.endsWith('::container')) {
      const subsystemId = contextMenu.targetId.split('::')[0]
      collapseSubsystemView(subsystemId)
      setContextMenu(null)
      return
    }
    removeNode(contextMenu.targetId)
    setContextMenu(null)
  }, [collapseSubsystemView, contextMenu, expandedLayouts, nestedRemoveNode, removeNode])

  const handleSaveQuickPreset = useCallback(() => {
    if (!contextMenu || contextMenu.type !== 'node' || !contextMenu.targetId) return
    const snapshot = resolveNodeSnapshotById(contextMenu.targetId)
    if (!snapshot) {
      quickPresetDialogs.openCaptureDialog({ kind: 'selection' })
      setContextMenu(null)
      return
    }
    quickPresetDialogs.openCaptureDialog({ kind: 'node', node: snapshot })
    setContextMenu(null)
  }, [contextMenu, quickPresetDialogs, resolveNodeSnapshotById, setContextMenu])

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
        generateMarkupId: () => genId('markup_'),
        addNode: addNodeStore,
        addEdge: addEdgeStore,
        addMarkup: addMarkupStore,
      })

      if (newNodeIds.length || newEdgeIds.length || newMarkupIds.length) {
        applyMultiSelection({ kind: 'multi', nodes: newNodeIds, edges: newEdgeIds, markups: newMarkupIds })
        return true
      }
      return false
    },
    [addEdgeStore, addMarkupStore, addNodeStore, applyMultiSelection, clipboard]
  )

  const handlePaste = useCallback(() => {
    if (!contextMenu || contextMenu.type !== 'pane') return
    const flowPos = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y })
    performPaste(flowPos)
    setContextMenu(null)
  }, [contextMenu, performPaste, screenToFlowPosition])

  const deleteSelection = useCallback((selection: MultiSelection) => {
    for (const nodeId of selection.nodes) {
      const nested = parseNestedNodeId(nodeId)
      if (nested) {
        const layout = expandedLayouts.get(nested.subsystemId)
        if (layout) {
          nestedRemoveNode(layout.subsystemPath, nested.nodeId)
        }
        continue
      }
      if (nodeId.endsWith('::container')) continue
      removeNode(nodeId)
    }
    for (const edgeId of selection.edges) {
      const nested = parseNestedEdgeId(edgeId)
      if (nested) {
        const layout = expandedLayouts.get(nested.subsystemId)
        if (layout) {
          nestedRemoveEdge(layout.subsystemPath, nested.edgeId)
        }
        continue
      }
      removeEdge(edgeId)
    }
    for (const markupId of selection.markups) {
      removeMarkupStore(markupId)
    }
    applyMultiSelection(null)
  }, [applyMultiSelection, expandedLayouts, nestedRemoveEdge, nestedRemoveNode, removeEdge, removeMarkupStore, removeNode])

  // Keyboard shortcuts for copy, paste, delete, and keyboard nudging
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (openSubsystemIds && openSubsystemIds.length > 0) return
      const activeElement = document.activeElement as HTMLElement | null
      const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)
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
        if (markupTool) {
          onMarkupToolChange(null)
          handleMarkupSelect(null)
          e.preventDefault()
          return
        }
        clearMultiSelection()
        onSelectionModeChange('single')
        onSelect(null)
        return
      }

      const currentSelection: MultiSelection | null = (() => {
        if (activeMultiSelection) return activeMultiSelection
        if (selectedNodeId) return { kind: 'multi', nodes: [selectedNodeId], edges: [], markups: [] }
        if (selectedEdgeId) return { kind: 'multi', nodes: [], edges: [selectedEdgeId], markups: [] }
        if (selectedMarkupId) return { kind: 'multi', nodes: [], edges: [], markups: [selectedMarkupId] }
        return null
      })()

      if (nudgeDelta) {
        const selectionNodes = new Set<string>()
        if (currentSelection?.nodes.length) {
          currentSelection.nodes.forEach(id => selectionNodes.add(id))
        }

        if (selectionNodes.size > 0) {
          const rootNodeMap = new Map<string, AnyNode>()
          for (const node of project.nodes as AnyNode[]) {
            rootNodeMap.set(node.id, node)
          }

          const pendingUpdates: { nodeId: string; patch: Partial<AnyNode>; subsystemPath?: string[] }[] = []
          const pendingContainerOffsets = new Map<string, { x: number; y: number }>()
          const localNodeUpdates = new Map<string, { x: number; y: number }>()
          let clamped = false
          let moved = false

          for (const nodeId of selectionNodes) {
            if (nodeId.endsWith('::container')) {
              const subsystemId = nodeId.split('::')[0]
              const layout = expandedLayouts.get(subsystemId)
              const subsystemNode = rootNodeMap.get(subsystemId)
              if (!layout || !subsystemNode) continue
              const currentPosition = layout.containerPosition
              const nextTarget = { x: currentPosition.x + nudgeDelta.dx, y: currentPosition.y + nudgeDelta.dy }
              const { point, clamped: wasClamped } = clampPointToBounds(nextTarget, DEFAULT_CANVAS_BOUNDS)
              if (point.x !== currentPosition.x || point.y !== currentPosition.y) {
                const baseX = typeof subsystemNode.x === 'number' ? subsystemNode.x : 0
                const baseY = typeof subsystemNode.y === 'number' ? subsystemNode.y : 0
                pendingContainerOffsets.set(subsystemId, { x: point.x - baseX, y: point.y - baseY })
                localNodeUpdates.set(nodeId, { x: point.x, y: point.y })
                moved = true
              }
              if (wasClamped) clamped = true
              continue
            }

            const nested = parseNestedNodeId(nodeId)
            if (nested) {
              const layout = expandedLayouts.get(nested.subsystemId)
              if (!layout) continue
              const embeddedNode = (layout.embeddedProject.nodes as AnyNode[]).find(n => n.id === nested.nodeId)
              if (!embeddedNode) continue
              const currentX = typeof embeddedNode.x === 'number' ? embeddedNode.x : 0
              const currentY = typeof embeddedNode.y === 'number' ? embeddedNode.y : 0
              const nextTarget = { x: currentX + nudgeDelta.dx, y: currentY + nudgeDelta.dy }
              const { point, clamped: wasClamped } = clampPointToBounds(nextTarget, DEFAULT_SUBSYSTEM_BOUNDS)
              if (point.x !== currentX || point.y !== currentY) {
                pendingUpdates.push({ nodeId: nested.nodeId, subsystemPath: layout.subsystemPath, patch: { x: point.x, y: point.y } })
                const localPosition = {
                  x: point.x - layout.contentOffset.x,
                  y: point.y - layout.contentOffset.y,
                }
                localNodeUpdates.set(nodeId, localPosition)
                moved = true
              }
              if (wasClamped) clamped = true
              continue
            }

            const rootNode = rootNodeMap.get(nodeId)
            if (!rootNode) continue
            const currentX = typeof rootNode.x === 'number' ? rootNode.x : 0
            const currentY = typeof rootNode.y === 'number' ? rootNode.y : 0
            const nextTarget = { x: currentX + nudgeDelta.dx, y: currentY + nudgeDelta.dy }
            const { point, clamped: wasClamped } = clampPointToBounds(nextTarget, DEFAULT_CANVAS_BOUNDS)
            if (point.x !== currentX || point.y !== currentY) {
              pendingUpdates.push({ nodeId, patch: { x: point.x, y: point.y } })
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
                const nextAbsolute = rn.positionAbsolute
                  ? { x: update.x, y: update.y }
                  : rn.positionAbsolute
                return {
                  ...rn,
                  position: nextPosition,
                  positionAbsolute: nextAbsolute ?? rn.positionAbsolute,
                }
              })
            )
          }

          if (pendingUpdates.length > 0) {
            bulkUpdateNodesStore(pendingUpdates)
          }

          if (pendingContainerOffsets.size > 0) {
            pendingContainerOffsets.forEach((offset, subsystemId) => {
              setSubsystemViewOffset(subsystemId, offset)
            })
          }

          if (moved || clamped) {
            e.preventDefault()
            handledArrow = true
          }
        }

        if (nudgeDelta.dx !== 0) {
          const selectionEdges = new Set<string>()
          if (currentSelection?.edges.length) {
            currentSelection.edges.forEach(id => selectionEdges.add(id))
          }
          if (selectionEdges.size === 0 && selectedEdgeId) {
            selectionEdges.add(selectedEdgeId)
          }

          if (selectionEdges.size > 0) {
            const rfEdgeUpdates = new Map<string, { midpointX?: number; midpointOffset?: number }>()
            const processedGroups = new Set<string>()
            let edgeMoved = false
            let edgeClamped = false

            const applyRfUpdates = () => {
              const setter = setEdgesRef.current
              if (!setter || rfEdgeUpdates.size === 0) return
              setter(prev =>
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

            const processRootGroup = (edge: Edge) => {
              if (!updateEdgeStore) return
              const rawGroupKey = edgeGroupKey({ from: edge.from, fromHandle: edge.fromHandle })
              const compositeKey = `root|${rawGroupKey}`
              if (processedGroups.has(compositeKey)) return
              processedGroups.add(compositeKey)

              const sourcePos = resolveNodePosition(edge.from)
              const targetPos = resolveNodePosition(edge.to)
              if (!sourcePos || !targetPos) return

              const startX = sourcePos.x
              const endX = targetPos.x
              const offsetValueRaw = Number.isFinite((edge as any).midpointOffset) ? Number((edge as any).midpointOffset) : 0.5
              const offsetValue = Math.min(1, Math.max(0, offsetValueRaw))
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
                updateEdgeStore(groupEdge.id, patch)
                rfEdgeUpdates.set(groupEdge.id, {
                  midpointOffset: result.midpointOffset,
                  midpointX: result.midpointX,
                })
              }

              if (result.clamped) edgeClamped = true
              if (movedThis || result.clamped) edgeMoved = true
            }

            const processNestedGroup = (layout: ExpandedSubsystemLayout, edge: Edge) => {
              const rawGroupKey = edgeGroupKey({ from: edge.from, fromHandle: edge.fromHandle })
              const compositeKey = `${layout.subsystemPath.join('>')}|${rawGroupKey}`
              if (processedGroups.has(compositeKey)) return
              processedGroups.add(compositeKey)

              const nodeMap = new Map<string, AnyNode>()
              for (const node of layout.embeddedProject.nodes as AnyNode[]) {
                nodeMap.set(node.id, node)
              }

              const sourceNode = nodeMap.get(edge.from)
              const targetNode = nodeMap.get(edge.to)
              if (!sourceNode || !targetNode) return
              const startX = Number((sourceNode as any).x)
              const endX = Number((targetNode as any).x)
              if (!Number.isFinite(startX) || !Number.isFinite(endX)) return

              const offsetValueRaw = Number.isFinite((edge as any).midpointOffset) ? Number((edge as any).midpointOffset) : 0.5
              const offsetValue = Math.min(1, Math.max(0, offsetValueRaw))
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

              const containerPos = nodePositions.get(layout.containerId) ?? layout.containerPosition
              const localMidpoint = result.midpointX - layout.contentOffset.x
              const canvasMidpoint = containerPos.x + localMidpoint
              const hasCanvasMidpoint = Number.isFinite(canvasMidpoint)

              for (const groupEdge of layout.embeddedProject.edges) {
                if (edgeGroupKey({ from: groupEdge.from, fromHandle: groupEdge.fromHandle }) !== rawGroupKey) continue
                nestedUpdateEdge(layout.subsystemPath, groupEdge.id, patch)
                const rfId = `${layout.subsystemId}::edge::${groupEdge.id}`
                const updatePayload: { midpointOffset?: number; midpointX?: number } = {
                  midpointOffset: result.midpointOffset,
                }
                if (hasCanvasMidpoint) {
                  updatePayload.midpointX = canvasMidpoint
                }
                rfEdgeUpdates.set(rfId, updatePayload)
              }

              if (result.clamped) edgeClamped = true
              if (movedThis || result.clamped) edgeMoved = true
            }

            for (const edgeId of selectionEdges) {
              const nested = parseNestedEdgeId(edgeId)
              if (nested) {
                const layout = expandedLayouts.get(nested.subsystemId)
                if (!layout) continue
                const projectEdge = (layout.embeddedProject.edges as Edge[]).find(e => e.id === nested.edgeId)
                if (!projectEdge) continue
                processNestedGroup(layout, projectEdge)
                continue
              }

              const projectEdge = project.edges.find(e => e.id === edgeId)
              if (!projectEdge) continue
              processRootGroup(projectEdge)
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
        const viewportPos = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
        if (performPaste(viewportPos)) {
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeMultiSelection, bulkUpdateNodesStore, clearMultiSelection, collectClipboardPayload, deleteSelection, expandedLayouts, handleMarkupSelect, markupTool, nestedUpdateEdge, nodePositions, onMarkupToolChange, onSelect, onSelectionModeChange, openSubsystemIds, performPaste, project.edges, project.nodes, reactFlowInstance, screenToFlowPosition, selectedEdgeId, selectedMarkupId, selectedNodeId, setClipboard, setNodes, setSubsystemViewOffset, updateEdgeStore])

  const selectionNodeIds = activeMultiSelection?.nodes ?? []
  const contextNodeInSelection =
    contextMenu?.type === 'node' && contextMenu.targetId ? selectionNodeIds.includes(contextMenu.targetId) : false
  const alignmentMenuEnabled = contextNodeInSelection && selectionNodeIds.length >= 2
  const distributionMenuEnabled = contextNodeInSelection && selectionNodeIds.length >= 3
  const menuButtonClass = (enabled: boolean) =>
    `block w-full text-left px-3 py-1 ${enabled ? 'hover:bg-slate-100' : 'text-slate-400 cursor-not-allowed'}`

  const canSaveQuickPresetFromContext = contextMenu?.type === 'node' && contextMenu.targetId ? !contextMenu.targetId.endsWith('::container') : false

  return (
    <div
      ref={wrapperRef}
      className="h-full relative"
      aria-label="canvas"
      onPointerDownCapture={handleWrapperPointerDownCapture}
      onClick={()=>setContextMenu(null)}
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
    >
      {/* Floating Banner */}
      <div data-export-exclude="true" className="absolute top-3 left-3 z-40 bg-white/90 border border-slate-300 rounded-lg shadow-md px-4 py-2 flex flex-col gap-2 min-w-[340px]">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600 font-medium">Scenario:</span>
          <div className="flex gap-1" role="tablist" aria-label="Scenario">
            {['Typical','Max','Idle'].map(s=>(
              <Button key={s} variant={project.currentScenario===s?'default':'outline'} size="sm" className="px-2 py-1 text-xs" aria-selected={project.currentScenario===s} onClick={()=>useStore.getState().setScenario(s as any)}>{s}</Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          {bannerPowerMetrics.map(({ key, label, formatted, tooltip }) => (
            <div key={key} title={tooltip}>
              {label}: <b className="tabular-nums">{formatted.value} {formatted.unit}</b>
            </div>
          ))}
          <div>Efficiency: <b>{(overallEta*100).toFixed(2)}%</b></div>
        </div>
      </div>
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
        defaultEdgeOptions={{ type: 'orthogonal', style: { strokeWidth: 3 } }}
        panOnDrag={!markupTool && selectionMode !== 'multi'}
        selectionOnDrag={!markupTool}
        nodesDraggable={!markupTool}
        zoomOnScroll={!markupTool}
        onNodeClick={(event, node) => handleNodeClickById(event, node.id)}
        onNodeDragStart={handleNodeDragStartEvent}
        onEdgeClick={(event, edge) => handleEdgeClickById(event, edge.id)}
        onNodesChange={handleNodesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={handlePaneClick}
        onNodeDoubleClick={(_,n)=>{
          const nodeId = n.id
          if (nodeId.endsWith('::container')) {
            const subsystemId = nodeId.split('::')[0]
            if (onOpenSubsystem) onOpenSubsystem(subsystemId)
            return
          }
          const t=(n as any).data?.type
          if (t==='Subsystem' && onOpenSubsystem) onOpenSubsystem(nodeId)
        }}
      >
        <MarkupLayer
          markups={markups}
          primarySelectedId={selectedMarkupId}
          multiSelectedIds={activeMultiSelection?.markups ?? []}
          activeTool={markupTool}
          onSelect={handleMarkupSelect}
          onCreateMarkup={handleMarkupCreate}
          onCommitUpdate={handleMarkupCommit}
          screenToFlow={screenToFlowPosition}
        />
        <div data-export-exclude="true"><MiniMap /></div>
        <div data-export-exclude="true"><Controls /></div>
        <div data-export-exclude="true"><Background gap={16} /></div>
      </ReactFlow>
      {marqueeRect && (
        <div
          data-export-exclude="true"
          className="pointer-events-none absolute z-40 border border-sky-400 bg-sky-300/20"
          style={{
            left: marqueeRect.left,
            top: marqueeRect.top,
            width: marqueeRect.width,
            height: marqueeRect.height,
          }}
        />
      )}
      {multiSelection && !marqueeRect && (
        <div
          data-export-exclude="true"
          className="absolute top-20 left-1/2 z-40 -translate-x-1/2"
        >
          <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white/95 px-4 py-2 text-sm text-slate-600 shadow-md">
            <span><span className="font-semibold text-slate-800">{multiSelection.nodes.length}</span> nodes</span>
            <span><span className="font-semibold text-slate-800">{multiSelection.edges.length}</span> edges</span>
            <span><span className="font-semibold text-slate-800">{multiSelection.markups.length}</span> markups</span>
            <span className="text-xs text-slate-400">Copy ⌘C / Delete ⌫ / Paste ⌘V</span>
          </div>
        </div>
      )}
      {contextMenu && (
        <div data-export-exclude="true" className="fixed z-50 bg-white border shadow-md rounded-md text-sm" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e=>e.stopPropagation()}>
          {contextMenu.type==='node' ? (
            <div className="py-1">
              {contextNodeInSelection && (
                <>
                  <div className="px-3 py-1 text-xs font-semibold uppercase text-slate-500">Align Horizontally</div>
                  <button
                    type="button"
                    className={menuButtonClass(alignmentMenuEnabled)}
                    disabled={!alignmentMenuEnabled}
                    onClick={alignmentMenuEnabled ? () => performHorizontalAlignment('left') : undefined}
                  >
                    Align Left
                  </button>
                  <button
                    type="button"
                    className={menuButtonClass(alignmentMenuEnabled)}
                    disabled={!alignmentMenuEnabled}
                    onClick={alignmentMenuEnabled ? () => performHorizontalAlignment('center') : undefined}
                  >
                    Align Center
                  </button>
                  <button
                    type="button"
                    className={menuButtonClass(alignmentMenuEnabled)}
                    disabled={!alignmentMenuEnabled}
                    onClick={alignmentMenuEnabled ? () => performHorizontalAlignment('right') : undefined}
                  >
                    Align Right
                  </button>
                  <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase text-slate-500">Align Vertically</div>
                  <button
                    type="button"
                    className={menuButtonClass(alignmentMenuEnabled)}
                    disabled={!alignmentMenuEnabled}
                    onClick={alignmentMenuEnabled ? () => performVerticalAlignment('top') : undefined}
                  >
                    Align Top
                  </button>
                  <button
                    type="button"
                    className={menuButtonClass(alignmentMenuEnabled)}
                    disabled={!alignmentMenuEnabled}
                    onClick={alignmentMenuEnabled ? () => performVerticalAlignment('middle') : undefined}
                  >
                    Align Middle
                  </button>
                  <button
                    type="button"
                    className={menuButtonClass(alignmentMenuEnabled)}
                    disabled={!alignmentMenuEnabled}
                    onClick={alignmentMenuEnabled ? () => performVerticalAlignment('bottom') : undefined}
                  >
                    Align Bottom
                  </button>
                  <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase text-slate-500">Distribute</div>
                  <button
                    type="button"
                    className={menuButtonClass(distributionMenuEnabled)}
                    disabled={!distributionMenuEnabled}
                    onClick={distributionMenuEnabled ? () => performDistribution('horizontal') : undefined}
                  >
                    Distribute Horizontally
                  </button>
                  <button
                    type="button"
                    className={menuButtonClass(distributionMenuEnabled)}
                    disabled={!distributionMenuEnabled}
                    onClick={distributionMenuEnabled ? () => performDistribution('vertical') : undefined}
                  >
                    Distribute Vertically
                  </button>
                  <div className="my-1 h-px bg-slate-200" />
                </>
              )}
              <button type="button" className="block w-full text-left px-3 py-1 hover:bg-slate-100" onClick={handleCopy}>Copy</button>
              <button
                type="button"
                className={`block w-full text-left px-3 py-1 ${canSaveQuickPresetFromContext ? 'hover:bg-slate-100' : 'text-slate-400 cursor-not-allowed'}`}
                onClick={canSaveQuickPresetFromContext ? handleSaveQuickPreset : undefined}
                disabled={!canSaveQuickPresetFromContext}
              >
                Save as quick preset…
              </button>
              <button type="button" className="block w-full text-left px-3 py-1 hover:bg-slate-100 text-red-600" onClick={handleDelete}>Delete</button>
            </div>
          ) : (
            <div className="py-1">
              <button
                type="button"
                className={`block w-full text-left px-3 py-1 ${clipboard ? 'hover:bg-slate-100' : 'text-slate-400 cursor-not-allowed'}`}
                onClick={clipboard ? handlePaste : undefined}
                disabled={!clipboard}
              >
                Paste
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default Canvas
