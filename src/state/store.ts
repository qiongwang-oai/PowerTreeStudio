import { create } from 'zustand'
import { Project, AnyNode, Edge, Scenario, CanvasMarkup } from '../models'
import { sampleProject } from '../sampleData'
import { autosave, loadAutosave } from '../io'
import { autoLayoutProject } from '../utils/autoLayout'
import { genId } from '../utils'
import {
  QuickPreset,
  DEFAULT_QUICK_PRESETS,
  loadQuickPresetsFromStorage,
  persistQuickPresetsToStorage,
  materializeQuickPreset,
  createQuickPresetFromNode,
  resetQuickPresetIds,
  sanitizeNodeForPreset,
} from '../utils/quickPresets'

export type ClipboardPayload = {
  nodes: AnyNode[]
  edges: Edge[]
  markups: CanvasMarkup[]
  origin: { x: number; y: number } | null
}

type State = {
  project: Project
  importedFileName: string | null
  clipboard: ClipboardPayload | null
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
  addMarkup: (markup: CanvasMarkup) => void
  updateMarkup: (id: string, updater: (markup: CanvasMarkup) => CanvasMarkup) => void
  removeMarkup: (id: string) => void
  reorderMarkups: (updater: (markups: CanvasMarkup[]) => CanvasMarkup[]) => void
  setClipboard: (payload: ClipboardPayload | null) => void
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
  quickPresets: QuickPreset[]
  addQuickPreset: (preset: QuickPreset) => void
  updateQuickPreset: (id: string, patch: { name?: string; description?: string | null; accentColor?: string | null; node?: ReturnType<typeof sanitizeNodeForPreset> }) => void
  removeQuickPreset: (id: string) => void
  duplicateQuickPreset: (id: string) => void
  reorderQuickPresets: (sourceIndex: number, targetIndex: number) => void
  resetQuickPresets: () => void
  importQuickPresets: (presets: QuickPreset[], mode: 'merge' | 'replace') => void
  applyQuickPreset: (id: string, position?: { x: number; y: number }) => AnyNode | null
  captureQuickPresetFromNode: (node: AnyNode, meta?: { name?: string; description?: string; accentColor?: string }) => QuickPreset
}

const storedQuickPresets = (() => {
  try {
    return loadQuickPresetsFromStorage()
  } catch (err) {
    console.warn('Failed to load quick presets from storage', err)
    return DEFAULT_QUICK_PRESETS
  }
})()

