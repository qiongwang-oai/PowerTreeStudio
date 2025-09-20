import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, Connection, Edge as RFEdge, Node as RFNode, useNodesState, useEdgesState, addEdge, applyNodeChanges, applyEdgeChanges, OnEdgesChange, OnNodesDelete, OnEdgesDelete, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import { useStore } from '../state/store'
import { compute, etaFromModel, computeDeepAggregates } from '../calc'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import { Button } from './ui/button'
import { validate } from '../rules'
import type { AnyNode, Edge, Project, Scenario } from '../models'
import OrthogonalEdge from './edges/OrthogonalEdge'
import { voltageToEdgeColor } from '../utils/color'
import { edgeGroupKey, computeEdgeGroupInfo } from '../utils/edgeGroups'

const SUBSYSTEM_BASE_HEIGHT = 80
const SUBSYSTEM_PORT_HEIGHT = 28
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

function CustomNode(props: NodeProps) {
  const { data, selected } = props;
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
    ? SUBSYSTEM_BASE_HEIGHT + (subsystemPortCount * SUBSYSTEM_PORT_HEIGHT)
    : undefined
  return (
    <div
      className={`rounded-lg border ${borderClass} ${bgClass} px-2 py-1 text-xs text-center min-w-[140px] relative`}
      style={{
        boxShadow: combinedShadow,
        minHeight: dynamicMinHeight,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
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
      {(nodeType==='Converter' || nodeType==='Load' || nodeType==='Bus') && (
        <>
          <Handle type="target" position={Position.Left} id="input" style={{ background: '#555' }} />
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
            {nodeType==='Load' ? `${Number(((data as any).Vreq ?? 0))} V` : 'input'}
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
              top: 'calc(50% + 8px)',
              transform: 'translate(-100%, 0)',
              fontSize: '10px',
              color: '#666',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              textAlign: 'right',
            }}
          >
            {(() => {
              const raw = Number((data as any)?.Vout)
              return Number.isFinite(raw) ? `${raw} V` : 'input'
            })()}
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
                  top: 'calc(50% + 8px)',
                  transform: 'translate(-100%, 0)',
                  fontSize: '10px',
                  color: '#666',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  textAlign: 'right',
                }}
              >
                input
              </div>
            </>
          )
          return (
            <>
              {ports.map((p:any, idx:number) => {
                const pct = ((idx+1)/(count+1))*100
                const label = `${Number(p.Vout ?? 0)} V`
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
                        top: `calc(${pct}% + 8px)`,
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
      {(nodeType === 'Source' || nodeType === 'Converter' || nodeType === 'SubsystemInput' || nodeType === 'Bus') && (
        <>
          <Handle type="source" position={Position.Right} id="output" style={{ background: '#555' }} />
          <div
            style={{
              position: 'absolute',
              right: -8,
              top: 'calc(50% + 8px)',
              transform: 'translate(100%, 0)',
              fontSize: '10px',
              color: '#666',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              textAlign: 'left',
            }}
          >
            output
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

function buildNodeDisplayData(node: AnyNode, computeNodes: Record<string, any> | undefined) {
  const parallelCount = parallelCountForNode(node as any)
  const nodeResult = computeNodes?.[node.id]
  const pinValue = nodeResult?.P_in
  const poutValue = nodeResult?.P_out
  const pinSingleValue = (nodeResult as any)?.P_in_single ?? (node as any)?.P_in_single
  const formatPowerValue = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `${value.toFixed(2)} W`
    }
    return '—'
  }
  type PowerEntry = { label: string; value: string }
  const renderPowerBlock = (entries: PowerEntry[]) => (
    <div className="text-left" style={{ minWidth: 110 }}>
      {entries.map(entry => (
        <div key={entry.label} style={{ fontSize: '11px', color: '#1e293b' }}>
          {entry.label}: {entry.value}
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
      <div className="text-center font-semibold">{node.name}</div>
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
                { label: 'P_in', value: formatPowerValue(pinValue) },
                { label: 'P_out', value: formatPowerValue(poutValue) },
              ]
            )
          ) : node.type === 'Load' && 'Vreq' in node && 'I_typ' in node && 'I_max' in node ? (
            withPower(
              <div>
                <div style={{fontSize:'11px',color:'#555'}}>I_typ: {(node as any).I_typ}A</div>
                <div style={{fontSize:'11px',color:'#555'}}>I_max: {(node as any).I_max}A</div>
                <div style={{fontSize:'11px',color:'#555'}}>Paralleled: {((node as any).numParalleledDevices ?? 1)}</div>
              </div>,
              [
                { label: 'P_in', value: formatPowerValue(pinValue) },
              ]
            )
          ) : node.type === 'Subsystem' ? (
            withPower(
              <div>
                <div style={{fontSize:'11px',color:'#555'}}>Inputs: {((node as any).project?.nodes||[]).filter((x:any)=>x.type==='SubsystemInput')?.map((x:any)=>`${x.Vout}V`).join(', ') || '—'}</div>
                <div style={{fontSize:'11px',color:'#555'}}>Paralleled: {((node as any).numParalleledSystems ?? 1)}</div>
              </div>,
              [
                { label: 'P_in total', value: formatPowerValue(pinValue) },
                { label: 'P_in single', value: formatPowerValue(pinSingleValue) },
              ]
            )
          ) : node.type === 'SubsystemInput' ? (
            withPower(
              <div>
                <div style={{fontSize:'11px',color:'#555'}}>Subsystem Input</div>
                <div style={{fontSize:'11px',color:'#555'}}>Vout: {(node as any).Vout ?? 0}V</div>
              </div>,
              [
                { label: 'P_in', value: formatPowerValue(pinValue) },
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
  if (node.type === 'Load') data.Vreq = (node as any).Vreq
  if (node.type === 'Subsystem') {
    data.inputPorts = ((node as any).project?.nodes||[])
      .filter((x:any)=>x.type==='SubsystemInput')
      .map((x:any)=>({ id:x.id, Vout:x.Vout, name: x.name }))
  }
  if (node.type === 'SubsystemInput') data.Vout = (node as any).Vout
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
      <Handle type="source" position={Position.Right} id="output" style={{ background: color }} />
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
  containerId: string
  containerPosition: { x: number; y: number }
  width: number
  height: number
  embeddedProject: Project
  childNodes: { node: AnyNode; rfId: string; position: { x: number; y: number } }[]
  inputNodeMap: Map<string, string>
  analysis: ReturnType<typeof compute>
  edgeMeta: Map<string, { offset?: number; localMidpoint?: number }>
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
      const estimatedHeight = SUBSYSTEM_BASE_HEIGHT + (ports.length * SUBSYSTEM_PORT_HEIGHT)
      return {
        width: hasWidth ? rawWidth : 240,
        height: hasHeight ? rawHeight : Math.max(estimatedHeight, DEFAULT_EMBEDDED_NODE_HEIGHT),
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
      containerId,
      containerPosition,
      width,
      height,
      embeddedProject,
      childNodes,
      inputNodeMap,
      analysis,
      edgeMeta,
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

export default function Canvas({onSelect, onOpenSubsystem}:{onSelect:(id:string|null)=>void, onOpenSubsystem?:(id:string)=>void}){
  const project = useStore(s=>s.project)
  const addEdgeStore = useStore(s=>s.addEdge)
  const updatePos = useStore(s=>s.updateNodePos)
  const removeNode = useStore(s=>s.removeNode)
  const removeEdge = useStore(s=>s.removeEdge)
  const updateEdgeStore = useStore(s=>s.updateEdge)
  const clipboardNode = useStore(s=>s.clipboardNode)
  const setClipboardNode = useStore(s=>s.setClipboardNode)
  const { screenToFlowPosition } = useReactFlow()
  const [openSubsystemIds, setOpenSubsystemIds] = useStore(s => [s.openSubsystemIds, s.setOpenSubsystemIds]);
  const expandedSubsystemViews = useStore(s=>s.expandedSubsystemViews)
  const setSubsystemViewOffset = useStore(s=>s.setSubsystemViewOffset)
  const collapseSubsystemView = useStore(s=>s.collapseSubsystemView)

  const groupMidpointInfo = useMemo(() => computeEdgeGroupInfo(project.edges), [project.edges])
  const liveMidpointDraft = useRef(new Map<string, { offset: number; absoluteAxisCoord?: number; axis: 'x' | 'y' }>())
  const setEdgesRef = useRef<React.Dispatch<React.SetStateAction<RFEdge[]>> | null>(null)

  useEffect(() => {
    liveMidpointDraft.current.clear()
  }, [project.edges])
  const expandedLayouts = useMemo(() => buildExpandedSubsystemLayouts(project, expandedSubsystemViews), [project, expandedSubsystemViews])

  const [contextMenu, setContextMenu] = useState<{ type: 'node'|'pane'; x:number; y:number; targetId?: string }|null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string|null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string|null>(null)

  const nodeTypes = useMemo(() => ({ custom: CustomNode, embeddedSubsystemContainer: EmbeddedSubsystemContainerNode }), [])
  const edgeTypes = useMemo(() => ({ orthogonal: OrthogonalEdge }), [])

  const computeResult = useMemo(()=> compute(project), [project])

  const deepWarningCount = useMemo(()=>{
    const countWarningsDeep = (p: Project, scenario: Scenario): number => {
      // Clone to avoid mutating store; force scenario alignment
      const cloned: Project = JSON.parse(JSON.stringify(p))
      cloned.currentScenario = scenario
      const r = compute(cloned)
      let total = validate(cloned).length + r.globalWarnings.length
      total += Object.values(r.nodes).reduce((acc, n:any) => acc + ((n.warnings||[]).length), 0)
      for (const n of cloned.nodes as any[]) {
        if (n.type === 'Subsystem' && n.project) {
          total += countWarningsDeep(n.project as Project, scenario)
        }
      }
      return total
    }
    return countWarningsDeep(project, project.currentScenario)
  }, [project])

  // Detailed metrics for banner
  const { criticalLoadPower, nonCriticalLoadPower, edgeLoss, converterLoss, overallEta } = useMemo(()=>{
    const deep = computeDeepAggregates(project)
    const sourceInput = computeResult.totals.sourceInput || 0
    const eta = sourceInput > 0 ? (deep.criticalLoadPower / sourceInput) : 0
    return { criticalLoadPower: deep.criticalLoadPower, nonCriticalLoadPower: deep.nonCriticalLoadPower, edgeLoss: deep.edgeLoss, converterLoss: deep.converterLoss, overallEta: eta }
  }, [project, computeResult])

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
          const childData = buildNodeDisplayData(child.node, layout.analysis.nodes)
          nodes.push({
            id: child.rfId,
            type: 'custom',
            position: child.position,
            data: {
              ...childData,
              owningSubsystemId: node.id,
              originalNodeId: child.node.id,
            },
            parentNode: layout.containerId,
            extent: 'parent',
            draggable: false,
            selectable: false,
          })
        }
      } else {
        const data = buildNodeDisplayData(node, computeResult.nodes)
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
  }, [project.nodes, computeResult.nodes, expandedLayouts])

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
      const resistanceLabel = (e.interconnect?.R_milliohm ?? 0).toFixed(1)
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
        const strokeWidth = Math.max(1.5, 1.5 + 2 * Math.log10(I + 1e-3))
        const parent = layout.embeddedProject.nodes.find(n=>n.id===e.from) as any
        const parentV = parent?.type==='Source'? parent?.Vout
          : parent?.type==='Converter'? parent?.Vout
          : parent?.type==='Bus'? parent?.V_bus
          : parent?.type==='SubsystemInput'? parent?.Vout
          : undefined
        const baseLabel = `${(e.interconnect?.R_milliohm ?? 0).toFixed(1)} mΩ | ${I.toFixed(1)} A`
        const edgeColor = voltageToEdgeColor(parentV)
        const meta = layout.edgeMeta.get(e.id) || {}
        const midpointOffset = meta.offset ?? (typeof e.midpointOffset === 'number' ? e.midpointOffset : 0.5)
        const midpointX = typeof meta.localMidpoint === 'number'
          ? containerPos.x + meta.localMidpoint
          : undefined
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
          },
          selectable: false,
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
      const shouldSelect = selectedNodeId === rn.id
      if (rn.selected === shouldSelect) return rn
      return { ...rn, selected: shouldSelect }
    }))
  }, [selectedNodeId, rfNodesInit, setNodes])

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
      const shouldSelect = selectedEdgeId === edge.id
      if (edge.selected === shouldSelect) return edge
      return { ...edge, selected: shouldSelect }
    }))
  }, [selectedEdgeId, rfEdgesInit, setEdges])

  const handleNodesChange = useCallback((changes:any)=>{
    setNodes(nds=>applyNodeChanges(changes, nds))
    for (const ch of changes){
      if (ch.type === 'position' && ch.dragging === false){
        if (ch.id.includes('::')) {
          if (ch.id.endsWith('::container')) {
            const subsystemId = ch.id.split('::')[0]
            const subsystem = project.nodes.find(n=>n.id===subsystemId)
            const pos = ch.position || nodes.find(x=>x.id===ch.id)?.position
            if (subsystem && pos) {
              const baseX = typeof subsystem.x === 'number' ? subsystem.x : 0
              const baseY = typeof subsystem.y === 'number' ? subsystem.y : 0
              setSubsystemViewOffset(subsystemId, { x: pos.x - baseX, y: pos.y - baseY })
            }
          }
          continue
        }
        const n = nodes.find(x=>x.id===ch.id)
        const pos = n?.position || ch.position
        if (pos) updatePos(ch.id, pos.x, pos.y)
      }
    }
  }, [nodes, project.nodes, setSubsystemViewOffset, updatePos])

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
    const edgeId = `${resolvedConnection.source}-${resolvedConnection.target}`
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
    const parentV = parent?.type==='Source'? parent?.Vout
      : parent?.type==='Converter'? parent?.Vout
      : parent?.type==='Bus'? parent?.V_bus
      : parent?.type==='SubsystemInput'? parent?.Vout
      : undefined
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
      addEdgeStore(payload)
    }
  }, [addEdgeStore, expandedLayouts, getGroupOffset, groupMidpointInfo, handleMidpointChange, handleMidpointCommit, project.edges, project.nodes, resolveNodePosition, screenToFlowPosition])

  const onNodesDelete: OnNodesDelete = useCallback((deleted)=>{
    if (openSubsystemIds && openSubsystemIds.length > 0) return
    for (const n of deleted){ removeNode(n.id) }
  }, [openSubsystemIds, removeNode])

  const onEdgesDelete: OnEdgesDelete = useCallback((deleted)=>{
    if (openSubsystemIds && openSubsystemIds.length > 0) return
    for (const e of deleted){ removeEdge(e.id) }
  }, [openSubsystemIds, removeEdge])

  const onNodeContextMenu = useCallback((e: React.MouseEvent, n: RFNode)=>{
    e.preventDefault()
    setContextMenu({ type: 'node', x: e.clientX, y: e.clientY, targetId: n.id })
  }, [])

  const onPaneContextMenu = useCallback((e: React.MouseEvent)=>{
    e.preventDefault()
    setContextMenu({ type: 'pane', x: e.clientX, y: e.clientY })
  }, [])

  const handleCopy = useCallback(()=>{
    if (!contextMenu || contextMenu.type !== 'node' || !contextMenu.targetId) return
    const node = project.nodes.find(n=>n.id===contextMenu.targetId)
    if (!node) return
    const copied = JSON.parse(JSON.stringify(node)) as any
    setClipboardNode(copied)
    setContextMenu(null)
  }, [contextMenu, project.nodes, setClipboardNode])

  const handleDelete = useCallback(()=>{
    if (!contextMenu || contextMenu.type !== 'node' || !contextMenu.targetId) return
    removeNode(contextMenu.targetId)
    setContextMenu(null)
  }, [contextMenu, removeNode])

  const handlePaste = useCallback(()=>{
    if (!contextMenu || contextMenu.type !== 'pane' || !clipboardNode) return
    const flowPos = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y })
    const newId = (Math.random().toString(36).slice(2,10))
    const newNode = { ...clipboardNode, id: newId, name: `${clipboardNode.name} Copy`, x: flowPos.x, y: flowPos.y }
    useStore.getState().addNode(newNode as any)
    setContextMenu(null)
  }, [contextMenu, clipboardNode, screenToFlowPosition])

  // Keyboard shortcuts for copy, paste, delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts if any subsystem editor is open
      if (openSubsystemIds && openSubsystemIds.length > 0) return;
      const active = document.activeElement
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)
      if (isInput) return
      if (selectedNodeId) {
        if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey)) {
          // Copy
          const node = project.nodes.find(n => n.id === selectedNodeId)
          if (node) {
            const copied = JSON.parse(JSON.stringify(node))
            setClipboardNode(copied)
          }
          e.preventDefault()
        } else if ((e.key === 'Delete' || e.key === 'Backspace')) {
          // Delete
          removeNode(selectedNodeId)
          setSelectedNodeId(null)
          e.preventDefault()
        }
      }
      // Edge deletion via keyboard when an edge is selected and no node is selected
      if (!selectedNodeId && selectedEdgeId && (e.key === 'Delete' || e.key === 'Backspace')){
        removeEdge(selectedEdgeId)
        setSelectedEdgeId(null)
        onSelect && onSelect(null)
        e.preventDefault()
      }
      if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey)) {
        // Paste
        if (clipboardNode) {
          // Paste at center of viewport
          const flowPos = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
          const newId = (Math.random().toString(36).slice(2,10))
          const newNode = { ...clipboardNode, id: newId, name: `${clipboardNode.name} Copy`, x: flowPos.x, y: flowPos.y }
          useStore.getState().addNode(newNode as any)
        }
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, selectedEdgeId, clipboardNode, project.nodes, removeNode, removeEdge, setClipboardNode, screenToFlowPosition, openSubsystemIds, onSelect])

  return (
    <div className="h-full relative" aria-label="canvas" onClick={()=>setContextMenu(null)}>
      {/* Floating Banner */}
      <div className="absolute top-3 left-3 z-40 bg-white/90 border border-slate-300 rounded-lg shadow-md px-4 py-2 flex flex-col gap-2 min-w-[340px]">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600 font-medium">Scenario:</span>
          <div className="flex gap-1" role="tablist" aria-label="Scenario">
            {['Typical','Max','Idle'].map(s=>(
              <Button key={s} variant={project.currentScenario===s?'default':'outline'} size="sm" className="px-2 py-1 text-xs" aria-selected={project.currentScenario===s} onClick={()=>useStore.getState().setScenario(s as any)}>{s}</Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div>Critical: <b>{criticalLoadPower.toFixed(2)} W</b></div>
          <div>Non-critical: <b>{nonCriticalLoadPower.toFixed(2)} W</b></div>
          <div>Copper loss: <b>{edgeLoss.toFixed(2)} W</b></div>
          <div>Converter loss: <b>{converterLoss.toFixed(2)} W</b></div>
          <div>Efficiency: <b>{(overallEta*100).toFixed(2)}%</b></div>
          <div>Warnings: <b>{deepWarningCount}</b></div>
        </div>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        defaultEdgeOptions={{ type: 'orthogonal', style: { strokeWidth: 2 } }}
        onNodeClick={(_,n)=>{
          const nodeId = n.id
          const isContainer = nodeId.endsWith('::container')
          const inspectorId = isContainer ? nodeId.split('::')[0] : nodeId
          onSelect(inspectorId)
          setSelectedNodeId(nodeId)
          setSelectedEdgeId(null)
        }}
        onNodeDragStart={(_,n)=>{
          const nodeId = n.id
          const isContainer = nodeId.endsWith('::container')
          const inspectorId = isContainer ? nodeId.split('::')[0] : nodeId
          onSelect(inspectorId)
          setSelectedNodeId(nodeId)
          setSelectedEdgeId(null)
        }}
        onEdgeClick={(_,e)=>{ onSelect(e.id); setSelectedEdgeId(e.id); setSelectedNodeId(null) }}
        onNodesChange={handleNodesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
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
        <MiniMap /><Controls /><Background gap={16} />
      </ReactFlow>
      {contextMenu && (
        <div className="fixed z-50 bg-white border shadow-md rounded-md text-sm" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e=>e.stopPropagation()}>
          {contextMenu.type==='node' ? (
            <div className="py-1">
              <button className="block w-full text-left px-3 py-1 hover:bg-slate-100" onClick={handleCopy}>Copy</button>
              <button className="block w-full text-left px-3 py-1 hover:bg-slate-100 text-red-600" onClick={handleDelete}>Delete</button>
            </div>
          ) : (
            <div className="py-1">
              <button className={`block w-full text-left px-3 py-1 ${clipboardNode? 'hover:bg-slate-100' : 'text-slate-400 cursor-not-allowed'}`} onClick={clipboardNode? handlePaste : undefined}>Paste</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
