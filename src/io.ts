import YAML from 'yaml'
import { Project } from './models'

const AUTOSAVE_KEY = 'powertree_autosave_v1'

export type ProjectFileFormat = 'yaml' | 'json'

const DEFAULT_EXPORT_FORMAT: ProjectFileFormat = 'yaml'
const DEFAULT_EXPORT_MIME = 'text/yaml'
const DEFAULT_EXPORT_EXTENSION = '.yaml'

type DownloadOptions = {
  mime?: string
  extension?: string
}

type NormalizedDownloadOptions = {
  mime: string
  extension?: string
}

function ensureLeadingDot(ext: string): string {
  return ext.startsWith('.') ? ext : `.${ext}`
}

function getExtension(name: string): string | undefined {
  const match = /\.[^./\\]+$/.exec(name)
  return match ? match[0] : undefined
}

function normalizeDownloadOptions(options?: DownloadOptions | string): NormalizedDownloadOptions {
  if (typeof options === 'string') {
    return { mime: options }
  }
  return {
    mime: options?.mime ?? DEFAULT_EXPORT_MIME,
    extension: options?.extension
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project
}

export function autosave(project: Project){
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project))
}

export function loadAutosave(): Project | null {
  const s = localStorage.getItem(AUTOSAVE_KEY)
  return s ? JSON.parse(s) : null
}

export function download(filename: string, content: BlobPart, options?: DownloadOptions | string){
  const { mime, extension } = normalizeDownloadOptions(options)
  const existingExtension = getExtension(filename)
  const resolvedExtension = existingExtension ?? (extension ? ensureLeadingDot(extension) : (mime === DEFAULT_EXPORT_MIME ? DEFAULT_EXPORT_EXTENSION : undefined))
  const suggestedName = existingExtension ? filename : (resolvedExtension ? filename + resolvedExtension : filename)

  const fallback = () => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = suggestedName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const savePicker: any = (window as any).showSaveFilePicker
  if (typeof savePicker === 'function'){
    void (async () => {
      try {
        const pickerExtension = getExtension(suggestedName) ?? resolvedExtension
        const types = pickerExtension ? [
          { description: `${pickerExtension.toUpperCase().slice(1)} file`, accept: { [mime]: [pickerExtension] } }
        ] : undefined
        const handle = await savePicker({ suggestedName, types })
        const writable = await handle.createWritable()
        await writable.write(new Blob([content], { type: mime }))
        await writable.close()
      } catch (err:any) {
        if (err && err.name === 'AbortError') return
        fallback()
      }
    })()
    return
  }

  fallback()
}

export function serializeProject(project: Project, format: ProjectFileFormat = DEFAULT_EXPORT_FORMAT): string {
  const sanitized = sanitizeProject(project)
  if (format === 'yaml'){
    return YAML.stringify(sanitized)
  }
  return JSON.stringify(sanitized, null, 2)
}

export function parseProjectText(text: string): Project {
  const trimmed = text.trim()
  if (!trimmed)
    throw new Error('File is empty')
  try {
    const data = JSON.parse(trimmed)
    if (!isRecord(data))
      throw new Error('Project file must define an object at the top level')
    return data as Project
  } catch (jsonError) {
    try {
      const data = YAML.parse(trimmed)
      if (!isRecord(data))
        throw new Error('Project file must define an object at the top level')
      return data as Project
    } catch (yamlError) {
      const message = yamlError instanceof Error ? yamlError.message : String(yamlError)
      const err = new Error(`Unable to parse project file: ${message}`)
      ;(err as any).cause = yamlError
      ;(err as any).jsonError = jsonError
      throw err
    }
  }
}

export async function importProjectFile(file: File): Promise<Project>{
  const text = await file.text()
  return parseProjectText(text)
}
