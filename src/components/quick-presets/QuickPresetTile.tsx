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
      className="w-full text-left px-3 py-2 border flex flex-col gap-1"
      style={{ borderColor: accent, background: `${accent}20`, color: '#0f172a' }}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      title={preset.description || preset.name}
    >
      <span className="text-sm font-semibold">{preset.name}</span>
      {preset.description && <span className="text-xs text-slate-600 truncate">{preset.description}</span>}
      {!preset.description && <span className="text-xs text-slate-400">{preset.nodeType}</span>}
    </Button>
  )
}


