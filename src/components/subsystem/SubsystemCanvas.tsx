import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, Connection, Edge as RFEdge, Node as RFNode, useNodesState, useEdgesState, addEdge, applyNodeChanges, applyEdgeChanges, OnEdgesDelete, OnNodesDelete, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import { Project, AnyNode } from '../../models'
import { compute } from '../../calc'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import { useStore } from '../../state/store'

function CustomNode(props: NodeProps) {
  const { data } = props
  const nodeType = (data as any).type
  const bgClass = nodeType === 'Source' ? 'bg-green-50'
    : nodeType === 'Converter' ? 'bg-blue-50'
    : nodeType === 'Load' ? 'bg-orange-50'
    : nodeType === 'Subsystem' ? 'bg-violet-50'
    : nodeType === 'SubsystemInput' ? 'bg-slate-50'
    : 'bg-white'
  return (
    <div className={`rounded-lg border ${bgClass} px-2 py-1 shadow text-xs text-center min-w-[120px]`}>
      {(nodeType==='Converter' || nodeType==='Load' || nodeType==='Subsystem') && (
        <>
          <Handle type="target" position={Position.Top} id="input" style={{ background: '#555' }} />
          <div style={{ fontSize: '10px', color: '#666', marginBottom: 4 }}>input</div>
        </>
      )}
      {data.label}
      {(nodeType === 'Source' || nodeType === 'Converter' || nodeType === 'SubsystemInput') && (
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
  const addNodeNested = useStore(s=>s.nestedSubsystemAddNode)
  const clipboardNode = useStore(s=>s.clipboardNode)
  const setClipboardNode = useStore(s=>s.setClipboardNode)
  const { screenToFlowPosition } = useReactFlow()

  const [contextMenu, setContextMenu] = useState<{ type: 'node'|'pane'; x:number; y:number; targetId?: string }|null>(null)
  const path = (subsystemPath || [subsystemId])

  const nodeTypes = useMemo(() => ({ custom: CustomNode }), [])
  const computeResult = compute(project)

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
                  <div style={{fontSize:'11px',color:'#555'}}>η: {(((n as any).efficiency?.value ?? ((n as any).efficiency?.points?.[0]?.eta ?? 0)) * 100).toFixed(1)}%</div>
                </div>
               ) : n.type === 'Load' && 'Vreq' in n && 'I_typ' in n && 'I_max' in n ? (
                <div>
                  <div style={{fontSize:'11px',color:'#555'}}>Vreq: {(n as any).Vreq}V</div>
                  <div style={{fontSize:'11px',color:'#555'}}>I_typ: {(n as any).I_typ}A</div>
                  <div style={{fontSize:'11px',color:'#555'}}>I_max: {(n as any).I_max}A</div>
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
      type: (n as AnyNode).type
    },
    position: { x: n.x ?? (Math.random()*400)|0, y: n.y ?? (Math.random()*300)|0 },
    type: 'custom',
    draggable: true
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
      : child?.type==='Subsystem'? ((computeResult.nodes[child.id] as any)?.inputV_nom ?? child?.inputV_nom)
      : undefined
    const convRangeViolation = (parentV!==undefined && childRange!==undefined) ? !(parentV>=childRange.min && parentV<=childRange.max) : false
    const eqViolation = (parentV!==undefined && childDirectVin!==undefined) ? (parentV !== childDirectVin) : false
    const mismatch = convRangeViolation || eqViolation
    const baseLabel = `${e.interconnect?.R_milliohm ?? 0} mΩ | ${(I).toFixed(3)} A`
    const label = convRangeViolation ? `${baseLabel} | Converter Vin Range Violation` : (eqViolation ? `${baseLabel} | Vin != Vout` : baseLabel)
    return ({
      id: e.id,
      source: e.from,
      target: e.to,
      animated: false,
      label,
      ...(mismatch? { labelStyle: { fill: '#ef4444' } } : {}),
      style: { strokeWidth, ...(mismatch? { stroke: '#ef4444' } : {}) }
    })
  }), [project.edges, computeResult])

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
                        <div style={{fontSize:'11px',color:'#555'}}>η: {(((n as any).efficiency?.value ?? ((n as any).efficiency?.points?.[0]?.eta ?? 0)) * 100).toFixed(1)}%</div>
                      </div>
           ) : n.type === 'Load' && 'Vreq' in n && 'I_typ' in n && 'I_max' in n ? (
                      <div>
                        <div style={{fontSize:'11px',color:'#555'}}>Vreq: {(n as any).Vreq}V</div>
                        <div style={{fontSize:'11px',color:'#555'}}>I_typ: {(n as any).I_typ}A</div>
                        <div style={{fontSize:'11px',color:'#555'}}>I_max: {(n as any).I_max}A</div>
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
            type: (n as AnyNode).type
          },
          position,
          type: 'custom',
          draggable: true
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
              <div style={{fontSize:'11px',color:'#555'}}>η: {(((n as any).efficiency?.value ?? ((n as any).efficiency?.points?.[0]?.eta ?? 0)) * 100).toFixed(1)}%</div>
            </div>
          ) : n.type === 'Load' && 'Vreq' in n && 'I_typ' in n && 'I_max' in n ? (
            <div>
              <div style={{fontSize:'11px',color:'#555'}}>Vreq: {(n as any).Vreq}V</div>
              <div style={{fontSize:'11px',color:'#555'}}>I_typ: {(n as any).I_typ}A</div>
              <div style={{fontSize:'11px',color:'#555'}}>I_max: {(n as any).I_max}A</div>
            </div>
          ) : n.type === 'Subsystem' ? (
            <div>
              <div style={{fontSize:'11px',color:'#555'}}>Vin: {(computeResult.nodes[n.id]?.inputV_nom ?? (n as any).inputV_nom ?? 0).toFixed(2)}V</div>
              <div style={{fontSize:'11px',color:'#555'}}>Paralleled: {((n as any).numParalleledSystems ?? 1)}</div>
            </div>
          ) : n.type === 'Note' && 'text' in n ? (
            <div>
              <div style={{fontSize:'11px',color:'#555', whiteSpace:'pre-wrap'}}>{(n as any).text}</div>
            </div>
          ) : null}
        </div>
      )
      const pout = computeResult.nodes[n.id]?.P_out
      const showPout = (pout !== undefined) && (n.type !== 'Load')
      const right = (showPout) ? (
        <>
          <div className="w-px bg-slate-300 mx-1" />
          <div className="text-left min-w-[70px]">
            {showPout && (
              <div style={{ fontSize: '10px', color: '#1e293b' }}>P_out: {pout!.toFixed(2)} W</div>
            )}
          </div>
        </>
      ) : null
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
          )
        }
      }
    }))
  }, [computeResult, project.nodes, setNodes])

  useEffect(()=>{
    const mapped: RFEdge[] = project.edges.map(e=>{
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
        : child?.type==='Subsystem'? ((computeResult.nodes[child.id] as any)?.inputV_nom ?? child?.inputV_nom)
        : undefined
      const convRangeViolation = (parentV!==undefined && childRange!==undefined) ? !(parentV>=childRange.min && parentV<=childRange.max) : false
      const eqViolation = (parentV!==undefined && childDirectVin!==undefined) ? (parentV !== childDirectVin) : false
      const mismatch = convRangeViolation || eqViolation
      const baseLabel = `${e.interconnect?.R_milliohm ?? 0} mΩ | ${(I).toFixed(3)} A`
      const label = convRangeViolation ? `${baseLabel} | Converter Vin Range Violation` : (eqViolation ? `${baseLabel} | Vin != Vout` : baseLabel)
      return ({
        id: e.id,
        source: e.from,
        target: e.to,
        animated: false,
        label,
        ...(mismatch? { labelStyle: { fill: '#ef4444' } } : {}),
        style: { strokeWidth, ...(mismatch? { stroke: '#ef4444' } : {}) }
      })
    })
    setEdges(mapped)
  }, [project.edges, setEdges, computeResult])

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
    setEdges(eds=>addEdge({ ...c, id: `${c.source}-${c.target}` } as any, eds))
    if (c.source && c.target) addEdgeStore(path, { id: `${c.source}-${c.target}`, from: c.source, to: c.target })
  }, [project.edges, path])

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

  return (
    <div className="h-full" aria-label="subsystem-canvas" onClick={()=>setContextMenu(null)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        defaultEdgeOptions={{ style: { strokeWidth: 2 } }}
        onNodeClick={(_,n)=>onSelect(n.id)}
        onEdgeClick={(_,e)=>onSelect(e.id)}
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


