import { create } from 'zustand'
import { Project, AnyNode, Edge, Scenario } from '../models'
import { sampleProject } from '../sampleData'
import { autosave, loadAutosave } from '../io'

type State = {
  project: Project
  setProject: (p: Project) => void
  addNode: (n: AnyNode) => void
  addEdge: (e: Edge) => void
  updateNode: (id: string, patch: Partial<AnyNode>) => void
  updateEdge?: (id: string, patch: Partial<Edge>) => void
  setScenario: (s: Scenario) => void
  updateNodePos: (id: string, x: number, y: number) => void
  removeNode: (id: string) => void
  removeEdge: (id: string) => void
  updateSubsystemProject: (subsystemId: string, updater: (p: Project) => Project) => void
  subsystemAddNode: (subsystemId: string, node: AnyNode) => void
  subsystemAddEdge: (subsystemId: string, edge: Edge) => void
  subsystemUpdateNode: (subsystemId: string, nodeId: string, patch: Partial<AnyNode>) => void
  subsystemUpdateEdge: (subsystemId: string, edgeId: string, patch: Partial<Edge>) => void
  subsystemUpdateNodePos: (subsystemId: string, nodeId: string, x: number, y: number) => void
  subsystemRemoveNode: (subsystemId: string, nodeId: string) => void
  subsystemRemoveEdge: (subsystemId: string, edgeId: string) => void
}

const saved = loadAutosave()

export const useStore = create<State>((set,get)=>({
  project: saved || sampleProject,
  setProject: (p) => { set({project:p}); autosave(p) },
  addNode: (n) => { const p=get().project; p.nodes=[...p.nodes,n]; set({project:{...p}}); autosave(get().project) },
  addEdge: (e) => { const p=get().project; if (p.edges.some(x=>x.from===e.from && x.to===e.to)) return; p.edges=[...p.edges,e]; set({project:{...p}}); autosave(get().project) },
  updateNode: (id, patch) => { const p=get().project; p.nodes=p.nodes.map(n=>n.id===id? ({...n, ...patch} as AnyNode):n) as AnyNode[]; set({project:{...p}}); autosave(get().project) },
  updateEdge: (id, patch) => { const p=get().project; p.edges=p.edges.map(e=>e.id===id? {...e, ...patch}:e); set({project:{...p}}); autosave(get().project) },
  setScenario: (s) => { const p=get().project; p.currentScenario=s; set({project:{...p}}); autosave(get().project) },
  updateNodePos: (id, x, y) => { const p=get().project; p.nodes=p.nodes.map(n=>n.id===id? ({...n, x, y} as AnyNode):n) as AnyNode[]; set({project:{...p}}); autosave(get().project) },
  removeNode: (id) => { const p=get().project; p.nodes=p.nodes.filter(n=>n.id!==id) as AnyNode[]; p.edges=p.edges.filter(e=>e.from!==id && e.to!==id); set({project:{...p}}); autosave(get().project) },
  removeEdge: (id) => { const p=get().project; p.edges=p.edges.filter(e=>e.id!==id); set({project:{...p}}); autosave(get().project) }
  ,updateSubsystemProject: (subsystemId, updater) => {
    const p=get().project
    p.nodes=p.nodes.map(n=>{
      if (n.id!==subsystemId || (n as any).type!=='Subsystem') return n
      const sub = n as any
      const nextProject = updater(sub.project)
      return { ...sub, project: nextProject }
    }) as AnyNode[]
    set({project:{...p}}); autosave(get().project)
  }
  ,subsystemAddNode: (subsystemId, node) => {
    const fn = (proj: Project): Project => ({ ...proj, nodes: ([...proj.nodes, node] as AnyNode[]) })
    get().updateSubsystemProject(subsystemId, fn)
  }
  ,subsystemAddEdge: (subsystemId, edge) => {
    const fn = (proj: Project): Project => ({ ...proj, edges: proj.edges.some(e=>e.from===edge.from && e.to===edge.to)? proj.edges : [...proj.edges, edge] })
    get().updateSubsystemProject(subsystemId, fn)
  }
  ,subsystemUpdateNode: (subsystemId, nodeId, patch) => {
    const fn = (proj: Project): Project => ({ ...proj, nodes: (proj.nodes.map(n=>n.id===nodeId? ({...n, ...patch} as AnyNode) : n) as AnyNode[]) })
    get().updateSubsystemProject(subsystemId, fn)
  }
  ,subsystemUpdateEdge: (subsystemId, edgeId, patch) => {
    const fn = (proj: Project): Project => ({ ...proj, edges: proj.edges.map(e=>e.id===edgeId? ({...e, ...patch}) : e) })
    get().updateSubsystemProject(subsystemId, fn)
  }
  ,subsystemUpdateNodePos: (subsystemId, nodeId, x, y) => {
    const fn = (proj: Project): Project => ({ ...proj, nodes: (proj.nodes.map(n=>n.id===nodeId? ({...n, x, y} as AnyNode) : n) as AnyNode[]) })
    get().updateSubsystemProject(subsystemId, fn)
  }
  ,subsystemRemoveNode: (subsystemId, nodeId) => {
    const fn = (proj: Project): Project => ({ ...proj, nodes: (proj.nodes.filter(n=>n.id!==nodeId) as AnyNode[]), edges: proj.edges.filter(e=>e.from!==nodeId && e.to!==nodeId) })
    get().updateSubsystemProject(subsystemId, fn)
  }
  ,subsystemRemoveEdge: (subsystemId, edgeId) => {
    const fn = (proj: Project): Project => ({ ...proj, edges: proj.edges.filter(e=>e.id!==edgeId) })
    get().updateSubsystemProject(subsystemId, fn)
  }
}))
