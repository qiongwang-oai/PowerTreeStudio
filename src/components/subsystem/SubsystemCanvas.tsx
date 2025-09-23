import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, Connection, Edge as RFEdge, Node as RFNode, useNodesState, useEdgesState, addEdge, applyNodeChanges, applyEdgeChanges, OnEdgesDelete, OnNodesDelete, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import { Project, AnyNode, Edge } from '../../models'
import { compute, etaFromModel } from '../../calc'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import { useStore } from '../../state/store'
import OrthogonalEdge from '../edges/OrthogonalEdge'
import { voltageToEdgeColor } from '../../utils/color'
import { edgeGroupKey, computeEdgeGroupInfo } from '../../utils/edgeGroups'
import { createNodePreset, NODE_PRESET_MIME, withPosition, deserializePresetDescriptor, dataTransferHasNodePreset } from '../../utils/nodePresets'

function CustomNode(props: NodeProps) {
  const { data, selected } = props
  const isSelected = !!selected
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
  const baseSubsystemHeight = 80
  const perPortHeight = 28
  const dynamicMinHeight = nodeType === 'Subsystem'
    ? baseSubsystemHeight + (subsystemPortCount * perPortHeight)
    : undefined
  const outputs = Array.isArray((data as any)?.outputs) ? (data as any).outputs : []
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
      {(nodeType==='Converter' || nodeType==='DualOutputConverter' || nodeType==='Load' || nodeType==='Bus') && (
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
                        {label}
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
  )
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

export default function SubsystemCanvas({ subsystemId, subsystemPath, project, onSelect, onOpenNested }:{ subsystemId:string, subsystemPath?: string[], project: Project, onSelect:(id:string|null)=>void, onOpenNested?:(id:string)=>void }){
  const addEdgeStore = useStore(s=>s.nestedSubsystemAddEdge)
  const updatePos = useStore(s=>s.nestedSubsystemUpdateNodePos)
  const removeNode = useStore(s=>s.nestedSubsystemRemoveNode)
  const removeEdge = useStore(s=>s.nestedSubsystemRemoveEdge)
  const updateEdgeNested = useStore(s=>s.nestedSubsystemUpdateEdge)
  const addNodeNested = useStore(s=>s.nestedSubsystemAddNode)
  const clipboardNode = useStore(s=>s.clipboardNode)
  const setClipboardNode = useStore(s=>s.setClipboardNode)
  const openSubsystemIds = useStore(s=>s.openSubsystemIds)
  const { screenToFlowPosition } = useReactFlow()

  const path = useMemo(()=> (subsystemPath && subsystemPath.length>0)? subsystemPath : [subsystemId], [subsystemPath, subsystemId])
  const groupMidpointInfo = useMemo(() => computeEdgeGroupInfo(project.edges), [project.edges])
  const liveMidpointDraft = useRef(new Map<string, { offset: number; absoluteAxisCoord?: number; axis: 'x' | 'y' }>())
  const setEdgesRef = useRef<React.Dispatch<React.SetStateAction<RFEdge[]>> | null>(null)
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

  const nodeTypes = useMemo(() => ({ custom: CustomNode }), [])
  const edgeTypes = useMemo(() => ({ orthogonal: OrthogonalEdge }), [])
  const computeResult = useMemo(()=> compute(project), [project])

  const rfNodesInit: RFNode[] = useMemo(()=>project.nodes.map(n=>{
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
                              <div style={{fontSize:'10px',color:'#64748b'}}>P_out: {Number.isFinite(metric.P_out) ? `${(metric.P_out || 0).toFixed(2)} W` : '—'} | I_out: {Number.isFinite(metric.I_out) ? `${(metric.I_out || 0).toFixed(3)} A` : '—'}</div>
                            </div>
                          )
                        })}
                      </div>
                      <span style={{display:'inline-block', alignSelf:'stretch', width:1, background:'#cbd5e1'}} />
                      <div className="text-left" style={{minWidth:90}}>
                        <div style={{fontSize:'11px',color:'#1e293b'}}>P_in: {Number.isFinite(pin) ? `${(pin || 0).toFixed(2)} W` : '—'}</div>
                        <div style={{fontSize:'11px',color:'#1e293b'}}>P_out: {Number.isFinite(pout) ? `${(pout || 0).toFixed(2)} W` : '—'}</div>
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
                    <div style={{fontSize:'11px',color:'#1e293b'}}>P_in: {(() => { const nodeResult = computeResult.nodes[n.id]; const pin = nodeResult?.P_in; return (pin !== undefined) ? pin.toFixed(2) : '—'; })()} W</div>
                  </div>
                </div>
               ) : n.type === 'Subsystem' ? (
                <div>
                  <div style={{fontSize:'11px',color:'#555'}}>Inputs: {((n as any).project?.nodes?.filter((x:any)=>x.type==='SubsystemInput')?.map((x:any)=>`${x.Vout}V`).join(', ') || '—')}</div>
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
      ,...(n.type==='DualOutputConverter'? { outputs: (n as any).outputs || [], outputMetrics: ((computeResult.nodes[n.id] as any)||{}).__outputs || {} } : {})
    },
    position: { x: n.x ?? (Math.random()*400)|0, y: n.y ?? (Math.random()*300)|0 },
    type: 'custom',
    draggable: true,
    selected: false,
  }
  }), [project.nodes])

  const [nodes, setNodes, ] = useNodesState(rfNodesInit)

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
                          <div style={{fontSize:'11px',color:'#1e293b'}}>P_in: {(() => { const nodeResult = computeResult.nodes[n.id]; const pin = nodeResult?.P_in; return (pin !== undefined) ? pin.toFixed(2) : '—'; })()} W</div>
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
                          <div style={{fontSize:'10px',color:'#64748b'}}>P_out: {Number.isFinite(metric.P_out) ? `${(metric.P_out || 0).toFixed(2)} W` : '—'} | I_out: {Number.isFinite(metric.I_out) ? `${(metric.I_out || 0).toFixed(3)} A` : '—'}</div>
                        </div>
                      )
                    })}
                  </div>
                  <span style={{display:'inline-block', alignSelf:'stretch', width:1, background:'#cbd5e1'}} />
                  <div className="text-left" style={{minWidth:90}}>
                    <div style={{fontSize:'11px',color:'#1e293b'}}>P_in: {Number.isFinite(pin) ? `${(pin || 0).toFixed(2)} W` : '—'}</div>
                    <div style={{fontSize:'11px',color:'#1e293b'}}>P_out: {Number.isFinite(pout) ? `${(pout || 0).toFixed(2)} W` : '—'}</div>
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
                <div style={{fontSize:'11px',color:'#1e293b'}}>P_in: {(() => { const nodeResult = computeResult.nodes[n.id]; const pin = nodeResult?.P_in; return (pin !== undefined) ? pin.toFixed(2) : '—'; })()} W</div>
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
                  <div style={{ fontSize: '10px', color: '#1e293b' }}>P_in(single): {pinSingle.toFixed(2)} W</div>
                )}
                {pinTotal !== undefined && (
                  <div style={{ fontSize: '10px', color: '#1e293b' }}>P_in(total): {pinTotal.toFixed(2)} W</div>
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
                <div style={{ fontSize: '10px', color: '#1e293b' }}>P_in: {pin!.toFixed(2)} W</div>
              )}
              {showPout && (
                <div style={{ fontSize: '10px', color: '#1e293b' }}>P_out: {pout!.toFixed(2)} W</div>
              )}
            </div>
          </>
        ) : null
      }
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
          ...(n.type==='Subsystem'? { inputPorts: ((n as any).project?.nodes||[]).filter((x:any)=>x.type==='SubsystemInput').map((x:any)=>({ id:x.id, Vout:x.Vout, name: x.name })) } : {}),
          ...(n.type==='DualOutputConverter'? { outputs: (n as any).outputs || [], outputMetrics: ((computeResult.nodes[n.id] as any)||{}).__outputs || {} } : {})
        }
      }
    }))
  }, [computeResult, project.nodes, setNodes])

  useEffect(() => {
    setNodes(prev => prev.map(rn => {
      const shouldSelect = selectedNodeId === rn.id
      if (rn.selected === shouldSelect) return rn
      return { ...rn, selected: shouldSelect }
    }))
  }, [selectedNodeId, setNodes])

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
      const shouldSelect = selectedEdgeId === edge.id
      if (edge.selected === shouldSelect) return edge
      return { ...edge, selected: shouldSelect }
    }))
  }, [selectedEdgeId, setEdges])

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
    const edgeId = `${resolvedConnection.source}-${resolvedConnection.target}`
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
    removeNode(path, contextMenu.targetId)
    setContextMenu(null)
  }, [contextMenu, removeNode, path])

  const handlePaste = useCallback(()=>{
    if (!contextMenu || contextMenu.type !== 'pane' || !clipboardNode) return
    const flowPos = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y })
    const newId = (Math.random().toString(36).slice(2,10))
    const newNode = { ...clipboardNode, id: newId, name: `${clipboardNode.name} Copy`, x: flowPos.x, y: flowPos.y }
    addNodeNested(path, newNode as any)
    setContextMenu(null)
  }, [contextMenu, clipboardNode, screenToFlowPosition, addNodeNested, path])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopmostEditor) return
      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable);
      if (isInput) return;
      if (selectedNodeId) {
        if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey)) {
          // Copy
          const node = project.nodes.find(n => n.id === selectedNodeId);
          if (node) {
            const copied = JSON.parse(JSON.stringify(node));
            setClipboardNode(copied);
          }
          e.preventDefault();
        } else if ((e.key === 'Delete' || e.key === 'Backspace')) {
          // Delete
          removeNode(path, selectedNodeId);
          setSelectedNodeId(null);
          onSelect(null);
          e.preventDefault();
        }
      }
      // Edge deletion via keyboard when an edge is selected and no node is selected
      if (!selectedNodeId && selectedEdgeId && (e.key === 'Delete' || e.key === 'Backspace')){
        removeEdge(path, selectedEdgeId)
        setSelectedEdgeId(null)
        onSelect(null)
        e.preventDefault()
      }
      if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey)) {
        // Paste
        if (clipboardNode) {
          // Paste at center of viewport
          const flowPos = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
          const newId = (Math.random().toString(36).slice(2,10));
          const newNode = { ...clipboardNode, id: newId, name: `${clipboardNode.name} Copy`, x: flowPos.x, y: flowPos.y };
          addNodeNested(path, newNode as any);
        }
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedEdgeId, clipboardNode, project.nodes, removeNode, removeEdge, setClipboardNode, screenToFlowPosition, addNodeNested, path, onSelect, isTopmostEditor]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!dataTransferHasNodePreset(e.dataTransfer)) return
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!isTopmostEditor) return
    if (!dataTransferHasNodePreset(e.dataTransfer)) return
    const raw = e.dataTransfer?.getData(NODE_PRESET_MIME) ?? null
    const descriptor = deserializePresetDescriptor(raw)
    if (!descriptor || descriptor.type === 'Source') return
    e.preventDefault()
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    if (!flowPos || typeof flowPos.x !== 'number' || typeof flowPos.y !== 'number') return
    setContextMenu(null)
    const baseNode = createNodePreset(descriptor)
    const placed = withPosition(baseNode, { x: flowPos.x, y: flowPos.y })
    addNodeNested(path, placed)
  }, [addNodeNested, isTopmostEditor, path, screenToFlowPosition, setContextMenu])

  return (
    <div className="h-full" aria-label="subsystem-canvas" onClick={()=>setContextMenu(null)} onDragOver={handleDragOver} onDrop={handleDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        defaultEdgeOptions={{ type: 'orthogonal', style: { strokeWidth: 2 } }}
        onNodeClick={(_,n)=>{onSelect(n.id); setSelectedNodeId(n.id); setSelectedEdgeId(null)}}
        onEdgeClick={(_,e)=>{ onSelect(e.id); setSelectedEdgeId(e.id); setSelectedNodeId(null) }}
        onNodesChange={handleNodesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeDoubleClick={(_,n)=>{ const t=(n as any).data?.type; if (t==='Subsystem' && onOpenNested) onOpenNested(n.id) }}
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
