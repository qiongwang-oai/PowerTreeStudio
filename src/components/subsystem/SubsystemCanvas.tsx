import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, Connection, Edge as RFEdge, Node as RFNode, useNodesState, useEdgesState, addEdge, applyNodeChanges, applyEdgeChanges, OnEdgesDelete, OnNodesDelete, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import { Project, AnyNode } from '../../models'
import { compute, etaFromModel } from '../../calc'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import { useStore } from '../../state/store'
import OrthogonalEdge from '../edges/OrthogonalEdge'
import { voltageToEdgeColor } from '../../utils/color'

function CustomNode(props: NodeProps) {
  const { data, selected } = props
  const isSelected = !!selected
  const accentColor = '#0284c7'
  const nodeType = (data as any).type
  const bgClass = nodeType === 'Source' ? 'bg-green-50'
    : nodeType === 'Converter' ? 'bg-blue-50'
    : nodeType === 'Load' ? 'bg-orange-50'
    : nodeType === 'Subsystem' ? 'bg-violet-50'
    : nodeType === 'SubsystemInput' ? 'bg-slate-50'
    : 'bg-white'
  const borderClass = isSelected ? 'border-sky-500 shadow-lg' : 'border-slate-300'
  return (
    <div className={`rounded-lg border ${borderClass} ${bgClass} px-2 py-1 shadow text-xs text-center min-w-[140px] relative`}>
      {isSelected && (
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: 1 }}>
          <div style={{ position: 'absolute', top: -4, left: -4, width: 16, height: 16, borderTop: `4px solid ${accentColor}`, borderLeft: `4px solid ${accentColor}`, borderTopLeftRadius: 12 }} />
          <div style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderTop: `4px solid ${accentColor}`, borderRight: `4px solid ${accentColor}`, borderTopRightRadius: 12 }} />
          <div style={{ position: 'absolute', bottom: -4, left: -4, width: 16, height: 16, borderBottom: `4px solid ${accentColor}`, borderLeft: `4px solid ${accentColor}`, borderBottomLeftRadius: 12 }} />
          <div style={{ position: 'absolute', bottom: -4, right: -4, width: 16, height: 16, borderBottom: `4px solid ${accentColor}`, borderRight: `4px solid ${accentColor}`, borderBottomRightRadius: 12 }} />
        </div>
      )}
      {(nodeType==='Converter' || nodeType==='Load' || nodeType==='Bus') && (
        <>
          <Handle type="target" position={Position.Top} id="input" style={{ background: '#555' }} />
          <div style={{ fontSize: '10px', color: '#666', marginBottom: 4 }}>{nodeType==='Load' ? `${Number(((data as any).Vreq ?? 0))} V` : 'input'}</div>
        </>
      )}
      {nodeType==='Subsystem' && (
        (() => {
          const ports = Array.isArray((data as any).inputPorts) ? (data as any).inputPorts : []
          const count = ports.length
          if (count === 0) return (
            <>
              <Handle type="target" position={Position.Top} id="input" style={{ background: '#555' }} />
              <div style={{ fontSize: '10px', color: '#666', marginBottom: 4 }}>input</div>
            </>
          )
          return (
            <>
              {ports.map((p:any, idx:number) => {
                const pct = ((idx+1)/(count+1))*100
                const label = `${Number(p.Vout ?? 0)} V`
                return (
                  <React.Fragment key={p.id}>
                    <Handle type="target" position={Position.Top} id={p.id} style={{ background: '#555', left: `${pct}%`, transform: 'translate(-50%, -50%)' }} />
                    <div style={{ position:'absolute', top: 4, left: `${pct}%`, transform: 'translateX(-50%)', fontSize: '10px', color: '#334155', whiteSpace: 'nowrap' }}>{label}</div>
                  </React.Fragment>
                )
              })}
              {/* Spacer to avoid label overlap */}
              <div style={{ height: 18 }} />
            </>
          )
        })()
      )}
      {data.label}
      {(nodeType === 'Source' || nodeType === 'Converter' || nodeType === 'SubsystemInput' || nodeType === 'Bus') && (
        <>
          <Handle type="source" position={Position.Bottom} id="output" style={{ background: '#555' }} />
          <div style={{ fontSize: '10px', color: '#666', marginTop: 4 }}>output</div>
        </>
      )}
    </div>
  )
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
  const [contextMenu, setContextMenu] = useState<{ type: 'node'|'pane'; x:number; y:number; targetId?: string }|null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string|null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string|null>(null)

  const nodeTypes = useMemo(() => ({ custom: CustomNode }), [])
  const edgeTypes = useMemo(() => ({ orthogonal: OrthogonalEdge }), [])
  const handleMidpointChange = useCallback((edgeId: string, nextOffset: number)=>{
    if (!Number.isFinite(nextOffset)) return
    if (!updateEdgeNested) return
    const clamped = Math.min(1, Math.max(0, nextOffset))
    updateEdgeNested(path, edgeId, { midpointOffset: clamped })
  }, [path, updateEdgeNested])
  const computeResult = useMemo(()=> compute(project), [project])

  const rfNodesInit: RFNode[] = useMemo(()=>project.nodes.map(n=>({
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
      ...(n.type==='Load'? { Vreq: (n as any).Vreq } : {}),
      ...(n.type==='Subsystem'? { inputPorts: ((n as any).project?.nodes||[]).filter((x:any)=>x.type==='SubsystemInput').map((x:any)=>({ id:x.id, Vout:x.Vout, name: x.name })) } : {})
    },
    position: { x: n.x ?? (Math.random()*400)|0, y: n.y ?? (Math.random()*300)|0 },
    type: 'custom',
    draggable: true,
    selected: false,
  })), [project.nodes])

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
    const midpointOffset = e.midpointOffset ?? 0.5
    const resistanceLabel = (e.interconnect?.R_milliohm ?? 0).toFixed(1)
    const currentLabel = I.toFixed(1)
    const baseLabel = `${resistanceLabel} mΩ\n${currentLabel} A`
    const label = convRangeViolation ? `${baseLabel} | Converter Vin Range Violation` : (eqViolation ? `${baseLabel} | Vin != Vout` : baseLabel)
    const edgeColor = voltageToEdgeColor(parentV)
    const defaultColor = mismatch ? '#ef4444' : edgeColor
    const edgeData = {
      midpointOffset,
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
  }), [project.edges, project.nodes, computeResult, handleMidpointChange, screenToFlowPosition])

  const [nodes, setNodes, ] = useNodesState(rfNodesInit)
  const [edges, setEdges, ] = useEdgesState(rfEdgesInit)

  useEffect(()=>{
    setNodes(prev => {
      const prevById = new Map(prev.map(p=>[p.id, p]))
      const mapped: RFNode[] = project.nodes.map(n=>{
        const existing = prevById.get(n.id)
        const position = existing?.position ?? { x: n.x ?? (Math.random()*400)|0, y: n.y ?? (Math.random()*300)|0 }
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
            ...(n.type==='Load'? { Vreq: (n as any).Vreq } : {})
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
          label: (
            <div className="flex flex-col items-stretch gap-1">
              <div className="text-center font-semibold">{n.name}</div>
              <div className="flex items-stretch justify-between gap-2">
                {left}
                {right}
              </div>
            </div>
          ),
          ...(n.type==='Subsystem'? { inputPorts: ((n as any).project?.nodes||[]).filter((x:any)=>x.type==='SubsystemInput').map((x:any)=>({ id:x.id, Vout:x.Vout, name: x.name })) } : {})
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
        const midpointOffset = e.midpointOffset ?? 0.5
        const resistanceLabel = (e.interconnect?.R_milliohm ?? 0).toFixed(1)
        const currentLabel = I.toFixed(1)
        const baseLabel = `${resistanceLabel} mΩ\n${currentLabel} A`
        const label = convRangeViolation ? `${baseLabel} | Converter Vin Range Violation` : (eqViolation ? `${baseLabel} | Vin != Vout` : baseLabel)
        const edgeColor = voltageToEdgeColor(parentV)
        const defaultColor = mismatch ? '#ef4444' : edgeColor
        const edgeData = {
          midpointOffset,
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
  }, [project.edges, project.nodes, setEdges, computeResult, handleMidpointChange, screenToFlowPosition])

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
  }, [nodes, subsystemId])

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
    const baseOffset = 0.5
    const parent = project.nodes.find(n=>n.id===c.source) as any
    const parentV = parent?.type==='Source'? parent?.Vout
      : parent?.type==='Converter'? parent?.Vout
      : parent?.type==='Bus'? parent?.V_bus
      : parent?.type==='SubsystemInput'? parent?.Vout
      : undefined
    const defaultColor = voltageToEdgeColor(parentV)
    const edgeData = {
      midpointOffset: baseOffset,
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
    if (c.source && c.target) addEdgeStore(path, { id: edgeId, from: c.source, to: c.target, fromHandle: (c.sourceHandle as any) || undefined, toHandle: (c.targetHandle as any) || undefined, midpointOffset: baseOffset })
  }, [addEdgeStore, handleMidpointChange, path, project.edges, screenToFlowPosition])

  const onNodesDelete: OnNodesDelete = useCallback((deleted)=>{
    for (const n of deleted){ removeNode(path, n.id) }
  }, [removeNode, path])

  const onEdgesDelete: OnEdgesDelete = useCallback((deleted)=>{
    for (const e of deleted){ removeEdge(path, e.id) }
  }, [removeEdge, path])

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

  const isTopmostEditor = useMemo(()=>{
    if (!openSubsystemIds || openSubsystemIds.length === 0) return true
    if (path.length !== openSubsystemIds.length) return false
    return path.every((id, idx)=>openSubsystemIds[idx] === id)
  }, [openSubsystemIds, path])

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

  return (
    <div className="h-full" aria-label="subsystem-canvas" onClick={()=>setContextMenu(null)}>
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
