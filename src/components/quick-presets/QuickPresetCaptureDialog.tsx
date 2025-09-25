import React from 'react'
import type { AnyNode } from '../../models'
import { Button } from '../ui/button'
import { useStore } from '../../state/store'
import { defaultQuickPresetColor, sanitizeNodeForPreset } from '../../utils/quickPresets'

type QuickPresetCaptureDialogProps = {
  isOpen: boolean
  node: AnyNode
  presetId?: string
  onClose: () => void
}

const fallbackColor = '#3b82f6'

export default function QuickPresetCaptureDialog({ isOpen, node, presetId, onClose }: QuickPresetCaptureDialogProps) {
  const captureQuickPreset = useStore(state => state.captureQuickPresetFromNode)
  const updateQuickPreset = useStore(state => state.updateQuickPreset)
  const existingPreset = useStore(React.useCallback(state => (presetId ? state.quickPresets.find(p => p.id === presetId) ?? null : null), [presetId]))

  const [name, setName] = React.useState(existingPreset?.name ?? node.name ?? node.type)
  const [description, setDescription] = React.useState(existingPreset?.description ?? '')
  const [accentColor, setAccentColor] = React.useState(existingPreset?.accentColor ?? defaultQuickPresetColor(node.type) ?? fallbackColor)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setName(existingPreset?.name ?? node.name ?? node.type)
    setDescription(existingPreset?.description ?? '')
    setAccentColor(existingPreset?.accentColor ?? defaultQuickPresetColor(node.type) ?? fallbackColor)
    setError(null)
  }, [existingPreset, node])

  if (!isOpen) return null

  const onSubmit = () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Name is required.')
      return
    }
    const trimmedDescription = description.trim()
    const normalizedAccent = accentColor && /^#[0-9a-fA-F]{6}$/.test(accentColor.trim()) ? accentColor.trim() : null
    try {
      if (presetId && existingPreset) {
        updateQuickPreset(presetId, {
          name: trimmedName,
          description: trimmedDescription || undefined,
          accentColor: normalizedAccent,
          node: sanitizeNodeForPreset(node),
        })
      } else {
        captureQuickPreset(node, {
          name: trimmedName,
          description: trimmedDescription || undefined,
          accentColor: normalizedAccent ?? undefined,
        })
      }
      onClose()
    } catch (err) {
      console.error('Failed to save quick preset', err)
      setError(err instanceof Error ? err.message : 'Unable to save quick preset.')
    }
  }

  const title = presetId ? 'Update Quick Preset' : 'Save Quick Preset'

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-lg">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="text-lg font-semibold text-slate-900">{title}</div>
            <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          </div>
          <div className="p-4 space-y-4 text-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Node Type</label>
              <div className="text-slate-700 font-medium">{node.type}</div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1" htmlFor="qp-name">Preset Name</label>
              <input
                id="qp-name"
                className="input w-full"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter preset name"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1" htmlFor="qp-desc">Description</label>
              <textarea
                id="qp-desc"
                className="input w-full"
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional details"
              />
            </div>
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Accent Color</label>
                <input
                  type="color"
                  className="h-10 w-16 rounded border border-slate-300"
                  value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : fallbackColor}
                  onChange={e => setAccentColor(e.target.value)}
                />
              </div>
              <Button size="sm" variant="outline" onClick={() => setAccentColor(defaultQuickPresetColor(node.type) ?? fallbackColor)}>Reset</Button>
              <Button size="sm" variant="outline" onClick={() => setAccentColor('')}>Clear</Button>
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
          </div>
          <div className="px-4 py-3 border-t flex items-center justify-end gap-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="success" onClick={onSubmit}>{presetId ? 'Update Preset' : 'Create Preset'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}


