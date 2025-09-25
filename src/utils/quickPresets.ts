import YAML from 'yaml'
import { genId } from '../utils'
import type { AnyNode, NodeType, Project } from '../models'
import { createNodePreset } from './nodePresets'

export type SanitizedNodeSnapshot = Omit<AnyNode, 'id' | 'x' | 'y'> & { type: NodeType }

export type QuickPresetSource = {
  type: 'user' | 'default'
  variantId?: string
}

export type QuickPreset = {
  id: string
  name: string
  description?: string
  node: SanitizedNodeSnapshot
  nodeType: NodeType
  accentColor?: string
  createdAt: string
  updatedAt: string
  source: QuickPresetSource
}

export type QuickPresetCollectionFile = {
  version: number
  presets: QuickPreset[]
}

export const QUICK_PRESET_STORAGE_KEY = 'powertree_quick_presets_v1'
export const QUICK_PRESET_MIME = 'application/x-powertree-quick-preset'

const DEFAULT_COLORS: Partial<Record<NodeType, string>> = {
  Source: '#22c55e',
  Converter: '#3b82f6',
  DualOutputConverter: '#0ea5e9',
  Load: '#fb923c',
  Bus: '#64748b',
  Note: '#94a3b8',
  Subsystem: '#a855f7',
  SubsystemInput: '#475569',
}

export const defaultQuickPresetColor = (type: NodeType): string | undefined => DEFAULT_COLORS[type]

function cloneNode<T extends AnyNode>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T
}

export function sanitizeNodeForPreset(node: AnyNode): SanitizedNodeSnapshot {
  const clone = cloneNode(node)
  delete (clone as Partial<AnyNode>).id
  delete (clone as Partial<AnyNode>).x
  delete (clone as Partial<AnyNode>).y
  if ('warnings' in clone) delete (clone as any).warnings
  if ('notes' in clone && (clone as any).notes === undefined) delete (clone as any).notes
  return clone as SanitizedNodeSnapshot
}

export function materializeQuickPreset(preset: QuickPreset, position?: { x: number; y: number }): AnyNode {
  const clone = cloneNode(preset.node) as AnyNode
  ;(clone as AnyNode).id = genId('n_')
  ;(clone as AnyNode).x = position?.x ?? 80
  ;(clone as AnyNode).y = position?.y ?? 80
  return clone
}

export function createQuickPresetFromNode(node: AnyNode, meta?: Partial<Pick<QuickPreset, 'name' | 'description' | 'accentColor' | 'source'>>): QuickPreset {
  const now = new Date().toISOString()
  const sanitized = sanitizeNodeForPreset(node)
  return {
    id: genId('qp_'),
    name: meta?.name?.trim() || node.name || node.type,
    description: meta?.description,
    node: sanitized,
    nodeType: node.type,
    accentColor: meta?.accentColor ?? defaultQuickPresetColor(node.type),
    createdAt: now,
    updatedAt: now,
    source: meta?.source ?? { type: 'user' },
  }
}

function buildDefaultPreset(descriptor: Parameters<typeof createNodePreset>[0], overrides?: Partial<QuickPreset>): QuickPreset {
  const node = createNodePreset(descriptor as any)
  return {
    ...createQuickPresetFromNode(node, {
      source: { type: 'default', variantId: descriptor.variant as string | undefined },
    }),
    ...overrides,
  }
}

export const DEFAULT_QUICK_PRESETS: QuickPreset[] = [
  buildDefaultPreset({ type: 'Source' }, { name: '48V Source' }),
  buildDefaultPreset({ type: 'Converter' }, { name: '12V Buck 95%' }),
  buildDefaultPreset({ type: 'Converter', variant: 'vrm-0p9-92' }, { name: 'VRM 0.9V 92%' }),
  buildDefaultPreset({ type: 'DualOutputConverter', variant: 'dual-default' }, { name: 'Dual-output default' }),
]

function getLocalStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null
  const ls = (globalThis as any).localStorage as Storage | undefined
  return ls ?? null
}

export function loadQuickPresetsFromStorage(): QuickPreset[] {
  const localStorage = getLocalStorage()
  if (!localStorage) return DEFAULT_QUICK_PRESETS
  try {
    const raw = localStorage.getItem(QUICK_PRESET_STORAGE_KEY)
    if (!raw) return DEFAULT_QUICK_PRESETS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_QUICK_PRESETS
    const valid = parsed.filter(isQuickPreset)
    return valid.length ? valid : DEFAULT_QUICK_PRESETS
  } catch (err) {
    console.warn('Failed to load quick presets from storage', err)
    return DEFAULT_QUICK_PRESETS
  }
}

export function persistQuickPresetsToStorage(presets: QuickPreset[]): void {
  const localStorage = getLocalStorage()
  if (!localStorage) return
  try {
    localStorage.setItem(QUICK_PRESET_STORAGE_KEY, JSON.stringify(presets))
  } catch (err) {
    console.warn('Failed to persist quick presets to storage', err)
  }
}

export function isQuickPreset(value: unknown): value is QuickPreset {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string') return false
  if (typeof record.name !== 'string') return false
  if (typeof record.nodeType !== 'string') return false
  if (!record.node || typeof record.node !== 'object') return false
  if (typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') return false
  return true
}

export type QuickPresetDragPayload = {
  presetId: string
}

export function buildQuickPresetDragData(payload: QuickPresetDragPayload): string {
  return JSON.stringify(payload)
}

export function parseQuickPresetDragData(raw: string | null): QuickPresetDragPayload | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.presetId === 'string') return parsed as QuickPresetDragPayload
    return null
  } catch (err) {
    return null
  }
}

export function dataTransferHasQuickPreset(dt: DataTransfer | null): boolean {
  if (!dt) return false
  try {
    const types = Array.from(dt.types as unknown as string[])
    if (types.includes(QUICK_PRESET_MIME)) return true
  } catch (_err) {
    // Fallback for older browsers
  }
  try {
    return Boolean(dt.getData(QUICK_PRESET_MIME))
  } catch (_err) {
    return false
  }
}

export function readQuickPresetDragPayload(dt: DataTransfer | null): QuickPresetDragPayload | null {
  if (!dt) return null
  try {
    return parseQuickPresetDragData(dt.getData(QUICK_PRESET_MIME))
  } catch (_err) {
    return null
  }
}

export function serializeQuickPresetsToYaml(presets: QuickPreset[], options?: { includeDefaults?: boolean }): string {
  const includeDefaults = options?.includeDefaults ?? true
  const sourcePresets = includeDefaults
    ? presets
    : presets.filter(preset => preset.source.type !== 'default')
  const payload: QuickPresetCollectionFile = {
    version: 1,
    presets: sourcePresets,
  }
  return YAML.stringify(payload)
}

export function parseQuickPresetsYaml(text: string): QuickPresetCollectionFile {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('File is empty')
  }
  const parsed = YAML.parse(trimmed)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid quick preset file format')
  }
  const record = parsed as Record<string, unknown>
  const version = Number(record.version)
  if (!Number.isFinite(version) || version !== 1) {
    throw new Error('Unsupported quick preset file version')
  }
  const presets = Array.isArray(record.presets) ? record.presets.filter(isQuickPreset) : []
  return {
    version: 1,
    presets,
  }
}

export function resetQuickPresetIds(presets: QuickPreset[]): QuickPreset[] {
  return presets.map(preset => ({
    ...preset,
    id: genId('qp_'),
  }))
}

export function sanitizePresetNodeProject(project: Project | undefined): Project | undefined {
  if (!project) return project
  const cloned = JSON.parse(JSON.stringify(project)) as Project
  return cloned
}


