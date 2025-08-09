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
  setScenario: (s: Scenario) => void
  updateNodePos: (id: string, x: number, y: number) => void
  removeNode: (id: string) => void
  removeEdge: (id: string) => void
}

const saved = loadAutosave()

export const useStore = create<State>((set,get)=>({
  project: saved || sampleProject,
  setProject: (p) => { set({project:p}); autosave(p) },
  addNode: (n) => { const p=get().project; p.nodes=[...p.nodes,n]; set({project:{...p}}); autosave(get().project) },
  addEdge: (e) => { const p=get().project; if (p.edges.some(x=>x.from===e.from && x.to===e.to)) return; p.edges=[...p.edges,e]; set({project:{...p}}); autosave(get().project) },
  updateNode: (id, patch) => { const p=get().project; p.nodes=p.nodes.map(n=>n.id===id? {...n, ...patch}:n); set({project:{...p}}); autosave(get().project) },
  setScenario: (s) => { const p=get().project; p.currentScenario=s; set({project:{...p}}); autosave(get().project) },
  updateNodePos: (id, x, y) => { const p=get().project; p.nodes=p.nodes.map(n=>n.id===id? {...n, x, y}:n); set({project:{...p}}); autosave(get().project) },
  removeNode: (id) => { const p=get().project; p.nodes=p.nodes.filter(n=>n.id!==id); p.edges=p.edges.filter(e=>e.from!==id && e.to!==id); set({project:{...p}}); autosave(get().project) },
  removeEdge: (id) => { const p=get().project; p.edges=p.edges.filter(e=>e.id!==id); set({project:{...p}}); autosave(get().project) }
}))
