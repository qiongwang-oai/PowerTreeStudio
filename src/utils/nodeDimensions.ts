import type { AnyNode } from '../models'
import { computeSubsystemNodeMinHeight } from '../components/SubsystemNodeLayout'

const DEFAULT_NODE_HEIGHT = 102
const NOTE_BASE_HEIGHT = 96
const NOTE_LINE_HEIGHT = 18
const SUBSYSTEM_MIN_HEIGHT = 96

const toFinitePositive = (value: unknown): number | null => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return num
}

const noteLineCount = (text: unknown): number => {
  if (typeof text !== 'string') return 1
  const trimmed = text.trim()
  if (!trimmed.length) return 1
  const lines = trimmed.split(/\r?\n/g).length
  return Math.min(Math.max(lines, 1), 6)
}

const subsystemPortCount = (node: AnyNode): number => {
  if (Array.isArray((node as any).inputPorts)) {
    return (node as any).inputPorts.length
  }
  const childNodes = (node as any).project?.nodes
  if (Array.isArray(childNodes)) {
    return childNodes.filter((child: any) => child?.type === 'SubsystemInput').length
  }
  return 0
}

export const estimateNodeHeight = (node: AnyNode | undefined): number => {
  if (!node) return DEFAULT_NODE_HEIGHT

  const explicitHeight = toFinitePositive((node as any).height)
  if (explicitHeight !== null) {
    return explicitHeight
  }

  switch (node.type) {
    case 'Source':
      return 94
    case 'Converter':
      return 102
    case 'DualOutputConverter': {
      const outputs = Array.isArray((node as any).outputs) ? (node as any).outputs : []
      const count = outputs.length || 1
      const base = 118
      const perBranch = 24
      return base + (count - 1) * perBranch
    }
    case 'Load':
      return 108
    case 'Bus':
      return 102
    case 'SubsystemInput':
      return 100
    case 'Subsystem': {
      const ports = subsystemPortCount(node)
      const minHeight = computeSubsystemNodeMinHeight(ports)
      return Math.max(minHeight, SUBSYSTEM_MIN_HEIGHT)
    }
    case 'Note': {
      const lines = noteLineCount((node as any).text)
      return NOTE_BASE_HEIGHT + lines * NOTE_LINE_HEIGHT
    }
    default:
      return DEFAULT_NODE_HEIGHT
  }
}


