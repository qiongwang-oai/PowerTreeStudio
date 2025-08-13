import React, { useCallback, useEffect, useMemo } from 'react'
import ReactFlow, { Background, Controls, MiniMap, Connection, Edge as RFEdge, Node as RFNode, useNodesState, useEdgesState, addEdge, applyNodeChanges, applyEdgeChanges, OnEdgesChange, OnNodesDelete, OnEdgesDelete } from 'reactflow'
import 'reactflow/dist/style.css'
import { useStore } from '../state/store'
import { compute } from '../calc'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

function CustomNode(props: NodeProps) {
  const { data } = props;
  const nodeType = data.type;
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
  );
}

export default function Canvas({onSelect, onOpenSubsystem}:{onSelect:(id:string|null)=>void, onOpenSubsystem?:(id:string)=>void}){
  const project = useStore(s=>s.project)
  const addEdgeStore = useStore(s=>s.addEdge)
  const updatePos = useStore(s=>s.updateNodePos)
  const removeNode = useStore(s=>s.removeNode)
  const removeEdge = useStore(s=>s.removeEdge)

  const nodeTypes = useMemo(() => ({ custom: CustomNode }), [])

  // Compute analysis each render to reflect immediate edits
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
            {/* Right power intentionally empty on init; will be filled by compute effect */}
          </div>
        </div>
      ),
      type: n.type
    },
    position: { x: n.x ?? (Math.random()*400)|0, y: n.y ?? (Math.random()*300)|0 },
    type: 'custom',
    draggable: true
  })), [project.nodes])

  const rfEdgesInit: RFEdge[] = useMemo(()=>project.edges.map(e=>{
    const I = computeResult.edges[e.id]?.I_edge ?? 0
    const strokeWidth = Math.max(2, 2 + 3 * Math.log10(I + 1e-3))
    return ({
      id: e.id,
      source: e.from,
      target: e.to,
      animated: false,
      label: `${e.interconnect?.R_milliohm ?? 0} mΩ | ${(I).toFixed(3)} A`,
      style: { strokeWidth }
    })
  }), [project.edges, computeResult])

  const [nodes, setNodes, ] = useNodesState(rfNodesInit)
  const [edges, setEdges, ] = useEdgesState(rfEdgesInit)

  // Sync when project nodes change (add/remove); preserve positions of existing nodes
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
                  {/* Right power intentionally empty here; compute effect will populate */}
                </div>
              </div>
            ),
            type: n.type
          },
          position,
          type: 'custom',
          draggable: true
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
              <div style={{fontSize:'11px',color:'#555'}}>Vin: {(((computeResult.nodes[n.id] as any)?.inputV_nom) ?? (n as any).inputV_nom ?? 0).toFixed(2)}V</div>
              <div style={{fontSize:'11px',color:'#555'}}>Paralleled: {((n as any).numParalleledSystems ?? 1)}</div>
            </div>
          ) : n.type === 'Note' && 'text' in n ? (
            <div>
              <div style={{fontSize:'11px',color:'#555', whiteSpace:'pre-wrap'}}>{(n as any).text}</div>
            </div>
          ) : null}
        </div>
      )
      // Right power info respecting type rules
      const pin = computeResult.nodes[n.id]?.P_in
      const pout = computeResult.nodes[n.id]?.P_out
      const showPin = (pin !== undefined) && (n.type !== 'Source')
      const showPout = (pout !== undefined) && (n.type !== 'Load')
      const right = (showPin || showPout) ? (
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
      return ({
        id: e.id,
        source: e.from,
        target: e.to,
        animated: false,
        label: `${e.interconnect?.R_milliohm ?? 0} mΩ | ${(I).toFixed(3)} A`,
        style: { strokeWidth }
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
    setEdges(eds=>addEdge({ ...c, id: `${c.source}-${c.target}` } as any, eds))
    if (c.source && c.target) addEdgeStore({ id: `${c.source}-${c.target}`, from: c.source, to: c.target })
  }, [project.edges])

  const onNodesDelete: OnNodesDelete = useCallback((deleted)=>{
    for (const n of deleted){ removeNode(n.id) }
  }, [removeNode])

  const onEdgesDelete: OnEdgesDelete = useCallback((deleted)=>{
    for (const e of deleted){ removeEdge(e.id) }
  }, [removeEdge])

  return (
    <div className="h-full" aria-label="canvas">
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
        onNodeDoubleClick={(_,n)=>{ const t=(n as any).data?.type; if (t==='Subsystem' && onOpenSubsystem) onOpenSubsystem(n.id) }}
      >
        <MiniMap /><Controls /><Background gap={16} />
      </ReactFlow>
    </div>
  )
}
