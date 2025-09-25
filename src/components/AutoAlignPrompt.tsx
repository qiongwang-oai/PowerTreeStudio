import React from 'react'
import { Button } from './ui/button'

type AutoAlignPromptProps = {
  anchorRect: DOMRect | null
  horizontalValue: string
  verticalValue: string
  onHorizontalChange: (value: string) => void
  onVerticalChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
  error?: string | null
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export default function AutoAlignPrompt({
  anchorRect,
  horizontalValue,
  verticalValue,
  onHorizontalChange,
  onVerticalChange,
  onConfirm,
  onCancel,
  error,
}: AutoAlignPromptProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  React.useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768
  const defaultLeft = viewportWidth / 2 - 110
  const defaultTop = viewportHeight / 2 - 80
  const rawLeft = anchorRect ? anchorRect.left : defaultLeft
  const rawTop = anchorRect ? anchorRect.bottom + 8 : defaultTop
  const panelWidth = 240
  const panelHeight = 140
  const left = clamp(rawLeft, 12, viewportWidth - panelWidth - 12)
  const top = clamp(rawTop, 12, viewportHeight - panelHeight - 12)

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <div className="fixed z-50" style={{ left, top }}>
        <form
          className="w-[240px] rounded-lg border border-slate-200 bg-white shadow-lg p-3 text-sm"
          onSubmit={event => {
            event.preventDefault()
            onConfirm()
          }}
        >
          <div className="font-semibold text-slate-700 mb-2">Auto alignment</div>
          <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="auto-align-horizontal-spacing">
            Horizontal spacing (px)
          </label>
          <input
            id="auto-align-horizontal-spacing"
            ref={inputRef}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
            placeholder="Leave blank for default"
            value={horizontalValue}
            onChange={event => onHorizontalChange(event.target.value)}
          />
          <label className="block text-xs font-medium text-slate-600 mb-1 mt-3" htmlFor="auto-align-vertical-spacing">
            Vertical spacing (px)
          </label>
          <input
            id="auto-align-vertical-spacing"
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
            placeholder="Leave blank for default"
            value={verticalValue}
            onChange={event => onVerticalChange(event.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">Enter positive numbers to override the spacing.</p>
          {error ? <p className="text-xs text-red-600 mt-1">{error}</p> : null}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
