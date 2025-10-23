import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { EdgeProps } from 'reactflow'
import { BaseEdge, EdgeLabelRenderer, Position, useStore } from 'reactflow'
import { computeOrthogonalGeometry, distanceToPoint } from './orthogonalGeometry'
import type { OrthogonalGeometry, OrthogonalSegment, SegmentOrientation } from './orthogonalGeometry'

type OrthogonalEdgeData = {
  midpointOffset?: number
  midpointX?: number
  onMidpointChange?: (
    edgeId: string,
    payload: { offset: number; absoluteAxisCoord?: number; axis: 'x' | 'y' }
  ) => void
  onMidpointCommit?: (
    edgeId: string,
    payload: { offset: number; absoluteAxisCoord?: number; axis: 'x' | 'y' }
  ) => void
  screenToFlow?: (pos: { x: number; y: number }) => { x: number; y: number }
  defaultColor?: string
  extendMidpointRange?: boolean
  groupKey?: string
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const INTERSECTION_EPS = 1
const DEFAULT_STROKE_WIDTH = 3

const resolveStrokeWidth = (style?: CSSProperties): number => {
  const raw = style?.strokeWidth
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const parsed = parseFloat(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return DEFAULT_STROKE_WIDTH
}

type MarkerKind = 'dot' | 'jumper'

type IntersectionMarker = {
  key: string
  position: { x: number; y: number }
  kind: MarkerKind
  orientation: SegmentOrientation
}

type RegisteredEdgeRecord = {
  geometry: OrthogonalGeometry
  groupKey?: string
  signature: string
}

type RegisteredEdge = RegisteredEdgeRecord & {
  id: string
}

type EdgeRegistry = {
  edges: Map<string, RegisteredEdgeRecord>
  listeners: Set<() => void>
  version: number
}

const registries = new Map<string, EdgeRegistry>()

const getRegistry = (rfId: string): EdgeRegistry => {
  let registry = registries.get(rfId)
  if (!registry) {
    registry = { edges: new Map(), listeners: new Set(), version: 0 }
    registries.set(rfId, registry)
  }
  return registry
}

const notifyRegistry = (rfId: string) => {
  const registry = getRegistry(rfId)
  registry.version += 1
  for (const listener of registry.listeners) {
    listener()
  }
}

const subscribeRegistry = (rfId: string, listener: () => void) => {
  const registry = getRegistry(rfId)
  registry.listeners.add(listener)
  return () => {
    registry.listeners.delete(listener)
  }
}

const getRegistryVersion = (rfId: string) => getRegistry(rfId).version

const segmentContains = (segment: OrthogonalSegment, value: number): boolean => {
  if (segment.orientation === 'horizontal') {
    const min = Math.min(segment.start.x, segment.end.x) - INTERSECTION_EPS
    const max = Math.max(segment.start.x, segment.end.x) + INTERSECTION_EPS
    return value >= min && value <= max
  }
  const min = Math.min(segment.start.y, segment.end.y) - INTERSECTION_EPS
  const max = Math.max(segment.start.y, segment.end.y) + INTERSECTION_EPS
  return value >= min && value <= max
}

const segmentsIntersect = (a: OrthogonalSegment, b: OrthogonalSegment): { x: number; y: number } | null => {
  if (a.orientation === b.orientation) return null
  const horizontal = a.orientation === 'horizontal' ? a : b
  const vertical = a.orientation === 'vertical' ? a : b
  const x = vertical.start.x
  const y = horizontal.start.y
  if (!segmentContains(horizontal, x)) return null
  if (!segmentContains(vertical, y)) return null
  return { x, y }
}

const isNearSegmentEndpoint = (segment: OrthogonalSegment, point: { x: number; y: number }) => {
  const toStart = distanceToPoint(segment.start, point)
  const toEnd = distanceToPoint(segment.end, point)
  return toStart <= INTERSECTION_EPS || toEnd <= INTERSECTION_EPS
}

const computeMarkers = (
  currentId: string,
  currentGeometry: OrthogonalGeometry,
  currentGroupKey: string | undefined,
  edges: RegisteredEdge[],
  edgeOrderMap: Map<string, number>
): IntersectionMarker[] => {
  const markers: IntersectionMarker[] = []
  const seen = new Set<string>()

  for (const edge of edges) {
    if (!edge || edge.id === currentId) continue
    const otherGeometry = edge.geometry
    const otherGroupKey = edge.groupKey
    const isSameGroup = Boolean(currentGroupKey && otherGroupKey && currentGroupKey === otherGroupKey)
    const markerKind: MarkerKind = isSameGroup ? 'dot' : 'jumper'

    const currentOrder = edgeOrderMap.get(currentId) ?? Number.POSITIVE_INFINITY
    const otherOrder = edgeOrderMap.get(edge.id) ?? Number.POSITIVE_INFINITY

    for (const currentSegment of currentGeometry.segments) {
      if (currentSegment.orientation !== 'horizontal' && currentSegment.orientation !== 'vertical') continue
      for (const otherSegment of otherGeometry.segments) {
        if (otherSegment.orientation !== 'horizontal' && otherSegment.orientation !== 'vertical') continue
        const intersection = segmentsIntersect(currentSegment, otherSegment)
        if (!intersection) continue
        const currentAtEndpoint = isNearSegmentEndpoint(currentSegment, intersection)
        const otherAtEndpoint = isNearSegmentEndpoint(otherSegment, intersection)
        if (currentAtEndpoint && otherAtEndpoint) continue

        const ownerEdgeId = markerKind === 'jumper'
          ? (currentOrder !== otherOrder
              ? (currentOrder < otherOrder ? currentId : edge.id)
              : (currentId < edge.id ? currentId : edge.id))
          : (currentId < edge.id ? currentId : edge.id)
        if (ownerEdgeId !== currentId) continue

        const key = `${intersection.x.toFixed(2)}:${intersection.y.toFixed(2)}:${markerKind}:${ownerEdgeId}`
        if (seen.has(key)) continue
        seen.add(key)

        markers.push({
          key,
          position: intersection,
          kind: markerKind,
          orientation: currentSegment.orientation,
        })
      }
    }
  }

  return markers
}

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

  const geometry = useMemo(
    () =>
      computeOrthogonalGeometry({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        midpointOffset: offset,
        midpointXOverride,
      }),
    [offset, midpointXOverride, sourcePosition, sourceX, sourceY, targetPosition, targetX, targetY]
  )

  const axisStart = geometry.axisStart
  const axisEnd = geometry.axisEnd
  const handleX = geometry.handlePoint.x
  const handleY = geometry.handlePoint.y
  const path = geometry.path
  const isVertical = geometry.midSegment.orientation === 'vertical'
  const length = geometry.midSegmentLength

  const labelX = targetX - 6
  const labelY = targetY - 6

  const groupKey = typeof data?.groupKey === 'string' ? data?.groupKey : undefined

  const rfIdFromStore = useStore((state) => state.rfId)
  const rfId = rfIdFromStore ?? 'default'

  const registryVersionSnapshot = useSyncExternalStore(
    (listener) => subscribeRegistry(rfId, listener),
    () => getRegistryVersion(rfId),
    () => getRegistryVersion(rfId)
  )

  const registryEntries = useMemo(() => {
    const registry = getRegistry(rfId)
    const entries: RegisteredEdge[] = []
    registry.edges.forEach((record, edgeId) => {
      entries.push({ id: edgeId, ...record })
    })
    return entries
  }, [rfId, registryVersionSnapshot])

  const edgesState = useStore((state) => state.edges)
  const edgeOrderMap = useMemo(() => {
    const map = new Map<string, number>()
    edgesState.forEach((edge, index) => {
      if (edge.type === 'orthogonal') {
        map.set(edge.id, index)
      }
    })
    return map
  }, [edgesState])

  const markers = useMemo(
    () => computeMarkers(id, geometry, groupKey, registryEntries, edgeOrderMap),
    [geometry, groupKey, id, registryEntries, edgeOrderMap]
  )

  useEffect(() => {
    const registry = getRegistry(rfId)
    const signature = `${geometry.path}|${groupKey ?? ''}`
    const existing = registry.edges.get(id)
    const record: RegisteredEdgeRecord = existing && existing.signature === signature
      ? { ...existing, geometry }
      : { geometry, groupKey, signature }
    const changed = !existing || existing.signature !== signature
    registry.edges.set(id, record)
    if (changed) {
      notifyRegistry(rfId)
    }
    return () => {
      const currentRegistry = getRegistry(rfId)
      if (currentRegistry.edges.delete(id)) {
        notifyRegistry(rfId)
      }
    }
  }, [geometry, groupKey, id, rfId])

  useEffect(() => {
    if (import.meta.env.DEV && markers.length > 0) {
      console.debug('orthogonal markers', id, markers)
    }
  }, [id, markers])

  const pointerIdRef = useRef<number | null>(null)
  const lastDragRef = useRef<{ offset: number; absoluteAxisCoord?: number; axis: 'x' | 'y' } | null>(null)

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
    const axis = sourceAxis === 'y' ? 'y' : 'x'
    data.onMidpointChange(id, { offset: defaultRatio, absoluteAxisCoord: axisMid, axis })
    data.onMidpointCommit?.(id, { offset: defaultRatio, absoluteAxisCoord: axisMid, axis })
  }, [axisEnd, axisStart, data, id, midpointXOverride, offset, sourceAxis])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!data?.onMidpointChange || !data?.screenToFlow) return
      event.preventDefault()
      event.stopPropagation()
      pointerIdRef.current = event.pointerId
      event.currentTarget.setPointerCapture?.(event.pointerId)
      lastDragRef.current = null
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
      const axis = sourceAxis === 'y' ? 'y' : 'x'
      if (Math.abs(delta) < 1e-6) {
        const payload = { offset: 0.5, absoluteAxisCoord: bounded, axis }
        data.onMidpointChange(id, payload)
        lastDragRef.current = payload
        return
      }
      const ratioRaw = (bounded - axisStart) / delta
      const nextOffset = clamp(ratioRaw, 0, 1)
      const payload = { offset: nextOffset, absoluteAxisCoord: bounded, axis }
      data.onMidpointChange(id, payload)
      lastDragRef.current = payload
    },
    [axisEnd, axisStart, data, id, sourceAxis]
  )

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current === event.pointerId) {
      pointerIdRef.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
    if (data?.onMidpointCommit && lastDragRef.current) {
      data.onMidpointCommit(id, lastDragRef.current)
      lastDragRef.current = null
    }
  }, [data, id])

  const defaultColor = (data as any)?.defaultColor
  const isMultiSelected = Boolean((data as any)?.isMultiSelected)
  const isActive = selected || isMultiSelected || pointerIdRef.current !== null
  const strokeColor = isActive ? '#6b7280' : (style?.stroke ?? defaultColor ?? '#64748b')
  const strokeWidth = resolveStrokeWidth(style)
  const labelBaseColor = (labelStyle as any)?.color || (labelStyle as any)?.fill || defaultColor || '#334155'
  const textColor = isActive ? '#374151' : labelBaseColor
  const knobBorder = isActive ? '#374151' : '#64748b'
  const knobBackground = isActive ? '#e2e8f0' : '#f8fafc'
  const canShowHandle = Boolean(
    selected &&
    data?.onMidpointChange &&
    data?.screenToFlow &&
    (data?.extendMidpointRange || length > 8 || Math.abs(axisEnd - axisStart) > 8)
  )

  return (
    <>
      <BaseEdge path={path} style={{ ...style, stroke: strokeColor }} markerEnd={markerEnd} />
      {markers.length > 0 && (
        <EdgeLabelRenderer>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {markers.map((marker) => (
              <div
                key={marker.key}
                style={{
                  position: 'absolute',
                  left: marker.position.x,
                  top: marker.position.y,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 80,
                }}
              >
                {marker.kind === 'dot' ? (
                  <svg width={10} height={10} viewBox="0 0 10 10">
                    <circle cx={5} cy={5} r={3} fill={strokeColor} stroke="white" strokeWidth={1} />
                  </svg>
                ) : (
                  (() => {
                    const edgeWidth = Math.max(strokeWidth, 0.5)
                    const radius = edgeWidth
                    const diameter = radius * 2
                    const padding = edgeWidth
                    const size = diameter + padding * 2
                    const center = padding + radius
                    const startX = padding
                    const endX = padding + diameter
                    const baseline = center
                    return (
                      <svg
                        width={size}
                        height={size}
                        viewBox={`0 0 ${size} ${size}`}
                        style={{
                          transform: marker.orientation === 'vertical' ? 'rotate(-90deg)' : undefined,
                          transformOrigin: `${center}px ${center}px`,
                          display: 'block',
                        }}
                      >
                        <path
                          d={`M ${startX} ${baseline} A ${radius} ${radius} 0 0 1 ${endX} ${baseline}`}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={edgeWidth}
                          strokeLinecap="round"
                        />
                      </svg>
                    )
                  })()
                )}
              </div>
            ))}
          </div>
        </EdgeLabelRenderer>
      )}
      {canShowHandle && (
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
