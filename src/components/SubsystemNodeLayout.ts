export const SUBSYSTEM_BASE_HEIGHT = 64
export const SUBSYSTEM_PORT_HEIGHT = 24

export function computeSubsystemNodeMinHeight(portCount: number): number {
  if (!Number.isFinite(portCount) || portCount <= 0) {
    return SUBSYSTEM_BASE_HEIGHT
  }
  const usableCount = Math.max(0, Math.floor(portCount))
  const extraPortRows = Math.max(usableCount - 1, 0)
  return SUBSYSTEM_BASE_HEIGHT + extraPortRows * SUBSYSTEM_PORT_HEIGHT
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
  const baseMargin = Math.min(25, 60 / usableTotal)
  const margin = Math.max(baseMargin, 12)
  const span = 100 - margin * 2
  if (span <= 0) {
    return 50
  }
  return margin + (span * clampedIndex) / (usableTotal - 1)
}

