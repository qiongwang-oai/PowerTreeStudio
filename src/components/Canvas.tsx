import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, Connection, Edge as RFEdge, Node as RFNode, useNodesState, useEdgesState, addEdge, applyNodeChanges, applyEdgeChanges, OnEdgesChange, OnNodesDelete, OnEdgesDelete, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import { useStore } from '../state/store'
import { compute, etaFromModel, computeDeepAggregates } from '../calc'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import { Button } from './ui/button'
import { validate } from '../rules'
import type { Project, Scenario } from '../models'
import OrthogonalEdge from './edges/OrthogonalEdge'
import { voltageToEdgeColor } from '../utils/color'
import { edgeGroupKey, computeEdgeGroupInfo } from '../utils/edgeGroups'

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
  const baseSubsystemHeight = 80
  const perPortHeight = 28
  const dynamicMinHeight = nodeType === 'Subsystem'
    ? baseSubsystemHeight + (subsystemPortCount * perPortHeight)
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

  const groupMidpointInfo = useMemo(() => computeEdgeGroupInfo(project.edges), [project.edges])

  const [contextMenu, setContextMenu] = useState<{ type: 'node'|'pane'; x:number; y:number; targetId?: string }|null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string|null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string|null>(null)

  const nodeTypes = useMemo(() => ({ custom: CustomNode }), [])
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

  const rfNodesInit: RFNode[] = useMemo(() => project.nodes.map(n => {
    const parallelCount = parallelCountForNode(n as any);
    return ({
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
                    <div style={{fontSize:'11px',color:'#555'}}>Inputs: {((n as any).project?.nodes||[]).filter((x:any)=>x.type==='SubsystemInput')?.map((x:any)=>`${x.Vout}V`).join(', ') || '—'}</div>
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
              {/* Right power intentionally empty on init; will be filled by compute effect */}
            </div>
          </div>
        ),
        type: n.type,
        parallelCount,
        ...(n.type==='Load'? { Vreq: (n as any).Vreq } : {}),
        ...(n.type==='Subsystem'? { inputPorts: ((n as any).project?.nodes||[]).filter((x:any)=>x.type==='SubsystemInput').map((x:any)=>({ id:x.id, Vout:x.Vout, name: x.name })) } : {})
      },
      position: { x: n.x ?? (Math.random()*400)|0, y: n.y ?? (Math.random()*300)|0 },
      type: 'custom',
      draggable: true,
      selected: false,
    })
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

  const handleMidpointChange = useCallback((edgeId: string, nextOffset: number, absoluteAxisCoord?: number) => {
    if (!updateEdgeStore) return
    if (!Number.isFinite(nextOffset)) return
    const clamped = Math.min(1, Math.max(0, nextOffset))
    const sourceEdge = project.edges.find(e => e.id === edgeId)
    if (!sourceEdge) return
    const key = edgeGroupKey({ from: sourceEdge.from, fromHandle: sourceEdge.fromHandle })
    const sourcePos = nodePositions.get(sourceEdge.from)
    const targetPos = sourceEdge.to ? nodePositions.get(sourceEdge.to) : undefined
    let midpointX: number | undefined
    if (typeof absoluteAxisCoord === 'number' && Number.isFinite(absoluteAxisCoord)) {
      midpointX = absoluteAxisCoord
    } else if (sourcePos && targetPos) {
      const startX = sourcePos.x
      const endX = targetPos.x
      if (Number.isFinite(startX) && Number.isFinite(endX) && Math.abs(endX - startX) > 1e-3) {
        midpointX = startX + (endX - startX) * clamped
      }
    }
    for (const edge of project.edges) {
      if (edgeGroupKey({ from: edge.from, fromHandle: edge.fromHandle }) !== key) continue
      if (midpointX !== undefined) {
        updateEdgeStore(edge.id, { midpointOffset: clamped, midpointX })
      } else {
        updateEdgeStore(edge.id, { midpointOffset: clamped })
      }
    }
  }, [nodePositions, project.edges, updateEdgeStore])

  useEffect(() => {
    if (!updateEdgeStore) return
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
        updateEdgeStore(groupEdge.id, { midpointX })
      }
    }
  }, [groupMidpointInfo, nodePositions, project.edges, updateEdgeStore])

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
      screenToFlow: screenToFlowPosition,
      defaultColor,
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
  }), [project.edges, project.nodes, computeResult, getGroupOffset, handleMidpointChange, screenToFlowPosition])

  const [edges, setEdges, ] = useEdgesState(rfEdgesInit)

  // Sync when project nodes change (add/remove); preserve positions of existing nodes
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
                  {/* Right power intentionally empty here; compute effect will populate */}
                </div>
              </div>
            ),
            type: n.type,
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

  // Update power info in labels when computeResult changes without resetting positions
  useEffect(()=>{
    setNodes(prev => prev.map(rn => {
      const n = project.nodes.find(x=>x.id===rn.id)
      if (!n) return rn
      // Left details without name
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
              <div style={{fontSize:'11px',color:'#555'}}>Inputs: {(((n as any).project?.nodes||[]).filter((x:any)=>x.type==='SubsystemInput').map((x:any)=>`${x.Vout}V`).join(', ')) || '—'}</div>
              <div style={{fontSize:'11px',color:'#555'}}>Paralleled: {((n as any).numParalleledSystems ?? 1)}</div>
            </div>
          ) : n.type === 'SubsystemInput' ? (
            <div>
              <div style={{fontSize:'11px',color:'#555'}}>Vout: {(n as any).Vout ?? 0}V</div>
            </div>
          ) : n.type === 'Note' && 'text' in n ? (
            <div>
              <div style={{fontSize:'11px',color:'#555', whiteSpace:'pre-wrap'}}>{(n as any).text}</div>
            </div>
          ) : null}
        </div>
      )
      // Right power info: special-case Subsystem to show P_in(single) and P_in(total)
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
        const showPout = (pout !== undefined) && (n.type !== 'Load')
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
          )
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
        const parentV = parent?.type === 'Source' ? parent?.Vout
          : parent?.type === 'Converter' ? parent?.Vout
          : parent?.type === 'Bus' ? parent?.V_bus
          : parent?.type === 'SubsystemInput' ? parent?.Vout
          : undefined
        const childRange = child?.type === 'Converter' ? { min: child?.Vin_min, max: child?.Vin_max } : undefined
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
          screenToFlow: screenToFlowPosition,
          defaultColor,
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
  }, [project.edges, project.nodes, setEdges, computeResult, getGroupOffset, handleMidpointChange, screenToFlowPosition])

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
        if (pos) updatePos(ch.id, pos.x, pos.y)
      }
    }
  }, [nodes])

  const onConnect = useCallback((c: Connection)=>{
    const reaches = (start:string, goal:string)=>{
      const adj: Record<string,string[]> = {}
      project.edges.forEach(e=>{ (adj[e.from]=adj[e.from]||[]).push(e.to) })
      const stack=[start]; const seen=new Set<string>([start])
      while(stack.length){ const u=stack.pop()!; if (u===goal) return true; for (const v of (adj[u]||[])) if (!seen.has(v)){ seen.add(v); stack.push(v) } }
      return false
    }
    if (c.source && c.target && reaches(c.target, c.source)) return
    const edgeId = `${c.source}-${c.target}`
    const baseOffset = (c.source && c.target)
      ? getGroupOffset({ from: c.source, to: c.target, fromHandle: c.sourceHandle ?? undefined })
      : 0.5
    const groupInfo = (c.source)
      ? groupMidpointInfo.get(edgeGroupKey({ from: c.source, fromHandle: c.sourceHandle ?? undefined }))
      : undefined
    const baseMidpointX = groupInfo?.midpointX
    const parent = project.nodes.find(n=>n.id===c.source) as any
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
      screenToFlow: screenToFlowPosition,
      defaultColor,
    }
    setEdges(eds=>addEdge({
      ...c,
      id: edgeId,
      type: 'orthogonal',
      sourceHandle: c.sourceHandle,
      targetHandle: c.targetHandle,
      data: edgeData,
      style: { strokeWidth: 2, stroke: defaultColor },
      labelStyle: { fill: defaultColor },
      selected: false,
    } as any, eds))
    if (c.source && c.target) {
      const payload: any = { id: edgeId, from: c.source, to: c.target, fromHandle: (c.sourceHandle as any) || undefined, toHandle: (c.targetHandle as any) || undefined, midpointOffset: baseOffset }
      if (baseMidpointX !== undefined) payload.midpointX = baseMidpointX
      addEdgeStore(payload)
    }
  }, [addEdgeStore, getGroupOffset, groupMidpointInfo, handleMidpointChange, nodePositions, project.edges, screenToFlowPosition])

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
        onNodeClick={(_,n)=>{onSelect(n.id); setSelectedNodeId(n.id); setSelectedEdgeId(null)}}
        onEdgeClick={(_,e)=>{ onSelect(e.id); setSelectedEdgeId(e.id); setSelectedNodeId(null) }}
        onNodesChange={handleNodesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeDoubleClick={(_,n)=>{ const t=(n as any).data?.type; if (t==='Subsystem' && onOpenSubsystem) onOpenSubsystem(n.id) }}
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
