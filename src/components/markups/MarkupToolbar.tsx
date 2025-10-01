import React from 'react'
import { MarkupTool } from './MarkupLayer'
import { Button } from '../ui/button'
import type { SelectionMode } from '../../types/selection'

type MarkupToolbarProps = {
  activeTool: MarkupTool | null
  selectionMode: SelectionMode
  onSelectTool: (tool: MarkupTool | null) => void
  onSelectionModeChange: (mode: SelectionMode) => void
}

const TOOL_DEFINITIONS: { type: MarkupTool; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'line', label: 'Line' },
  { type: 'rectangle', label: 'Box' },
]

const MarkupToolbar: React.FC<MarkupToolbarProps> = ({
  activeTool,
  selectionMode,
  onSelectTool,
  onSelectionModeChange,
}) => {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant={selectionMode === 'single' && activeTool === null ? 'default' : 'outline'}
        size="xs"
        onClick={() => {
          onSelectionModeChange('single')
          onSelectTool(null)
        }}
      >
        Select
      </Button>
      <Button
        variant={selectionMode === 'multi' ? 'default' : 'outline'}
        size="xs"
        onClick={() => {
          const nextMode = selectionMode === 'multi' ? 'single' : 'multi'
          onSelectionModeChange(nextMode)
          if (nextMode === 'multi') {
            onSelectTool(null)
          }
        }}
      >
        Multi-Select
      </Button>
      <span className="h-6 w-px bg-slate-300 mx-1" aria-hidden="true" />
      {TOOL_DEFINITIONS.map(tool => (
        <Button
          key={tool.type}
          variant={activeTool === tool.type ? 'default' : 'outline'}
          size="xs"
          onClick={() => {
            onSelectTool(activeTool === tool.type ? null : tool.type)
            onSelectionModeChange(activeTool === tool.type ? selectionMode : 'single')
          }}
        >
          {tool.label}
        </Button>
      ))}
    </div>
  )
}

export default MarkupToolbar
