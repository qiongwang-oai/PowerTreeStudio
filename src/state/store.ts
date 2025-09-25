import { create } from 'zustand'
import { Project, AnyNode, Edge, Scenario } from '../models'
import { sampleProject } from '../sampleData'
import { autosave, loadAutosave } from '../io'
import { autoLayoutProject } from '../utils/autoLayout'

type State = {
  project: Project
  importedFileName: string | null
  clipboardNode: AnyNode | null
  past: Project[]
  future: Project[]
  setProject: (p: Project) => void
  setImportedFileName: (name: string | null) => void
  addNode: (n: AnyNode) => void
  addEdge: (e: Edge) => void
  updateNode: (id: string, patch: Partial<AnyNode>) => void
  updateEdge?: (id: string, patch: Partial<Edge>) => void
  setScenario: (s: Scenario) => void
  updateNodePos: (id: string, x: number, y: number) => void
  removeNode: (id: string) => void
  removeEdge: (id: string) => void
  setClipboardNode: (n: AnyNode | null) => void
  undo: () => void
  redo: () => void
  autoAlign: (options?: { columnSpacing?: number; rowSpacing?: number }) => void
  updateSubsystemProject: (subsystemId: string, updater: (p: Project) => Project) => void
  updateSubsystemProjectAtPath: (subsystemPath: string[], updater: (p: Project) => Project) => void
  subsystemAddNode: (subsystemId: string, node: AnyNode) => void
  subsystemAddEdge: (subsystemId: string, edge: Edge) => void
  subsystemUpdateNode: (subsystemId: string, nodeId: string, patch: Partial<AnyNode>) => void
  subsystemUpdateEdge: (subsystemId: string, edgeId: string, patch: Partial<Edge>) => void
  subsystemUpdateNodePos: (subsystemId: string, nodeId: string, x: number, y: number) => void
  subsystemRemoveNode: (subsystemId: string, nodeId: string) => void
  subsystemRemoveEdge: (subsystemId: string, edgeId: string) => void
  nestedSubsystemAddNode: (subsystemPath: string[], node: AnyNode) => void
  nestedSubsystemAddEdge: (subsystemPath: string[], edge: Edge) => void
  nestedSubsystemUpdateNode: (subsystemPath: string[], nodeId: string, patch: Partial<AnyNode>) => void
  nestedSubsystemUpdateEdge: (subsystemPath: string[], edgeId: string, patch: Partial<Edge>) => void
  nestedSubsystemUpdateNodePos: (subsystemPath: string[], nodeId: string, x: number, y: number) => void
  nestedSubsystemRemoveNode: (subsystemPath: string[], nodeId: string) => void
  nestedSubsystemRemoveEdge: (subsystemPath: string[], edgeId: string) => void
  nestedSubsystemAutoAlign: (subsystemPath: string[], options?: { columnSpacing?: number; rowSpacing?: number }) => void
  nestedSubsystemClear: (subsystemPath: string[]) => void
  openSubsystemIds: string[],
  setOpenSubsystemIds: (ids: string[]) => void
  expandedSubsystemViews: Record<string, { offset: { x: number, y: number } }>
  expandSubsystemView: (id: string) => void
  collapseSubsystemView: (id: string) => void
  setSubsystemViewOffset: (id: string, offset: { x: number, y: number }) => void
}

const saved = loadAutosave()

