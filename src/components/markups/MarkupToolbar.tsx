import React from 'react'
import { MarkupTool } from './MarkupLayer'
import { Button } from '../ui/button'
import { Tooltip } from '../ui/tooltip'
import type { SelectionMode } from '../../types/selection'
import type { LucideIcon } from 'lucide-react'
import { BoxSelect, Minus, Square, Type, Pointer } from 'lucide-react'

type MarkupToolbarProps = {
  activeTool: MarkupTool | null
  selectionMode: SelectionMode
  onSelectTool: (tool: MarkupTool | null) => void
  onSelectionModeChange: (mode: SelectionMode) => void
}

const TOOL_DEFINITIONS: { type: MarkupTool; label: string; Icon: LucideIcon; description: string }[] = [
  { type: 'text', label: 'Text', Icon: Type, description: 'Add text markup' },
  { type: 'line', label: 'Line', Icon: Minus, description: 'Draw a straight line' },
  { type: 'rectangle', label: 'Box', Icon: Square, description: 'Draw a rectangle' },
]

const MarkupToolbar: React.FC<MarkupToolbarProps> = ({
  activeTool,
  selectionMode,
  onSelectTool,
  onSelectionModeChange,
}) => {
  const handleSelect = React.useCallback(() => {
    onSelectionModeChange('single')
    onSelectTool(null)
  }, [onSelectTool, onSelectionModeChange])

  const toggleMultiSelect = React.useCallback(() => {
    const nextMode = selectionMode === 'multi' ? 'single' : 'multi'
    onSelectionModeChange(nextMode)
    if (nextMode === 'multi') {
      onSelectTool(null)
    }
  }, [selectionMode, onSelectionModeChange, onSelectTool])

  const isSelectActive = selectionMode === 'single' && activeTool === null
  const isMultiActive = selectionMode === 'multi'

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip label="Select nodes">
        <Button
          variant={isSelectActive ? 'default' : 'outline'}
          size="icon"
          type="button"
          onClick={handleSelect}
          aria-label="Select nodes"
          title="Select nodes"
          aria-pressed={isSelectActive}
        >
          <Pointer className="h-5 w-5" />
        </Button>
      </Tooltip>
      <Tooltip label="Toggle multi-select">
        <Button
          variant={isMultiActive ? 'default' : 'outline'}
          size="icon"
          type="button"
          onClick={toggleMultiSelect}
          aria-label="Toggle multi-select"
          title="Toggle multi-select"
          aria-pressed={isMultiActive}
        >
          <BoxSelect className="h-5 w-5" />
        </Button>
      </Tooltip>
      <span className="h-6 w-px bg-slate-300 mx-1" aria-hidden="true" />
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
              title={label}
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
