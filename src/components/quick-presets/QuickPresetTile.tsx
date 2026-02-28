import React from 'react'
import type { QuickPreset } from '../../utils/quickPresets'
import { Button } from '../ui/button'

type QuickPresetTileProps = {
  preset: QuickPreset
  onClick: () => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void
}

const fallbackAccent = '#64748b'

export default function QuickPresetTile({ preset, onClick, onDragStart }: QuickPresetTileProps) {
  const accent = preset.accentColor ?? fallbackAccent
  return (
    <Button
      variant="outline"
      className="flex w-full min-w-0 flex-col items-stretch gap-1 overflow-hidden border px-3 py-2 text-left"
      style={{ borderColor: accent, background: `${accent}20`, color: '#0f172a' }}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      title={preset.description || preset.name}
    >
      <span className="block w-full truncate text-sm font-semibold">{preset.name}</span>
      {preset.description && <span className="block w-full truncate text-xs text-slate-600">{preset.description}</span>}
      {!preset.description && <span className="block w-full truncate text-xs text-slate-400">{preset.nodeType}</span>}
    </Button>
  )
}

