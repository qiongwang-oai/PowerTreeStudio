import React, { useCallback, useEffect, useMemo } from 'react'
import ReactFlow, { Background, Controls, MiniMap, Connection, Edge as RFEdge, Node as RFNode, useNodesState, useEdgesState, addEdge, applyNodeChanges, applyEdgeChanges, OnEdgesChange, OnNodesDelete, OnEdgesDelete } from 'reactflow'
import 'reactflow/dist/style.css'
import { useStore } from '../state/store'
export default function Canvas({onSelect}:{onSelect:(id:string|null)=>void}){
  const project = useStore(s=>s.project)
  const addEdgeStore = useStore(s=>s.addEdge)
  const updatePos = useStore(s=>s.updateNodePos)
  const removeNode = useStore(s=>s.removeNode)
  const removeEdge = useStore(s=>s.removeEdge)

  const rfNodesInit: RFNode[] = useMemo(()=>project.nodes.map(n=>({
    id: n.id, data: { label: n.name }, position: { x: n.x ?? (Math.random()*400)|0, y: n.y ?? (Math.random()*300)|0 }, type: 'default', draggable: true
  })), [])

  const rfEdgesInit: RFEdge[] = useMemo(()=>project.edges.map(e=>({
    id: e.id, source: e.from, target: e.to, animated: false, label: e.interconnect?.R_milliohm? `${e.interconnect.R_milliohm} mΩ` : ''
  })), [])

  const [nodes, setNodes, ] = useNodesState(rfNodesInit)
  const [edges, setEdges, ] = useEdgesState(rfEdgesInit)

  // Sync when project nodes/edges change (e.g., adding from Palette)
  useEffect(()=>{
    const mapped: RFNode[] = project.nodes.map(n=>({
      id: n.id, data: { label: n.name }, position: { x: n.x ?? 0, y: n.y ?? 0 }, type: 'default', draggable: true
    }))
    setNodes(mapped)
  }, [project.nodes, setNodes])

  useEffect(()=>{
    const mapped: RFEdge[] = project.edges.map(e=>({
      id: e.id, source: e.from, target: e.to, animated: false, label: e.interconnect?.R_milliohm? `${e.interconnect.R_milliohm} mΩ` : ''
    }))
    setEdges(mapped)
  }, [project.edges, setEdges])

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
        fitView
        onNodeClick={(_,n)=>onSelect(n.id)}
        onNodesChange={handleNodesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
      >
        <MiniMap /><Controls /><Background gap={16} />
      </ReactFlow>
    </div>
  )
}