const ensureUniquePresetName = (name: string, presets: QuickPreset[], excludeId?: string): string => {
  const base = name.trim() || 'Preset'
  const existing = new Set(presets.filter(p => p.id !== excludeId).map(p => p.name))
  if (!existing.has(base)) return base
  let index = 2
  while (existing.has(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

const toNumber = (value: unknown, fallback: number): number => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const normalizePoint = (point: any, fallback: { x: number; y: number }): { x: number; y: number } => {
  if (!point || typeof point !== 'object') return { ...fallback }
  return {
    x: toNumber(point.x, fallback.x),
    y: toNumber(point.y, fallback.y),
  }
}

const normalizeSize = (size: any, fallback: { width: number; height: number }): { width: number; height: number } => {
  if (!size || typeof size !== 'object') return { ...fallback }
  const width = Math.max(1, toNumber(size.width, fallback.width))
  const height = Math.max(1, toNumber(size.height, fallback.height))
  return { width, height }
}

const normalizeMarkup = (value: any): CanvasMarkup | null => {
  if (!value || typeof value !== 'object') return null
  const type = value.type
  const id = typeof value.id === 'string' ? value.id : genId('markup_')
  const zIndex = Number.isFinite(value.zIndex) ? Number(value.zIndex) : undefined
  const locked = value.locked === true

  if (type === 'text') {
    const position = normalizePoint(value.position, { x: 160, y: 160 })
    const color = typeof value.color === 'string' ? value.color : '#0f172a'
    const text = typeof value.text === 'string' ? value.text : 'Text'
    const fontSize = Math.max(6, toNumber(value.fontSize, 18))
    const isBold = value.isBold === true
    const backgroundColor = typeof value.backgroundColor === 'string' ? value.backgroundColor : null
    const size = value.size ? normalizeSize(value.size, { width: 220, height: fontSize * 1.4 }) : undefined
    return {
      id,
      type: 'text',
      position,
      size,
      text,
      color,
      fontSize,
      isBold,
      backgroundColor,
      zIndex,
      locked,
    }
  }

  if (type === 'line') {
    const start = normalizePoint(value.start, { x: 200, y: 200 })
    const end = normalizePoint(value.end, { x: start.x + 180, y: start.y })
    const color = typeof value.color === 'string' ? value.color : '#1e293b'
    const thickness = Math.max(1, toNumber(value.thickness, 2))
    const isDashed = value.isDashed === true
    const arrowHead = value.arrowHead === 'end' ? 'end' : 'none'
    return {
      id,
      type: 'line',
      start,
      end,
      color,
      thickness,
      isDashed,
      arrowHead,
      zIndex,
      locked,
    }
  }

  if (type === 'rectangle') {
    const position = normalizePoint(value.position, { x: 220, y: 220 })
    const size = normalizeSize(value.size, { width: 240, height: 160 })
    const strokeColor = typeof value.strokeColor === 'string' ? value.strokeColor : '#0f172a'
    const thickness = Math.max(1, toNumber(value.thickness, 2))
    const isDashed = value.isDashed === true
    const fillColor = typeof value.fillColor === 'string' ? value.fillColor : null
    const rawOpacity = Number(value.fillOpacity)
    const fillOpacity = Number.isFinite(rawOpacity) ? Math.min(1, Math.max(0, rawOpacity)) : 0.18
    const cornerRadius = Math.max(0, toNumber(value.cornerRadius, 0))
    return {
      id,
      type: 'rectangle',
      position,
      size,
      strokeColor,
      thickness,
      isDashed,
      fillColor,
      fillOpacity,
      cornerRadius,
      zIndex,
      locked,
    }
  }

  return null
}

const ensureMarkupsInitialized = (project: Project): CanvasMarkup[] => {
  if (!Array.isArray(project.markups)) {
    project.markups = []
  }
  return project.markups
}

const normalizeProject = (project: Project): Project => {
  const clone = JSON.parse(JSON.stringify(project)) as Project
  const sourceMarkups = Array.isArray(clone.markups)
    ? clone.markups
    : Array.isArray(project.markups)
    ? project.markups
    : []
  const normalizedMarkups = Array.isArray(sourceMarkups)
    ? sourceMarkups
        .map(normalizeMarkup)
        .filter((markup): markup is CanvasMarkup => markup !== null)
    : []
  clone.markups = normalizedMarkups
  return clone
}

const snapshotProject = (project: Project): Project => normalizeProject(project)

const saved = (() => {
  const raw = loadAutosave()
  return raw ? normalizeProject(raw) : null
})()

export const useStore = create<State>((set,get)=>({
  project: saved ?? normalizeProject(sampleProject),
  importedFileName: null,
  clipboard: null,
  past: [],
  future: [],
  quickPresets: storedQuickPresets,
  setProject: (p) => {
    const prev = snapshotProject(get().project)
    const importedQuickPresets = Array.isArray((p as any).quickPresets) ? (p as any).quickPresets as QuickPreset[] : null
    const nextProjectRaw = JSON.parse(JSON.stringify(p)) as Project
    if ('quickPresets' in nextProjectRaw) {
      delete (nextProjectRaw as any).quickPresets
    }
    const nextProject = normalizeProject(nextProjectRaw)
    set(state=>({ past:[...state.past, prev], future: [] }))
    set({project:nextProject})
    autosave(nextProject)
    if (importedQuickPresets) {
      get().importQuickPresets(importedQuickPresets, 'replace')
    }
  },
  setImportedFileName: (name) => { set({ importedFileName: name }) },
  addNode: (n) => { const p=get().project; ensureMarkupsInitialized(p); const prev = snapshotProject(p); set(state=>({ past:[...state.past, prev], future: [] })); p.nodes=[...p.nodes,n]; set({project:{...p}}); autosave(get().project) },
  addEdge: (e) => { const p=get().project; ensureMarkupsInitialized(p); if (p.edges.some(x=>x.from===e.from && x.to===e.to)) return; const prev = snapshotProject(p); set(state=>({ past:[...state.past, prev], future: [] })); p.edges=[...p.edges,e]; set({project:{...p}}); autosave(get().project) },
  updateNode: (id, patch) => { const p=get().project; ensureMarkupsInitialized(p); const prev = snapshotProject(p); set(state=>({ past:[...state.past, prev], future: [] })); p.nodes=p.nodes.map(n=>n.id===id? ({...n, ...patch} as AnyNode):n) as AnyNode[]; set({project:{...p}}); autosave(get().project) },
  updateEdge: (id, patch) => { const p=get().project; ensureMarkupsInitialized(p); const prev = snapshotProject(p); set(state=>({ past:[...state.past, prev], future: [] })); p.edges=p.edges.map(e=>e.id===id? {...e, ...patch}:e); set({project:{...p}}); autosave(get().project) },
  setScenario: (s) => { const p=get().project; ensureMarkupsInitialized(p); const prev = snapshotProject(p); set(state=>({ past:[...state.past, prev], future: [] })); p.currentScenario=s; set({project:{...p}}); autosave(get().project) },
  updateNodePos: (id, x, y) => { const p=get().project; ensureMarkupsInitialized(p); const prev = snapshotProject(p); set(state=>({ past:[...state.past, prev], future: [] })); p.nodes=p.nodes.map(n=>n.id===id? ({...n, x, y} as AnyNode):n) as AnyNode[]; set({project:{...p}}); autosave(get().project) },
  removeNode: (id) => { const p=get().project; ensureMarkupsInitialized(p); const prev = snapshotProject(p); set(state=>({ past:[...state.past, prev], future: [] })); p.nodes=p.nodes.filter(n=>n.id!==id) as AnyNode[]; p.edges=p.edges.filter(e=>e.from!==id && e.to!==id); set({project:{...p}}); autosave(get().project) },
  removeEdge: (id) => { const p=get().project; ensureMarkupsInitialized(p); const prev = snapshotProject(p); set(state=>({ past:[...state.past, prev], future: [] })); p.edges=p.edges.filter(e=>e.id!==id); set({project:{...p}}); autosave(get().project) }
  ,addMarkup: (markup) => {
    const project = get().project
    ensureMarkupsInitialized(project)
    const candidate = normalizeMarkup(markup)
    if (!candidate) return
    const existingIds = new Set((project.markups || []).map(m => m.id))
    let finalMarkup = candidate
    if (existingIds.has(candidate.id)) {
      let nextId = genId('markup_')
      while (existingIds.has(nextId)) {
        nextId = genId('markup_')
      }
      finalMarkup = { ...candidate, id: nextId }
    }
    const prev = snapshotProject(project)
    set(state => ({ past: [...state.past, prev], future: [] }))
    const markups = [...(project.markups || []), finalMarkup]
    const nextProject = { ...project, markups }
    set({ project: nextProject })
    autosave(nextProject)
  }
  ,updateMarkup: (id, updater) => {
    const project = get().project
    ensureMarkupsInitialized(project)
    const markups = project.markups || []
    const index = markups.findIndex(m => m.id === id)
    if (index === -1) return
    const current = markups[index]
    const updatedCandidate = updater(current)
    const normalized = normalizeMarkup({ ...updatedCandidate, id })
    if (!normalized) return
    const prev = snapshotProject(project)
    set(state => ({ past: [...state.past, prev], future: [] }))
    const nextMarkups = [...markups]
    nextMarkups[index] = { ...normalized, id }
    const nextProject = { ...project, markups: nextMarkups }
    set({ project: nextProject })
    autosave(nextProject)
  }
  ,removeMarkup: (id) => {
    const project = get().project
    ensureMarkupsInitialized(project)
    const markups = project.markups || []
    if (!markups.some(m => m.id === id)) return
    const prev = snapshotProject(project)
    set(state => ({ past: [...state.past, prev], future: [] }))
    const nextMarkups = markups.filter(m => m.id !== id)
    const nextProject = { ...project, markups: nextMarkups }
    set({ project: nextProject })
    autosave(nextProject)
  }
  ,reorderMarkups: (updater) => {
    const project = get().project
    ensureMarkupsInitialized(project)
    const currentMarkups = [...(project.markups || [])]
    const result = updater([...currentMarkups])
    if (!Array.isArray(result)) return
    const normalized = result
      .map(markup => normalizeMarkup(markup))
      .filter((markup): markup is CanvasMarkup => markup !== null)
    const seen = new Set<string>()
    const deduped: CanvasMarkup[] = normalized.map(markup => {
      let nextId = markup.id
      while (seen.has(nextId)) {
        nextId = genId('markup_')
      }
      seen.add(nextId)
      return { ...markup, id: nextId }
    })
    const prev = snapshotProject(project)
    set(state => ({ past: [...state.past, prev], future: [] }))
    const nextProject = { ...project, markups: deduped }
    set({ project: nextProject })
    autosave(nextProject)
  }
  ,setClipboard: (payload) => { set({ clipboard: payload }) }
  ,undo: () => {
    const { past, project, future } = get()
    if (past.length === 0) return
    const previousSnapshot = snapshotProject(past[past.length - 1])
    const currentSnapshot = snapshotProject(project)
    set({ past: past.slice(0, -1), future: [...future, currentSnapshot], project: previousSnapshot })
    autosave(previousSnapshot)
  }
  ,redo: () => {
    const { past, project, future } = get()
    if (future.length === 0) return
    const nextSnapshot = snapshotProject(future[future.length - 1])
    const currentSnapshot = snapshotProject(project)
    set({ past: [...past, currentSnapshot], future: future.slice(0, -1), project: nextSnapshot })
    autosave(nextSnapshot)
  }
  ,autoAlign: (options) => {
    const project = get().project
    ensureMarkupsInitialized(project)
    const prev = snapshotProject(project)
    set(state => ({ past: [...state.past, prev], future: [] }))
    const { nodes, edges } = autoLayoutProject(project, options)
    const next: Project = { ...project, nodes, edges }
    set({ project: next })
    autosave(next)
  }
  ,updateSubsystemProject: (subsystemId, updater) => {
    const p=get().project
    ensureMarkupsInitialized(p)
    const prev = snapshotProject(p); set(state=>({ past:[...state.past, prev], future: [] }));
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
    ensureMarkupsInitialized(root)
    const prev = snapshotProject(root); set(state=>({ past:[...state.past, prev], future: [] }));
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
  },
  addQuickPreset: (preset) => {
    set(state => {
      const name = ensureUniquePresetName(preset.name, state.quickPresets)
      const nextPreset: QuickPreset = {
        ...preset,
        name,
        updatedAt: new Date().toISOString(),
      }
      const next = [...state.quickPresets, nextPreset]
      persistQuickPresetsToStorage(next)
      return { quickPresets: next }
    })
  },
  updateQuickPreset: (id, patch) => {
    set(state => {
      const index = state.quickPresets.findIndex(p => p.id === id)
      if (index === -1) return {}
      const presets = [...state.quickPresets]
      const current = presets[index]
      const nextName = patch.name ? ensureUniquePresetName(patch.name, presets, id) : current.name
      const nextPreset: QuickPreset = {
        ...current,
        ...patch,
        name: nextName,
        description: patch.description === undefined ? current.description : patch.description || undefined,
        accentColor: patch.accentColor === undefined ? current.accentColor : (patch.accentColor || undefined),
        node: patch.node ?? current.node,
        updatedAt: new Date().toISOString(),
      }
      presets[index] = nextPreset
      persistQuickPresetsToStorage(presets)
      return { quickPresets: presets }
    })
  },
  removeQuickPreset: (id) => {
    set(state => {
      const next = state.quickPresets.filter(p => p.id !== id)
      persistQuickPresetsToStorage(next)
      return { quickPresets: next }
    })
  },
  duplicateQuickPreset: (id) => {
    const state = get()
    const preset = state.quickPresets.find(p => p.id === id)
    if (!preset) return
    const now = new Date().toISOString()
    const copy: QuickPreset = {
      ...preset,
      id: genId('qp_'),
      name: ensureUniquePresetName(`${preset.name} Copy`, state.quickPresets),
      createdAt: now,
      updatedAt: now,
    }
    set(inner => {
      const next = [...inner.quickPresets, copy]
      persistQuickPresetsToStorage(next)
      return { quickPresets: next }
    })
  },
  reorderQuickPresets: (sourceIndex, targetIndex) => {
    set(state => {
      if (sourceIndex === targetIndex) return {}
      const next = [...state.quickPresets]
      if (sourceIndex < 0 || sourceIndex >= next.length) return {}
      const [removed] = next.splice(sourceIndex, 1)
      if (!removed) return {}
      const clamped = Math.min(Math.max(targetIndex, 0), next.length)
      next.splice(clamped, 0, removed)
      persistQuickPresetsToStorage(next)
      return { quickPresets: next }
    })
  },
  resetQuickPresets: () => {
    const now = new Date().toISOString()
    const defaults = DEFAULT_QUICK_PRESETS.map(preset => ({
      ...preset,
      id: genId('qp_'),
      createdAt: now,
      updatedAt: now,
    }))
    persistQuickPresetsToStorage(defaults)
    set({ quickPresets: defaults })
  },
  importQuickPresets: (presets, mode) => {
    set(state => {
      const now = new Date().toISOString()
      const normalized = resetQuickPresetIds(presets).map(preset => ({
        ...preset,
        createdAt: preset.createdAt || now,
        updatedAt: now,
      }))
      let next: QuickPreset[]
      if (mode === 'replace') {
        next = normalized.map(preset => ({
          ...preset,
          name: ensureUniquePresetName(preset.name, []),
        }))
      } else {
        next = [...state.quickPresets]
        for (const preset of normalized) {
          const name = ensureUniquePresetName(preset.name, next)
          next.push({ ...preset, name })
        }
      }
      persistQuickPresetsToStorage(next)
      return { quickPresets: next }
    })
  },
  applyQuickPreset: (id, position) => {
    const preset = get().quickPresets.find(p => p.id === id)
    if (!preset) return null
    const node = materializeQuickPreset(preset, position)
    get().addNode(node)
    return node
  },
  captureQuickPresetFromNode: (node, meta) => {
    const preset = createQuickPresetFromNode(node, meta)
    get().addQuickPreset(preset)
    return preset
  }
}))
