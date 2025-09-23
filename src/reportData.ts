import { Project, AnyNode } from './models'
import { ComputeResult, compute, computeDeepAggregates } from './calc'

export type LevelSlice = {
  id: string
  label: string
  value: number
  color?: string
}

const defaultColors = [
  '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#84cc16', '#e11d48'
]

function colorForId(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return defaultColors[h % defaultColors.length]
}

/**
 * Build one pie dataset for a project level.
 * - Each slice is a direct child load or subsystem in the current project level
 * - Includes a distinct slice for "Copper traces and power converters" (this level's losses)
 * - Slice values sum to critical + non-critical + copper loss + converter loss for this level
 */
export function buildLevelPieData(project: Project, result?: ComputeResult): LevelSlice[] {
  const res: ComputeResult = result || compute(project)

  // Base contributions per direct child: loads by P_out; subsystems by deep totals
  const baseSlices: LevelSlice[] = []

  for (const n of project.nodes as AnyNode[]) {
    if ((n as any).type === 'Subsystem') {
      const sub = n as any
      const count = Math.max(1, Math.round((sub.numParalleledSystems ?? 1)))
      if (sub.project) {
        const inner: Project = JSON.parse(JSON.stringify(sub.project))
        inner.currentScenario = project.currentScenario
        const agg = computeDeepAggregates(inner)
        const deepTotal = (agg.totalLoadPower + agg.edgeLoss + agg.converterLoss) * count
        baseSlices.push({ id: sub.id, label: sub.name || 'Subsystem', value: deepTotal })
      }
    }
  }

  for (const n of Object.values(res.nodes)) {
    if ((n as any).type === 'Load') {
      const load = n as any
      baseSlices.push({ id: load.id, label: load.name || 'Load', value: load.P_out || 0 })
    }
  }

  // Level losses at this project level only
  let levelEdgeLoss = 0
  let levelConvLoss = 0
  for (const rn of Object.values(res.nodes)) {
    if ((rn as any).type === 'Converter' || (rn as any).type === 'DualOutputConverter') levelConvLoss += ((rn as any).loss || 0)
  }
  for (const e of Object.values(res.edges)) levelEdgeLoss += (e.P_loss_edge || 0)
  const losses = levelEdgeLoss + levelConvLoss

  if (losses > 0) {
    baseSlices.push({ id: '__losses__', label: 'Copper traces and power converters', value: losses, color: '#ef4444' })
  }

  // Attach colors
  for (const s of baseSlices) if (!s.color) s.color = colorForId(s.id)

  // Filter zero/negative and sort descending
  return baseSlices.filter(s => s.value > 1e-9).sort((a, b) => b.value - a.value)
}

