import React from 'react'
import { MarkupTool } from './MarkupLayer'
import { Button } from '../ui/button'
import { Tooltip } from '../ui/tooltip'
import type { SelectionMode } from '../../types/selection'
import type { LucideIcon } from 'lucide-react'
import { Slash, Square, Type } from 'lucide-react'

type MarkupToolbarProps = {
  activeTool: MarkupTool | null
  selectionMode: SelectionMode
  onSelectTool: (tool: MarkupTool | null) => void
  onSelectionModeChange: (mode: SelectionMode) => void
}

const TOOL_DEFINITIONS: { type: MarkupTool; label: string; Icon: LucideIcon; description: string }[] = [
  { type: 'text', label: 'Text', Icon: Type, description: 'Add text markup' },
  { type: 'line', label: 'Line', Icon: Slash, description: 'Draw a diagonal line' },
  { type: 'rectangle', label: 'Box', Icon: Square, description: 'Draw a rectangle' },
]

const MarkupToolbar: React.FC<MarkupToolbarProps> = ({
  activeTool,
  selectionMode,
  onSelectTool,
  onSelectionModeChange,
}) => {
  return (
    <div className="flex items-center gap-1.5">
      {TOOL_DEFINITIONS.map(({ type, Icon, description, label }) => {
        const isActive = activeTool === type
        return (
          <Tooltip key={type} label={description}>
            <Button
              variant={isActive ? 'default' : 'outline'}
              size="icon"
              type="button"
              onClick={() => {
                onSelectTool(isActive ? null : type)
                onSelectionModeChange(isActive ? selectionMode : 'single')
              }}
              aria-label={label}
              aria-pressed={isActive}
            >
              <Icon className="h-5 w-5" />
            </Button>
          </Tooltip>
        )
      })}
    </div>
  )
}

export default MarkupToolbar