export const useStore = create<State>((set,get)=>({
  project: saved || sampleProject,
  importedFileName: null,
  clipboardNode: null,
  past: [],
  future: [],
  setProject: (p) => { const prev = JSON.parse(JSON.stringify(get().project)) as Project; set(state=>({ past:[...state.past, prev], future: [] })); set({project:p}); autosave(p) },
  setImportedFileName: (name) => { set({ importedFileName: name }) },
  addNode: (n) => { const p=get().project; const prev = JSON.parse(JSON.stringify(p)) as Project; set(state=>({ past:[...state.past, prev], future: [] })); p.nodes=[...p.nodes,n]; set({project:{...p}}); autosave(get().project) },
  addEdge: (e) => { const p=get().project; if (p.edges.some(x=>x.from===e.from && x.to===e.to)) return; const prev = JSON.parse(JSON.stringify(p)) as Project; set(state=>({ past:[...state.past, prev], future: [] })); p.edges=[...p.edges,e]; set({project:{...p}}); autosave(get().project) },
  updateNode: (id, patch) => { const p=get().project; const prev = JSON.parse(JSON.stringify(p)) as Project; set(state=>({ past:[...state.past, prev], future: [] })); p.nodes=p.nodes.map(n=>n.id===id? ({...n, ...patch} as AnyNode):n) as AnyNode[]; set({project:{...p}}); autosave(get().project) },
  updateEdge: (id, patch) => { const p=get().project; const prev = JSON.parse(JSON.stringify(p)) as Project; set(state=>({ past:[...state.past, prev], future: [] })); p.edges=p.edges.map(e=>e.id===id? {...e, ...patch}:e); set({project:{...p}}); autosave(get().project) },
  setScenario: (s) => { const p=get().project; const prev = JSON.parse(JSON.stringify(p)) as Project; set(state=>({ past:[...state.past, prev], future: [] })); p.currentScenario=s; set({project:{...p}}); autosave(get().project) },
  updateNodePos: (id, x, y) => { const p=get().project; const prev = JSON.parse(JSON.stringify(p)) as Project; set(state=>({ past:[...state.past, prev], future: [] })); p.nodes=p.nodes.map(n=>n.id===id? ({...n, x, y} as AnyNode):n) as AnyNode[]; set({project:{...p}}); autosave(get().project) },
  removeNode: (id) => { const p=get().project; const prev = JSON.parse(JSON.stringify(p)) as Project; set(state=>({ past:[...state.past, prev], future: [] })); p.nodes=p.nodes.filter(n=>n.id!==id) as AnyNode[]; p.edges=p.edges.filter(e=>e.from!==id && e.to!==id); set({project:{...p}}); autosave(get().project) },
  removeEdge: (id) => { const p=get().project; const prev = JSON.parse(JSON.stringify(p)) as Project; set(state=>({ past:[...state.past, prev], future: [] })); p.edges=p.edges.filter(e=>e.id!==id); set({project:{...p}}); autosave(get().project) }
  ,setClipboardNode: (n) => { set({ clipboardNode: n }) }
  ,undo: () => { const { past, project, future } = get(); if (past.length===0) return; const prev = past[past.length-1]; set({ past: past.slice(0,-1), future: [...future, JSON.parse(JSON.stringify(project))], project: prev }); autosave(get().project) }
  ,redo: () => { const { past, project, future } = get(); if (future.length===0) return; const next = future[future.length-1]; set({ past: [...past, JSON.parse(JSON.stringify(project))], future: future.slice(0,-1), project: next }); autosave(get().project) }
  ,autoAlign: (options) => {
    const project = get().project
    const prev = JSON.parse(JSON.stringify(project)) as Project
    set(state => ({ past: [...state.past, prev], future: [] }))
    const { nodes, edges } = autoLayoutProject(project, options)
    const next: Project = { ...project, nodes, edges }
    set({ project: next })
    autosave(next)
  }
  ,updateSubsystemProject: (subsystemId, updater) => {
    const p=get().project
    const prev = JSON.parse(JSON.stringify(p)) as Project; set(state=>({ past:[...state.past, prev], future: [] }));
    p.nodes=p.nodes.map(n=>{
      if (n.id!==subsystemId || (n as any).type!=='Subsystem') return n
      const sub = n as any
      const nextProject = updater(sub.project)
      return { ...sub, project: nextProject }
    }) as AnyNode[]
    set({project:{...p}}); autosave(get().project)
  }
  ,updateSubsystemProjectAtPath: (subsystemPath, updater) => {
    const applyAtPath = (proj: Project, path: string[]): Project => {
      if (path.length === 0) {
        return updater(proj)
      }
      const [currentId, ...rest] = path
      return {
        ...proj,
        nodes: (proj.nodes.map(n => {
          if (n.id !== currentId || (n as any).type !== 'Subsystem') return n
          const sub = n as any
          const nextProject = applyAtPath(sub.project, rest)
          return { ...sub, project: nextProject }
        }) as AnyNode[])
      }
    }
    const root = get().project
    const prev = JSON.parse(JSON.stringify(root)) as Project; set(state=>({ past:[...state.past, prev], future: [] }));
    const nextRoot = applyAtPath(root, subsystemPath)
    set({ project: nextRoot }); autosave(get().project)
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
  ,nestedSubsystemAddNode: (subsystemPath, node) => {
    const fn = (proj: Project): Project => ({ ...proj, nodes: ([...proj.nodes, node] as AnyNode[]) })
    get().updateSubsystemProjectAtPath(subsystemPath, fn)
  }
  ,nestedSubsystemAddEdge: (subsystemPath, edge) => {
    const fn = (proj: Project): Project => ({ ...proj, edges: proj.edges.some(e=>e.from===edge.from && e.to===edge.to)? proj.edges : [...proj.edges, edge] })
    get().updateSubsystemProjectAtPath(subsystemPath, fn)
  }
  ,nestedSubsystemUpdateNode: (subsystemPath, nodeId, patch) => {
    const fn = (proj: Project): Project => ({ ...proj, nodes: (proj.nodes.map(n=>n.id===nodeId? ({...n, ...patch} as AnyNode) : n) as AnyNode[]) })
    get().updateSubsystemProjectAtPath(subsystemPath, fn)
  }
  ,nestedSubsystemUpdateEdge: (subsystemPath, edgeId, patch) => {
    const fn = (proj: Project): Project => ({ ...proj, edges: proj.edges.map(e=>e.id===edgeId? ({...e, ...patch}) : e) })
    get().updateSubsystemProjectAtPath(subsystemPath, fn)
  }
  ,nestedSubsystemUpdateNodePos: (subsystemPath, nodeId, x, y) => {
    const fn = (proj: Project): Project => ({ ...proj, nodes: (proj.nodes.map(n=>n.id===nodeId? ({...n, x, y} as AnyNode) : n) as AnyNode[]) })
    get().updateSubsystemProjectAtPath(subsystemPath, fn)
  }
  ,nestedSubsystemRemoveNode: (subsystemPath, nodeId) => {
    const fn = (proj: Project): Project => ({ ...proj, nodes: (proj.nodes.filter(n=>n.id!==nodeId) as AnyNode[]), edges: proj.edges.filter(e=>e.from!==nodeId && e.to!==nodeId) })
    get().updateSubsystemProjectAtPath(subsystemPath, fn)
  }
  ,nestedSubsystemRemoveEdge: (subsystemPath, edgeId) => {
    const fn = (proj: Project): Project => ({ ...proj, edges: proj.edges.filter(e=>e.id!==edgeId) })
    get().updateSubsystemProjectAtPath(subsystemPath, fn)
  }
  ,nestedSubsystemAutoAlign: (subsystemPath, options) => {
    const fn = (proj: Project): Project => {
      const { nodes, edges } = autoLayoutProject(proj, options)
      return { ...proj, nodes, edges }
    }
    get().updateSubsystemProjectAtPath(subsystemPath, fn)
  }
  ,nestedSubsystemClear: (subsystemPath) => {
    const fn = (proj: Project): Project => ({
      ...proj,
      nodes: proj.nodes.filter(n => n.type === 'SubsystemInput') as AnyNode[],
      edges: [],
    })
    get().updateSubsystemProjectAtPath(subsystemPath, fn)
  }
  ,openSubsystemIds: [] as string[],
  setOpenSubsystemIds: (ids) => set({ openSubsystemIds: ids }),
  expandedSubsystemViews: {},
  expandSubsystemView: (id) => {
    set(state => {
      if (state.expandedSubsystemViews[id]) return {}
      return {
        expandedSubsystemViews: {
          ...state.expandedSubsystemViews,
          [id]: { offset: { x: 0, y: 0 } },
        },
      }
    })
  },
  collapseSubsystemView: (id) => {
    set(state => {
      if (!state.expandedSubsystemViews[id]) return {}
      const next = { ...state.expandedSubsystemViews }
      delete next[id]
      return { expandedSubsystemViews: next }
    })
  },
  setSubsystemViewOffset: (id, offset) => {
    set(state => {
      const current = state.expandedSubsystemViews[id]
      if (!current) return {}
      if (current.offset.x === offset.x && current.offset.y === offset.y) return {}
      return {
        expandedSubsystemViews: {
          ...state.expandedSubsystemViews,
          [id]: { offset },
        },
      }
    })
  }
}))
