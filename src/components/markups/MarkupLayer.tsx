import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore as useReactFlowStore } from 'reactflow'
import { CanvasMarkup, LineMarkup, RectangleMarkup, TextMarkup } from '../../models'
import { genId } from '../../utils'

export type MarkupTool = CanvasMarkup['type']

type LineHandle = 'start' | 'end'
type RectHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'

type DragMode =
  | { type: 'move' }
  | { type: 'line-handle'; handle: LineHandle }
  | { type: 'rect-resize'; handle: RectHandle }

type DragState = {
  id: string
  pointerId: number
  mode: DragMode
  origin: { x: number; y: number }
  initial: CanvasMarkup
}

type CreationDraftBase = {
  pointerId: number
  origin: { x: number; y: number }
  captureTarget: Element | null
}

type CreationDraft =
  | (CreationDraftBase & { tool: 'line'; markup: LineMarkup })
  | (CreationDraftBase & { tool: 'rectangle'; markup: RectangleMarkup })

const MIN_RECT_SIZE = 24
const HANDLE_SIZE = 12

const cloneMarkup = (markup: CanvasMarkup): CanvasMarkup => (
  JSON.parse(JSON.stringify(markup)) as CanvasMarkup
)

const createTextMarkup = (point: { x: number; y: number }): TextMarkup => ({
  id: genId('markup_'),
  type: 'text',
  position: { x: point.x, y: point.y },
  text: 'New text',
  color: '#0f172a',
  fontSize: 16,
  isBold: false,
  zIndex: 30,
})

const createLineMarkup = (id: string, start: { x: number; y: number }, end: { x: number; y: number }): LineMarkup => ({
  id,
  type: 'line',
  start: { ...start },
  end: { ...end },
  color: '#0f172a',
  thickness: 2,
  isDashed: false,
  arrowHead: 'none',
  zIndex: 40,
})

const createRectangleMarkup = (
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
  enforceMinimum = false,
): RectangleMarkup => {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const rawWidth = Math.abs(deltaX)
  const rawHeight = Math.abs(deltaY)
  const minSize = enforceMinimum ? MIN_RECT_SIZE : 1
  const width = Math.max(minSize, rawWidth)
  const height = Math.max(minSize, rawHeight)
  let left = Math.min(start.x, end.x)
  let top = Math.min(start.y, end.y)

  if (enforceMinimum) {
    if (rawWidth < MIN_RECT_SIZE) {
      left = deltaX < 0 ? start.x - MIN_RECT_SIZE : start.x
    }
    if (rawHeight < MIN_RECT_SIZE) {
      top = deltaY < 0 ? start.y - MIN_RECT_SIZE : start.y
    }
  }

  return {
    id,
    type: 'rectangle',
    position: { x: left, y: top },
    size: { width, height },
    strokeColor: '#0f172a',
    thickness: 2,
    isDashed: false,
    fillColor: '#38bdf8',
    fillOpacity: 0.18,
    cornerRadius: 8,
    zIndex: -10,
  }
}

const applyMove = (initial: CanvasMarkup, delta: { x: number; y: number }): CanvasMarkup => {
  if (initial.type === 'text') {
    return {
      ...initial,
      position: {
        x: initial.position.x + delta.x,
        y: initial.position.y + delta.y,
      },
    }
  }
  if (initial.type === 'rectangle') {
    return {
      ...initial,
      position: {
        x: initial.position.x + delta.x,
        y: initial.position.y + delta.y,
      },
    }
  }
  if (initial.type === 'line') {
    return {
      ...initial,
      start: {
        x: initial.start.x + delta.x,
        y: initial.start.y + delta.y,
      },
      end: {
        x: initial.end.x + delta.x,
        y: initial.end.y + delta.y,
      },
    }
  }
  return initial
}

const applyLineHandle = (initial: CanvasMarkup, handle: LineHandle, pointer: { x: number; y: number }): CanvasMarkup => {
  if (initial.type !== 'line') return initial
  if (handle === 'start') {
    return { ...initial, start: { ...pointer } }
  }
  return { ...initial, end: { ...pointer } }
}

