import React from 'react'
import { MarkupTool } from './MarkupLayer'
import { Button } from '../ui/button'

type MarkupToolbarProps = {
  activeTool: MarkupTool | null
  onSelectTool: (tool: MarkupTool | null) => void
}

const TOOL_DEFINITIONS: { type: MarkupTool; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'line', label: 'Line' },
  { type: 'rectangle', label: 'Box' },
]

const MarkupToolbar: React.FC<MarkupToolbarProps> = ({ activeTool, onSelectTool }) => {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant={activeTool === null ? 'default' : 'outline'}
        size="sm"
        onClick={() => onSelectTool(null)}
      >
        Select
      </Button>
      {TOOL_DEFINITIONS.map(tool => (
        <Button
          key={tool.type}
          variant={activeTool === tool.type ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSelectTool(activeTool === tool.type ? null : tool.type)}
        >
          {tool.label}
        </Button>
      ))}
    </div>
  )
}

export default MarkupToolbar
