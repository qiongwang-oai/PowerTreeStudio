export const SUBSYSTEM_BASE_HEIGHT = 64
export const SUBSYSTEM_PORT_HEIGHT = 24
export const SUBSYSTEM_PORT_SPACING_PX = 70
export const SUBSYSTEM_PORT_MARGIN_MAX_PX = 50

export function sanitizeSubsystemHandleOrder(portIds: string[], stored?: unknown): string[] {
  const validPortIds = Array.isArray(portIds)
    ? portIds.filter(id => typeof id === 'string' && id.trim().length > 0)
    : []
  if (validPortIds.length === 0) {
    return []
  }
  const storedArray = Array.isArray(stored)
    ? stored.map(id => (typeof id === 'string' ? id.trim() : '')).filter(id => id.length > 0)
    : []
  const existing = new Set<string>()
  const ordered: string[] = []
  for (const id of storedArray) {
    if (!existing.has(id) && validPortIds.includes(id)) {
      ordered.push(id)
      existing.add(id)
    }
  }
  for (const id of validPortIds) {
    if (!existing.has(id)) {
      ordered.push(id)
      existing.add(id)
    }
  }
  return ordered
}

export function orderSubsystemPorts<T extends { id?: string }>(ports: T[], order: readonly string[]): T[] {
  if (!Array.isArray(ports) || ports.length <= 1) {
    return Array.isArray(ports) ? [...ports] : []
  }
  const orderIndex = new Map<string, number>()
  order.forEach((id, index) => {
    if (typeof id === 'string' && id.length > 0 && !orderIndex.has(id)) {
      orderIndex.set(id, index)
    }
  })
  return [...ports].sort((a, b) => {
    const idA = typeof a?.id === 'string' ? a.id : ''
    const idB = typeof b?.id === 'string' ? b.id : ''
    const idxA = orderIndex.has(idA) ? orderIndex.get(idA)! : Number.POSITIVE_INFINITY
    const idxB = orderIndex.has(idB) ? orderIndex.get(idB)! : Number.POSITIVE_INFINITY
    if (idxA !== idxB) return idxA - idxB
    return 0
  })
}

function getRawSubsystemMarginPercent(total: number): number {
  const baseMargin = Math.min(25, 60 / total)
  return Math.max(baseMargin, 12)
}

export function computeSubsystemNodeMinHeight(portCount: number): number {
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

export function getSubsystemPortPosition(index: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) {
    return 50
  }
  const usableTotal = Math.max(1, Math.floor(total))
  if (usableTotal === 1) {
    return 50
  }
  const clampedIndex = Math.min(Math.max(index, 0), usableTotal - 1)
  const minHeightPx = computeSubsystemNodeMinHeight(usableTotal)
  const rawMarginPercent = getRawSubsystemMarginPercent(usableTotal)
  const marginPx = Math.min((rawMarginPercent / 100) * minHeightPx, SUBSYSTEM_PORT_MARGIN_MAX_PX)
  const margin = (marginPx / Math.max(minHeightPx, 1)) * 100
  const spacingPercent = (SUBSYSTEM_PORT_SPACING_PX / Math.max(minHeightPx, 1)) * 100
  const desiredPosition = margin + spacingPercent * clampedIndex
  const maxPosition = 100 - margin
  if (usableTotal > 1 && desiredPosition > maxPosition) {
    const spanBetweenMargins = maxPosition - margin
    if (spanBetweenMargins <= 0) {
      return 50
    }
    return margin + (spanBetweenMargins * clampedIndex) / (usableTotal - 1)
  }
  return desiredPosition
}