const applyRectResize = (initial: CanvasMarkup, handle: RectHandle, pointer: { x: number; y: number }): CanvasMarkup => {
  if (initial.type !== 'rectangle') return initial
  const left = initial.position.x
  const top = initial.position.y
  const right = initial.position.x + initial.size.width
  const bottom = initial.position.y + initial.size.height

  let nextLeft = left
  let nextTop = top
  let nextRight = right
  let nextBottom = bottom

  switch (handle) {
    case 'nw':
      nextLeft = Math.min(pointer.x, right - MIN_RECT_SIZE)
      nextTop = Math.min(pointer.y, bottom - MIN_RECT_SIZE)
      break
    case 'ne':
      nextRight = Math.max(pointer.x, left + MIN_RECT_SIZE)
      nextTop = Math.min(pointer.y, bottom - MIN_RECT_SIZE)
      break
    case 'sw':
      nextLeft = Math.min(pointer.x, right - MIN_RECT_SIZE)
      nextBottom = Math.max(pointer.y, top + MIN_RECT_SIZE)
      break
    case 'se':
      nextRight = Math.max(pointer.x, left + MIN_RECT_SIZE)
      nextBottom = Math.max(pointer.y, top + MIN_RECT_SIZE)
      break
    case 'n':
      nextTop = Math.min(pointer.y, bottom - MIN_RECT_SIZE)
      break
    case 's':
      nextBottom = Math.max(pointer.y, top + MIN_RECT_SIZE)
      break
    case 'e':
      nextRight = Math.max(pointer.x, left + MIN_RECT_SIZE)
      break
    case 'w':
      nextLeft = Math.min(pointer.x, right - MIN_RECT_SIZE)
      break
    default:
      break
  }

  const width = Math.max(MIN_RECT_SIZE, nextRight - nextLeft)
  const height = Math.max(MIN_RECT_SIZE, nextBottom - nextTop)
  const clampedLeft = nextRight - width
  const clampedTop = nextBottom - height

  return {
    ...initial,
    position: { x: clampedLeft, y: clampedTop },
    size: { width, height },
  }
}

const computeDragUpdate = (state: DragState, pointer: { x: number; y: number }): CanvasMarkup => {
  const delta = {
    x: pointer.x - state.origin.x,
    y: pointer.y - state.origin.y,
  }
  if (state.mode.type === 'move') {
    return applyMove(state.initial, delta)
  }
  if (state.mode.type === 'line-handle') {
    return applyLineHandle(state.initial, state.mode.handle, pointer)
  }
  if (state.mode.type === 'rect-resize') {
    return applyRectResize(state.initial, state.mode.handle, pointer)
  }
  return state.initial
}

export type MarkupLayerProps = {
  markups: CanvasMarkup[]
  primarySelectedId: string | null
  multiSelectedIds: string[]
  activeTool: MarkupTool | null
  onSelect: (id: string | null) => void
  onCreateMarkup: (markup: CanvasMarkup) => void
  onCommitUpdate: (id: string, next: CanvasMarkup) => void
  screenToFlow: (point: { x: number; y: number }) => { x: number; y: number }
}

