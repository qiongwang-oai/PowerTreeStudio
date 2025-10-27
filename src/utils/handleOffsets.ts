import type { AnyNode, SubsystemInputNode, SubsystemNode } from '../models'

import {
  getSubsystemPortPosition,
  orderSubsystemPorts,
  sanitizeSubsystemHandleOrder,
} from '../components/SubsystemNodeLayout'
import { estimateNodeHeight } from './nodeSizing'

const SINGLE_HANDLE_OFFSET_PX = 3
const SUBSYSTEM_INPUT_HANDLE_OFFSET_PX = 8
const DUAL_OUTPUT_SPACING_PERCENT = 24

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 50
  return Math.max(0, Math.min(100, value))
}

const percentToPixels = (percent: number, height: number): number => {
  if (!Number.isFinite(height) || height <= 0) return 0
  return (clampPercent(percent) / 100) * height
}

const halfHeightOffset = (height: number, extra: number): number => {
  if (!Number.isFinite(height) || height <= 0) return extra
  return height / 2 + extra
}

const normalizeHandleId = (handleId?: string | null): string | null => {
  if (typeof handleId !== 'string') return null
  const trimmed = handleId.trim()
  return trimmed.length > 0 ? trimmed : null
}

const getSubsystemPorts = (node: SubsystemNode): SubsystemInputNode[] => {
  const projectNodes = Array.isArray((node as any)?.project?.nodes)
    ? ((node as any).project.nodes as AnyNode[])
    : []
  return projectNodes.filter(
    (child): child is SubsystemInputNode => child?.type === 'SubsystemInput'
  )
}

const resolveSubsystemPortPercent = (
  node: SubsystemNode,
  handleId: string | null,
  height: number
): number | null => {
  const ports = getSubsystemPorts(node)
  if (!ports.length) {
    return halfHeightOffset(height, SINGLE_HANDLE_OFFSET_PX)
  }

  if (!handleId) {
    return halfHeightOffset(height, SINGLE_HANDLE_OFFSET_PX)
  }

  const portIds = ports
    .map(port => (typeof port?.id === 'string' ? port.id : ''))
    .filter(id => id.length > 0)

  const storedOrder = (node as any)?.inputHandleOrder
  const sanitizedOrder = sanitizeSubsystemHandleOrder(portIds, storedOrder)
  const orderedPorts = orderSubsystemPorts(ports, sanitizedOrder)

  if (!orderedPorts.length) {
    return halfHeightOffset(height, SINGLE_HANDLE_OFFSET_PX)
  }

  const index = orderedPorts.findIndex(port => port.id === handleId)
  const effectiveIndex = index >= 0 ? index : 0
  const percent = getSubsystemPortPosition(effectiveIndex, orderedPorts.length)
  return percentToPixels(percent, height)
}

export const getOutputHandleTopOffset = (
  node: AnyNode,
  rawHandleId?: string | null
): number => {
  const height = estimateNodeHeight(node)
  const handleId = normalizeHandleId(rawHandleId)

  switch (node.type) {
    case 'DualOutputConverter': {
      const outputs = Array.isArray((node as any)?.outputs)
        ? ((node as any).outputs as { id?: string }[])
        : []
      const count = outputs.length > 0 ? outputs.length : 1

      let index = -1
      if (handleId) {
        index = outputs.findIndex(output => output?.id === handleId)
      }
      if (index < 0) {
        index = 0
      }

      const base = 50
      const offsetUnits = index - (count - 1) / 2
      const percent = base + offsetUnits * DUAL_OUTPUT_SPACING_PERCENT
      return percentToPixels(percent, height)
    }

    case 'Subsystem': {
      // Subsystems typically expose a single aggregated output handle.
      return halfHeightOffset(height, SINGLE_HANDLE_OFFSET_PX)
    }

    case 'Source':
    case 'Converter':
    case 'Bus':
    case 'SubsystemInput':
    case 'Load':
    case 'Note':
    default:
      return halfHeightOffset(height, SINGLE_HANDLE_OFFSET_PX)
  }
}

export const getInputHandleTopOffset = (
  node: AnyNode,
  rawHandleId?: string | null
): number => {
  const height = estimateNodeHeight(node)
  const handleId = normalizeHandleId(rawHandleId)

  switch (node.type) {
    case 'Subsystem':
      return resolveSubsystemPortPercent(node as SubsystemNode, handleId, height)
        ?? halfHeightOffset(height, SINGLE_HANDLE_OFFSET_PX)

    case 'SubsystemInput':
      return halfHeightOffset(height, SUBSYSTEM_INPUT_HANDLE_OFFSET_PX)

    case 'Source':
    case 'Converter':
    case 'DualOutputConverter':
    case 'Load':
    case 'Bus':
    case 'Note':
    default:
      return halfHeightOffset(height, SINGLE_HANDLE_OFFSET_PX)
  }
}


