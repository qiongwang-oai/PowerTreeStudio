import type { AnyNode, SubsystemNode } from '../models'

export const SUBSYSTEM_BASE_HEIGHT = 64
export const SUBSYSTEM_PORT_HEIGHT = 24
export const SUBSYSTEM_PORT_SPACING_PX = 70
export const SUBSYSTEM_PORT_MARGIN_MAX_PX = 50

const CARD_PADDING_Y = 4
const CARD_HEADER_HEIGHT = 22
const CARD_SECTION_GAP = 4
const CARD_LINE_HEIGHT = 16
const CARD_MIN_HEIGHT = CARD_PADDING_Y * 2 + CARD_HEADER_HEIGHT + CARD_LINE_HEIGHT
const SUBSYSTEM_PADDING_EXTRA = 6

const NOTE_BASE_HEIGHT = 96
const NOTE_LINE_HEIGHT = 18
const NOTE_MAX_LINES = 6
const DEFAULT_NODE_HEIGHT = CARD_MIN_HEIGHT
const SUBSYSTEM_EMBEDDED_MIN_HEIGHT = 96

export const getRawSubsystemMarginPercent = (total: number): number => {
  const baseMargin = Math.min(25, 60 / total)
  return Math.max(baseMargin, 12)
}

export const computeSubsystemNodeMinHeight = (portCount: number): number => {
  if (!Number.isFinite(portCount) || portCount <= 0) {
    return SUBSYSTEM_BASE_HEIGHT
  }
  const usableCount = Math.max(1, Math.floor(portCount))
  if (usableCount === 1) {
    return SUBSYSTEM_BASE_HEIGHT
  }
  const marginFraction = getRawSubsystemMarginPercent(usableCount) / 100
  const spacingRequirementPx = SUBSYSTEM_PORT_SPACING_PX * (usableCount - 1)
  const candidates: number[] = [SUBSYSTEM_BASE_HEIGHT]
  if (spacingRequirementPx > 0) {
    const denom = 1 - 2 * marginFraction
    if (denom > 0) {
      candidates.push(spacingRequirementPx / denom)
    }
    candidates.push(spacingRequirementPx + SUBSYSTEM_PORT_MARGIN_MAX_PX * 2)
  }

  const satisfies = (height: number) => {
    if (!Number.isFinite(height) || height <= 0) {
      return false
    }
    const marginPx = Math.min(marginFraction * height, SUBSYSTEM_PORT_MARGIN_MAX_PX)
    const available = height - marginPx * 2
    return available >= spacingRequirementPx
  }

  let bestHeight = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate) || candidate <= 0) continue
    let height = Math.max(SUBSYSTEM_BASE_HEIGHT, Math.ceil(candidate))
    const safetyLimit = 20000
    let steps = 0
    while (!satisfies(height) && steps < safetyLimit) {
      height += 1
      steps += 1
    }
    if (satisfies(height) && height < bestHeight) {
      bestHeight = height
    }
  }

  if (Number.isFinite(bestHeight)) {
    return bestHeight
  }
  return SUBSYSTEM_BASE_HEIGHT
}

const cardHeightFromLines = (leftLines: number, rightLines: number, extra = 0): number => {
  const contentLines = Math.max(leftLines, rightLines, 1)
  const height = CARD_PADDING_Y * 2 + CARD_HEADER_HEIGHT + CARD_SECTION_GAP + contentLines * CARD_LINE_HEIGHT + extra
  return Math.max(CARD_MIN_HEIGHT, Math.ceil(height))
}

const countSubsystemPorts = (node: SubsystemNode): number => {
  const projectNodes = Array.isArray((node as any).project?.nodes)
    ? (node as any).project.nodes
    : []
  return projectNodes.filter((child: any) => child?.type === 'SubsystemInput').length
}

const getNoteContent = (node: AnyNode | undefined): string => {
  const text = typeof (node as any)?.text === 'string' ? (node as any).text : ''
  return text
}

export const estimateNodeHeight = (node: AnyNode | undefined): number => {
  if (!node) return DEFAULT_NODE_HEIGHT

  const explicitHeight = Number((node as any).height)
  if (Number.isFinite(explicitHeight) && explicitHeight > 0) {
    return explicitHeight
  }

  switch (node.type) {
    case 'Source':
      return cardHeightFromLines(1, 0)
    case 'Converter':
      return cardHeightFromLines(2, 2)
    case 'DualOutputConverter': {
      const outputs = Array.isArray((node as any).outputs) ? (node as any).outputs : []
      const outputCount = Math.max(outputs.length, 1)
      const leftLines = Math.max(outputCount * 2, 2)
      const outputSpacingExtra = Math.max(0, outputCount - 1) * 4
      return cardHeightFromLines(leftLines, 2, outputSpacingExtra)
    }
    case 'Load':
      return cardHeightFromLines(2, 2)
    case 'Bus':
      return cardHeightFromLines(2, 2)
    case 'SubsystemInput':
      return cardHeightFromLines(2, 1)
    case 'Subsystem': {
      const portCount = countSubsystemPorts(node as SubsystemNode)
      const baseHeight = cardHeightFromLines(1, 2)
      const portDrivenHeight = computeSubsystemNodeMinHeight(portCount) + SUBSYSTEM_PADDING_EXTRA
      return Math.max(baseHeight, portDrivenHeight, SUBSYSTEM_EMBEDDED_MIN_HEIGHT)
    }
    case 'Note': {
      const text = getNoteContent(node)
      const lines = text.length ? Math.min(text.split(/\r?\n/g).length, NOTE_MAX_LINES) : 1
      const noteHeight = CARD_PADDING_Y * 2 + CARD_HEADER_HEIGHT + CARD_SECTION_GAP + lines * NOTE_LINE_HEIGHT
      return Math.max(NOTE_BASE_HEIGHT, Math.ceil(noteHeight))
    }
    default:
      return cardHeightFromLines(2, 2)
  }
}