const MarkupLayer: React.FC<MarkupLayerProps> = ({
  markups,
  primarySelectedId,
  multiSelectedIds,
  activeTool,
  onSelect,
  onCreateMarkup,
  onCommitUpdate,
  screenToFlow,
}) => {
  const transform = useReactFlowStore(store => store.transform)
  const [tx, ty, zoom] = transform
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [drafts, setDrafts] = useState<Record<string, CanvasMarkup>>({})
  const [creationDraft, setCreationDraft] = useState<CreationDraft | null>(null)
  const creationDraftRef = useRef<CreationDraft | null>(null)

  useEffect(() => {
    creationDraftRef.current = creationDraft
  }, [creationDraft])

  const displayedMarkups = useMemo(() => {
    const merged = markups.map(markup => drafts[markup.id] ?? markup)
    return merged.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  }, [markups, drafts])

  const startDrag = useCallback((markup: CanvasMarkup, mode: DragMode, event: React.PointerEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (dragState || creationDraftRef.current) return
    const pointer = screenToFlow({ x: event.clientX, y: event.clientY })
    const snapshot = cloneMarkup(markup)
    setDragState({
      id: markup.id,
      pointerId: event.pointerId,
      mode,
      origin: pointer,
      initial: snapshot,
    })
    setDrafts(prev => ({ ...prev, [markup.id]: snapshot }))
    onSelect(markup.id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [dragState, onSelect, screenToFlow])

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return
    event.preventDefault()
    const pointer = screenToFlow({ x: event.clientX, y: event.clientY })
    const updated = computeDragUpdate(dragState, pointer)
    setDrafts(prev => ({ ...prev, [dragState.id]: updated }))
  }, [dragState, screenToFlow])

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return
    event.preventDefault()
    const finalMarkup = drafts[dragState.id] ?? dragState.initial
    onCommitUpdate(dragState.id, cloneMarkup(finalMarkup))
    setDrafts(prev => {
      const next = { ...prev }
      delete next[dragState.id]
      return next
    })
    setDragState(null)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }, [dragState, drafts, onCommitUpdate])

  const updateCreationMarkup = useCallback((pointer: { x: number; y: number }, enforceMinimum = false) => {
    const draft = creationDraftRef.current
    if (!draft) return
    if (draft.tool === 'line') {
      const updated = createLineMarkup(draft.markup.id, draft.origin, pointer)
      if (updated) {
        setCreationDraft(prev => (prev ? { ...prev, markup: updated } : prev))
      }
      return
    }
    const updated = createRectangleMarkup(draft.markup.id, draft.origin, pointer, enforceMinimum)
    setCreationDraft(prev => (prev ? { ...prev, markup: updated } : prev))
  }, [])

  const handleCreationPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const draft = creationDraftRef.current
    if (!draft || event.pointerId !== draft.pointerId) return
    event.preventDefault()
    const pointer = screenToFlow({ x: event.clientX, y: event.clientY })
    updateCreationMarkup(pointer)
  }, [screenToFlow, updateCreationMarkup])

  const commitCreation = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const draft = creationDraftRef.current
    if (!draft || event.pointerId !== draft.pointerId) return
    event.preventDefault()
    const pointer = screenToFlow({ x: event.clientX, y: event.clientY })
    updateCreationMarkup(pointer, true)
    const captureTarget = draft.captureTarget
    const markupClone = { ...draft.markup }
    creationDraftRef.current = null
    setCreationDraft(null)
    captureTarget?.releasePointerCapture?.(draft.pointerId)
    onCreateMarkup(markupClone)
  }, [onCreateMarkup, screenToFlow, updateCreationMarkup])

  const cancelCreation = useCallback((pointerId?: number) => {
    const draft = creationDraftRef.current
    if (!draft) return
    if (pointerId !== undefined && draft.pointerId !== pointerId) return
    draft.captureTarget?.releasePointerCapture?.(draft.pointerId)
    creationDraftRef.current = null
    setCreationDraft(null)
  }, [])

  const handleBackgroundPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!activeTool) return
    if (event.button !== 0) return
    if (event.target !== containerRef.current) return
    event.preventDefault()
    event.stopPropagation()
    if (creationDraftRef.current) return
    const flowPoint = screenToFlow({ x: event.clientX, y: event.clientY })

    if (activeTool === 'text') {
      const markup = createTextMarkup(flowPoint)
      onCreateMarkup(markup)
      return
    }

    if (activeTool === 'line' || activeTool === 'rectangle') {
      const id = genId('markup_')
      const initialMarkup =
        activeTool === 'line'
          ? createLineMarkup(id, flowPoint, flowPoint)
          : createRectangleMarkup(id, flowPoint, flowPoint)
      const captureTarget = event.currentTarget as Element | null
      captureTarget?.setPointerCapture(event.pointerId)
      const nextDraft: CreationDraft = {
        tool: activeTool,
        pointerId: event.pointerId,
        origin: flowPoint,
        markup: initialMarkup,
        captureTarget,
      }
      creationDraftRef.current = nextDraft
      setCreationDraft(nextDraft)
    }
  }, [activeTool, onCreateMarkup, screenToFlow])

  const pointerEvents = activeTool || creationDraftRef.current ? 'auto' : 'none'
  const cursor = (() => {
    if (creationDraftRef.current) {
      return creationDraftRef.current.tool === 'line' ? 'crosshair' : 'crosshair'
    }
    if (activeTool === 'text') return 'text'
    if (activeTool === 'line' || activeTool === 'rectangle') return 'crosshair'
    return 'default'
  })()

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ pointerEvents, cursor, zIndex: 50 }}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handleCreationPointerMove}
      onPointerUp={commitCreation}
      onPointerCancel={event => cancelCreation(event.pointerId)}
      onLostPointerCapture={event => cancelCreation(event.pointerId)}
    >
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
      >
        {creationDraft && (
          <MarkupItem
            key={creationDraft.markup.id}
            markup={creationDraft.markup}
            isPrimarySelected={false}
            isMultiSelected={false}
            onSelect={() => {}}
            startDrag={() => {}}
            onPointerMove={() => {}}
            onPointerUp={() => {}}
            readOnly
          />
        )}
        {displayedMarkups.map(markup => (
          <MarkupItem
            key={markup.id}
            markup={markup}
            isPrimarySelected={primarySelectedId === markup.id}
            isMultiSelected={multiSelectedIds.includes(markup.id)}
            onSelect={onSelect}
            startDrag={startDrag}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        ))}
      </div>
      {activeTool && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-slate-900/80 px-3 py-1 text-xs text-white shadow">
          {activeTool === 'text' ? 'Click to place text annotation' : 'Click and drag to place a ' + (activeTool === 'rectangle' ? 'box' : 'line')}
        </div>
      )}
    </div>
  )
}

