import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { EdgeProps } from 'reactflow'
import { BaseEdge, EdgeLabelRenderer, Position } from 'reactflow'

type OrthogonalEdgeData = {
  midpointOffset?: number
  midpointX?: number
  onMidpointChange?: (edgeId: string, nextOffset: number, absoluteAxisCoord?: number) => void
  screenToFlow?: (pos: { x: number; y: number }) => { x: number; y: number }
  defaultColor?: string
  extendMidpointRange?: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export default function OrthogonalEdge(props: EdgeProps<OrthogonalEdgeData>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    style,
    markerEnd,
    label,
    labelStyle,
    labelShowBg,
    labelBgPadding,
    labelBgBorderRadius,
    labelBgStyle,
    selected,
    sourcePosition,
    targetPosition,
    data,
  } = props

  const offsetRaw = data?.midpointOffset ?? 0.5
  const offset = clamp(offsetRaw, 0, 1)
  const midpointXOverride = (typeof data?.midpointX === 'number' && Number.isFinite(data.midpointX)) ? data.midpointX : undefined

  const sourceAxis = (sourcePosition === Position.Left || sourcePosition === Position.Right) ? 'x' : 'y'
  const targetAxis = (targetPosition === Position.Left || targetPosition === Position.Right) ? 'x' : 'y'

  const { path, labelX, labelY, handleX, handleY, isVertical, length, axisStart, axisEnd } = useMemo(() => {
    const deltaPrimary = sourceAxis === 'y' ? targetY - sourceY : targetX - sourceX
    const safeDeltaPrimary = Math.abs(deltaPrimary) < 1e-6 ? (sourceAxis === 'y' ? (targetY >= sourceY ? 1 : -1) : (targetX >= sourceX ? 1 : -1)) * 80 : deltaPrimary

    const desiredMidX = midpointXOverride
    const firstPoint = sourceAxis === 'y'
      ? { x: sourceX, y: sourceY + safeDeltaPrimary * offset }
      : { x: (desiredMidX !== undefined ? desiredMidX : (sourceX + safeDeltaPrimary * offset)), y: sourceY }

    const secondPoint = targetAxis === 'y'
      ? { x: targetX, y: firstPoint.y }
      : { x: firstPoint.x, y: targetY }

    const midSegmentVertical = Math.abs(secondPoint.x - firstPoint.x) < 1e-6
    const length = midSegmentVertical ? Math.abs(secondPoint.y - firstPoint.y) : Math.abs(secondPoint.x - firstPoint.x)
    const midX = midSegmentVertical ? firstPoint.x : (firstPoint.x + secondPoint.x) / 2
    const midY = midSegmentVertical ? (firstPoint.y + secondPoint.y) / 2 : firstPoint.y

    const path = `M ${sourceX} ${sourceY} L ${firstPoint.x} ${firstPoint.y} L ${secondPoint.x} ${secondPoint.y} L ${targetX} ${targetY}`

    const axisStart = sourceAxis === 'y' ? sourceY : sourceX
    let axisEnd = sourceAxis === 'y' ? targetY : targetX
    if (Math.abs(deltaPrimary) < 1e-6) {
      axisEnd = axisStart + safeDeltaPrimary
    }

    const labelOffsetX = targetX - 6
    const labelOffsetY = targetY - 6

    return {
      path,
      labelX: labelOffsetX,
      labelY: labelOffsetY,
      handleX: midX,
      handleY: midY,
      isVertical: midSegmentVertical,
      length,
      axisStart,
      axisEnd,
    }
  }, [offset, sourceAxis, targetAxis, sourceX, sourceY, targetX, targetY])

  const pointerIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!data?.onMidpointChange) return
    if (!Number.isFinite(axisStart) || !Number.isFinite(axisEnd)) return
    const defaultRatio = 0.5
    const axisMid = axisStart + (axisEnd - axisStart) * defaultRatio
    if (!Number.isFinite(axisMid)) return
    const hasCustomOffset = Math.abs(offset - defaultRatio) > 1e-6
    const midpointMismatch = midpointXOverride === undefined || Math.abs((midpointXOverride ?? axisMid) - axisMid) > 1
    if (hasCustomOffset && midpointXOverride !== undefined) return
    if (!midpointMismatch) return
    data.onMidpointChange(id, defaultRatio, axisMid)
  }, [axisEnd, axisStart, data, id, midpointXOverride, offset])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!data?.onMidpointChange || !data?.screenToFlow) return
      event.preventDefault()
      event.stopPropagation()
      pointerIdRef.current = event.pointerId
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },
    [data]
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current === null) return
      if (!data?.onMidpointChange || !data?.screenToFlow) return
      event.preventDefault()
      const { x, y } = data.screenToFlow({ x: event.clientX, y: event.clientY })
      const pointerCoord = sourceAxis === 'y' ? y : x
      const extra = data?.extendMidpointRange ? Math.max(160, Math.abs(axisEnd - axisStart)) : 0
      const min = Math.min(axisStart, axisEnd) - extra
      const max = Math.max(axisStart, axisEnd) + extra
      const bounded = clamp(pointerCoord, min, max)
      const delta = axisEnd - axisStart
      if (Math.abs(delta) < 1e-6) {
        data.onMidpointChange(id, 0.5, bounded)
        return
      }
      const ratioRaw = (bounded - axisStart) / delta
      const nextOffset = clamp(ratioRaw, 0, 1)
      data.onMidpointChange(id, nextOffset, bounded)
    },
    [axisEnd, axisStart, data, id, sourceAxis]
  )

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current === event.pointerId) {
      pointerIdRef.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
  }, [])

  const defaultColor = (data as any)?.defaultColor
  const isActive = selected || pointerIdRef.current !== null
  const strokeColor = isActive ? '#6b7280' : (style?.stroke ?? defaultColor ?? '#64748b')
  const labelBaseColor = (labelStyle as any)?.color || (labelStyle as any)?.fill || defaultColor || '#334155'
  const textColor = isActive ? '#374151' : labelBaseColor
  const knobBorder = isActive ? '#374151' : '#64748b'
  const knobBackground = isActive ? '#e2e8f0' : '#f8fafc'
  const showHandle = Boolean(
    data?.onMidpointChange &&
    data?.screenToFlow &&
    (length > 8 || Math.abs(axisEnd - axisStart) > 8)
  )

  return (
    <>
      <BaseEdge path={path} style={{ ...style, stroke: strokeColor }} markerEnd={markerEnd} />
      {showHandle && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              left: handleX,
              top: handleY + 1,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              zIndex: isActive ? 1000 : 10,
            }}
            className="nodrag nopan"
          >
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                width: 10,
                height: 10,
                borderRadius: 9999,
                border: `2px solid ${knobBorder}`,
                background: knobBackground,
                cursor: sourceAxis === 'y' ? 'ns-resize' : 'ew-resize',
                boxShadow: '0 1px 2px rgba(15,23,42,0.25)',
                touchAction: 'none',
              }}
            />
          </div>
        </EdgeLabelRenderer>
      )}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(${labelX}px, ${labelY}px) translate(-100%, -100%)`,
              pointerEvents: 'auto',
              fontSize: '10px',
              zIndex: 50,
              ...(labelShowBg
                ? {
                    background: 'white',
                    padding: labelBgPadding ?? 2,
                    borderRadius: labelBgBorderRadius ?? 2,
                    ...labelBgStyle,
                  }
                : {}),
              ...labelStyle,
              color: textColor,
              fill: textColor,
              whiteSpace: 'pre',
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
