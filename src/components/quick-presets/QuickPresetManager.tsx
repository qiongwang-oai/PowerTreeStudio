import React from 'react'
import { useStore } from '../../state/store'
import type { QuickPreset } from '../../utils/quickPresets'
import { Button } from '../ui/button'
import { parseQuickPresetsYaml, serializeQuickPresetsToYaml } from '../../utils/quickPresets'
import { download } from '../../io'

type QuickPresetManagerProps = {
  isOpen: boolean
  onClose: () => void
  onCaptureFromSelection: (presetId?: string) => void
  focusPresetId?: string | null
}

const yamlMime = 'text/yaml'

export default function QuickPresetManager({ isOpen, onClose, onCaptureFromSelection, focusPresetId }: QuickPresetManagerProps) {
  const quickPresets = useStore(state => state.quickPresets)
  const updateQuickPreset = useStore(state => state.updateQuickPreset)
  const removeQuickPreset = useStore(state => state.removeQuickPreset)
  const duplicateQuickPreset = useStore(state => state.duplicateQuickPreset)
  const reorderQuickPresets = useStore(state => state.reorderQuickPresets)
  const resetQuickPresets = useStore(state => state.resetQuickPresets)
  const importQuickPresets = useStore(state => state.importQuickPresets)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [includeDefaults, setIncludeDefaults] = React.useState(true)

  React.useEffect(() => {
    if (!isOpen) return
    if (!focusPresetId) return
    const element = document.getElementById(`quick-preset-row-${focusPresetId}`)
    if (element) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' })
      element.classList.add('ring-2', 'ring-sky-400')
      setTimeout(() => element.classList.remove('ring-2', 'ring-sky-400'), 1000)
    }
  }, [isOpen, focusPresetId])

  if (!isOpen) return null

  const handleNameBlur = (preset: QuickPreset, value: string) => {
    const trimmed = value.trim()
    if (!trimmed || trimmed === preset.name) return
    updateQuickPreset(preset.id, { name: trimmed })
  }

  const handleDescriptionBlur = (preset: QuickPreset, value: string) => {
    const normalized = value.trim()
    const current = preset.description ?? ''
    if (normalized === current.trim()) return
    updateQuickPreset(preset.id, { description: normalized || undefined })
  }

  const handleAccentChange = (preset: QuickPreset, value: string) => {
    updateQuickPreset(preset.id, { accentColor: value })
  }

  const handleExport = () => {
    const yaml = serializeQuickPresetsToYaml(quickPresets, { includeDefaults })
    download('powertree-presets', yaml, { mime: yamlMime, extension: '.yaml' })
  }

  const handleImport = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseQuickPresetsYaml(text)
      const replace = window.confirm('Replace existing quick presets with the imported file? Click “Cancel” to merge instead.')
      importQuickPresets(parsed.presets, replace ? 'replace' : 'merge')
      onClose()
    } catch (err) {
      console.error('Failed to import quick presets', err)
      window.alert(err instanceof Error ? err.message : 'Unable to import presets.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const movePreset = (index: number, delta: number) => {
    const target = index + delta
    reorderQuickPresets(index, target)
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-start justify-center overflow-auto p-6">
        <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-4xl">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-900">Quick Preset Manager</div>
              <div className="text-xs text-slate-500">{quickPresets.length} preset{quickPresets.length === 1 ? '' : 's'}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onCaptureFromSelection()}>New from selection</Button>
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => resetQuickPresets()}>Reset to defaults</Button>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>Import YAML</Button>
              <Button variant="outline" size="sm" onClick={handleExport}>Export YAML</Button>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={includeDefaults} onChange={e => setIncludeDefaults(e.target.checked)} /> Include defaults when exporting
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".yaml,.yml,text/yaml,application/x-yaml"
                className="hidden"
                onChange={e => handleImport(e.target.files)}
              />
            </div>
            <div className="space-y-3">
              {quickPresets.map((preset, index) => (
                <div
                  key={preset.id}
                  id={`quick-preset-row-${preset.id}`}
                  className="border rounded-lg p-3 shadow-sm bg-white"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-3 w-3 rounded-full" style={{ background: preset.accentColor || '#cbd5f5' }} aria-hidden />
                      <input
                        className="input text-sm font-medium"
                        defaultValue={preset.name}
                        onBlur={e => handleNameBlur(preset, e.target.value)}
                      />
                      <span className="text-xs text-slate-500 uppercase tracking-wide">{preset.nodeType}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => movePreset(index, -1)} disabled={index === 0}>↑</Button>
                      <Button size="sm" variant="outline" onClick={() => movePreset(index, 1)} disabled={index === quickPresets.length - 1}>↓</Button>
                      <Button size="sm" variant="outline" onClick={() => duplicateQuickPreset(preset.id)}>Duplicate</Button>
                      <Button size="sm" variant="outline" onClick={() => onCaptureFromSelection(preset.id)}>Update from selection</Button>
                      <Button size="sm" variant="danger" onClick={() => removeQuickPreset(preset.id)}>Delete</Button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Description</label>
                      <textarea
                        className="input w-full"
                        rows={2}
                        defaultValue={preset.description ?? ''}
                        onBlur={e => handleDescriptionBlur(preset, e.target.value)}
                        placeholder="Optional details shown in tooltips"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Accent Color</label>
                        <input
                          type="color"
                          className="h-10 w-16 rounded border border-slate-300"
                          value={preset.accentColor || '#3b82f6'}
                          onChange={e => handleAccentChange(preset, e.target.value)}
                        />
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleAccentChange(preset, '')}>Clear</Button>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-400 flex items-center justify-between">
                    <span>Created {new Date(preset.createdAt).toLocaleString()}</span>
                    <span>Updated {new Date(preset.updatedAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
              {quickPresets.length === 0 && (
                <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center text-sm text-slate-500">
                  No quick presets yet. Select a node and choose “Save as quick preset…” to get started.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