type MarkupItemProps = {
  markup: CanvasMarkup
  isPrimarySelected: boolean
  isMultiSelected: boolean
  onSelect: (id: string) => void
  startDrag: (markup: CanvasMarkup, mode: DragMode, event: React.PointerEvent) => void
  onPointerMove: (event: React.PointerEvent) => void
  onPointerUp: (event: React.PointerEvent) => void
  readOnly?: boolean
}

const MarkupItem: React.FC<MarkupItemProps> = ({ markup, isPrimarySelected, isMultiSelected, onSelect, startDrag, onPointerMove, onPointerUp, readOnly }) => {
  const interactive = !readOnly
  const multiAccent = 'rgba(2, 132, 199, 0.35)'

  if (markup.type === 'text') {
    const borderStyle = isPrimarySelected
      ? '1px dashed #0284c7'
      : isMultiSelected
      ? `1px dashed ${multiAccent}`
      : '1px solid transparent'
    return (
      <div
        style={{
          position: 'absolute',
          left: markup.position.x,
          top: markup.position.y,
          pointerEvents: interactive ? 'auto' : 'none',
          zIndex: markup.zIndex ?? 0,
        }}
      >
        <div
          onPointerDown={interactive ? event => {
            onSelect(markup.id)
            startDrag(markup, { type: 'move' }, event)
          } : undefined}
          onPointerMove={interactive ? onPointerMove : undefined}
          onPointerUp={interactive ? onPointerUp : undefined}
          style={{
            cursor: interactive ? 'move' : 'default',
            fontSize: `${markup.fontSize}px`,
            color: markup.color,
            fontWeight: markup.isBold ? 600 : 400,
            whiteSpace: 'pre-wrap',
            padding: '2px 4px',
            border: borderStyle,
            borderRadius: 4,
            backgroundColor: markup.backgroundColor || 'transparent',
          }}
        >
          {markup.text || 'Text'}
        </div>
      </div>
    )
  }

  if (markup.type === 'line') {
    const minX = Math.min(markup.start.x, markup.end.x)
    const minY = Math.min(markup.start.y, markup.end.y)
    const width = Math.max(1, Math.abs(markup.end.x - markup.start.x))
    const height = Math.max(1, Math.abs(markup.end.y - markup.start.y))
    const markerId = `markup-arrow-${markup.id}`
    const localStart = {
      left: markup.start.x - minX - HANDLE_SIZE / 2,
      top: markup.start.y - minY - HANDLE_SIZE / 2,
    }
    const localEnd = {
      left: markup.end.x - minX - HANDLE_SIZE / 2,
      top: markup.end.y - minY - HANDLE_SIZE / 2,
    }
    const lineStroke = markup.color || '#0f172a'
    const overlayStroke = isPrimarySelected ? '#0284c7' : multiAccent

    return (
      <div
        style={{ position: 'absolute', left: minX, top: minY, width, height, pointerEvents: interactive ? 'auto' : 'none', zIndex: markup.zIndex ?? 0 }}
      >
        <svg
          width={width}
          height={height}
          style={{ overflow: 'visible', cursor: interactive ? 'move' : 'default' }}
          onPointerDown={interactive ? event => {
            onSelect(markup.id)
            startDrag(markup, { type: 'move' }, event)
          } : undefined}
          onPointerMove={interactive ? onPointerMove : undefined}
          onPointerUp={interactive ? onPointerUp : undefined}
        >
          <defs>
            <marker id={markerId} markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L6,3 L0,6 z" fill={lineStroke} />
            </marker>
          </defs>
          <line
            x1={markup.start.x - minX}
            y1={markup.start.y - minY}
            x2={markup.end.x - minX}
            y2={markup.end.y - minY}
            stroke={isMultiSelected ? overlayStroke : lineStroke}
            strokeWidth={markup.thickness}
            strokeDasharray={markup.isDashed ? `${markup.thickness * 2}, ${markup.thickness * 1.5}` : undefined}
            strokeLinecap="round"
            markerEnd={markup.arrowHead === 'end' ? `url(#${markerId})` : undefined}
            pointerEvents="stroke"
          />
          <line
            x1={markup.start.x - minX}
            y1={markup.start.y - minY}
            x2={markup.end.x - minX}
            y2={markup.end.y - minY}
            stroke="transparent"
            strokeWidth={Math.max(markup.thickness, 16)}
            pointerEvents="stroke"
          />
        </svg>
        {interactive && isPrimarySelected && (
          <>
            <div
              style={{
                position: 'absolute',
                left: localStart.left,
                top: localStart.top,
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                borderRadius: '50%',
                background: '#ffffff',
                border: '2px solid #0284c7',
                cursor: 'grab',
                zIndex: Math.max(50, (markup.zIndex ?? 0) + 1),
              }}
              onPointerDown={event => {
                onSelect(markup.id)
                startDrag(markup, { type: 'line-handle', handle: 'start' }, event)
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
            <div
              style={{
                position: 'absolute',
                left: localEnd.left,
                top: localEnd.top,
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                borderRadius: '50%',
                background: '#ffffff',
                border: '2px solid #0284c7',
                cursor: 'grab',
                zIndex: Math.max(50, (markup.zIndex ?? 0) + 1),
              }}
              onPointerDown={event => {
                onSelect(markup.id)
                startDrag(markup, { type: 'line-handle', handle: 'end' }, event)
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          </>
        )}
      </div>
    )
  }

  if (markup.type === 'rectangle') {
    const fillColor = markup.fillColor ? hexToRgba(markup.fillColor, markup.fillOpacity ?? 0.18) : 'transparent'
    const borderStyle = markup.isDashed ? 'dashed' : 'solid'
    const highlightShadow = isPrimarySelected
      ? '0 0 0 1px rgba(2,132,199,0.6)'
      : isMultiSelected
      ? `0 0 0 1px ${multiAccent}`
      : 'none'
    const handles: RectHandle[] = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w']
    const handlePositions: Record<RectHandle, { left: number; top: number; cursor: string }> = {
      nw: { left: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2, cursor: 'nwse-resize' },
      ne: { left: markup.size.width - HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2, cursor: 'nesw-resize' },
      sw: { left: -HANDLE_SIZE / 2, top: markup.size.height - HANDLE_SIZE / 2, cursor: 'nesw-resize' },
      se: { left: markup.size.width - HANDLE_SIZE / 2, top: markup.size.height - HANDLE_SIZE / 2, cursor: 'nwse-resize' },
      n: { left: markup.size.width / 2 - HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2, cursor: 'ns-resize' },
      s: { left: markup.size.width / 2 - HANDLE_SIZE / 2, top: markup.size.height - HANDLE_SIZE / 2, cursor: 'ns-resize' },
      e: { left: markup.size.width - HANDLE_SIZE / 2, top: markup.size.height / 2 - HANDLE_SIZE / 2, cursor: 'ew-resize' },
      w: { left: -HANDLE_SIZE / 2, top: markup.size.height / 2 - HANDLE_SIZE / 2, cursor: 'ew-resize' },
    }

    return (
      <div
        style={{
          position: 'absolute',
          left: markup.position.x,
          top: markup.position.y,
          width: markup.size.width,
          height: markup.size.height,
          pointerEvents: interactive ? 'auto' : 'none',
          zIndex: markup.zIndex ?? 0,
        }}
      >
        <div
          onPointerDown={interactive ? event => {
            onSelect(markup.id)
            startDrag(markup, { type: 'move' }, event)
          } : undefined}
          onPointerMove={interactive ? onPointerMove : undefined}
          onPointerUp={interactive ? onPointerUp : undefined}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: markup.cornerRadius ?? 0,
            border: `${markup.thickness}px ${borderStyle} ${isMultiSelected ? multiAccent : markup.strokeColor || '#0f172a'}`,
            background: fillColor,
            cursor: interactive ? 'move' : 'default',
            boxShadow: highlightShadow,
          }}
        />
        {interactive && isPrimarySelected && handles.map(handle => {
          const pos = handlePositions[handle]
          return (
            <div
              key={handle}
              style={{
                position: 'absolute',
                left: pos.left,
                top: pos.top,
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                background: '#ffffff',
                border: '2px solid #0284c7',
                borderRadius: 2,
                cursor: pos.cursor,
                zIndex: Math.max(50, (markup.zIndex ?? 0) + 1),
              }}
              onPointerDown={event => {
                onSelect(markup.id)
                startDrag(markup, { type: 'rect-resize', handle }, event)
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          )
        })}
      </div>
    )
  }

  return null
}

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex?.startsWith('#') ? hex.slice(1) : hex
  if (normalized.length !== 6) return `rgba(14, 165, 233, ${alpha})`
  const bigint = parseInt(normalized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default MarkupLayer
