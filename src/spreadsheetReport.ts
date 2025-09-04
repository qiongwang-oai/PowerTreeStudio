import * as XLSX from 'xlsx'
import { Project, AnyNode } from './models'
import { compute, computeDeepAggregates } from './calc'
import { download } from './io'

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet'
  return cleaned
}

function fmt(n: number): string { return Number.isFinite(n) ? n.toFixed(2) : '0.00' }
function fmtPct(frac: number): string { return Number.isFinite(frac) ? `${(frac*100).toFixed(2)}%` : '0.00%' }

function buildTableForProject(project: Project): any[][] {
  const rows: any[][] = []
  const header = ['Name','Paralleled','Critical load (W)','Non-critical load (W)','Copper loss (W)','Converter loss (W)','Efficiency (%)','Details']
  rows.push(header)

  // Subsystems first
  for (const n of project.nodes as AnyNode[]){
    if ((n as any).type === 'Subsystem'){
      const sub = n as any
      const count = Math.max(1, Math.round((sub.numParalleledSystems ?? 1)))
      const innerProject: Project = JSON.parse(JSON.stringify(sub.project || { id:'empty', name:'Embedded', units: project.units, defaultMargins: project.defaultMargins, scenarios: project.scenarios, currentScenario: project.currentScenario, nodes: [], edges: [] }))
      innerProject.currentScenario = project.currentScenario
      const agg = computeDeepAggregates(innerProject)
      const totalIn = agg.totalLoadPower + agg.edgeLoss + agg.converterLoss
      const eff = totalIn>0 ? (agg.criticalLoadPower/totalIn) : 0
      rows.push([
        sub.name || 'Subsystem',
        count,
        fmt(agg.criticalLoadPower * count),
        fmt(agg.nonCriticalLoadPower * count),
        fmt(agg.edgeLoss * count),
        fmt(agg.converterLoss * count),
        fmtPct(eff),
        ''
      ])
    }
  }

  // Loads by descending power
  const result = compute(project)
  const loadRows: { power:number, row:any[] }[] = []
  for (const n of Object.values(result.nodes)){
    if ((n as any).type === 'Load'){
      const load = n as any
      const pout = (n as any).P_out || 0
      const isNonCritical = load.critical === false
      const criticalPower = isNonCritical ? 0 : pout
      const nonCriticalPower = isNonCritical ? pout : 0
      const copperLoss = 0
      const converterLoss = 0
      const denom = criticalPower + nonCriticalPower + copperLoss + converterLoss
      const eta = denom>0 ? (criticalPower/denom) : 0
      loadRows.push({ power: pout, row: [
        load.name || 'Load',
        Math.max(1, Math.round((load.numParalleledDevices ?? 1))),
        fmt(criticalPower),
        fmt(nonCriticalPower),
        fmt(copperLoss),
        fmt(converterLoss),
        fmtPct(eta),
        ''
      ] })
    }
  }
  loadRows.sort((a,b)=> b.power - a.power)
  for (const r of loadRows) rows.push(r.row)

  // Copper traces and power converters row (current canvas only sums)
  let tlCritical = 0, tlNonCritical = 0, tlConvLoss = 0, tlEdgeLoss = 0
  for (const rn of Object.values(result.nodes)){
    if ((rn as any).type === 'Load'){
      const isNonCritical = (rn as any).critical === false
      const pout = (rn as any).P_out || 0
      if (isNonCritical) tlNonCritical += pout; else tlCritical += pout
    }
    if ((rn as any).type === 'Converter') tlConvLoss += ((rn as any).loss || 0)
  }
  for (const e of Object.values(result.edges)) tlEdgeLoss += (e.P_loss_edge || 0)
  rows.push(['Copper traces and power converters','—', fmt(0), fmt(0), fmt(tlEdgeLoss), fmt(tlConvLoss), 'NA',''])

  // Deep total summary
  const totalAgg = computeDeepAggregates(project)
  const totalIn = totalAgg.totalLoadPower + totalAgg.edgeLoss + totalAgg.converterLoss
  const effTotal = totalIn>0 ? (totalAgg.criticalLoadPower/totalIn) : 0
  rows.push(['Total','—', fmt(totalAgg.criticalLoadPower), fmt(totalAgg.nonCriticalLoadPower), fmt(totalAgg.edgeLoss), fmt(totalAgg.converterLoss), fmtPct(effTotal), ''])

  return rows
}

function collectSubsystems(project: Project, path: string[] = []): Array<{ title: string, project: Project }>{
  const subs: Array<{ title: string, project: Project }> = []
  for (const n of project.nodes as AnyNode[]){
    if ((n as any).type === 'Subsystem' && (n as any).project){
      const sub = n as any
      const inner: Project = JSON.parse(JSON.stringify(sub.project))
      inner.currentScenario = project.currentScenario
      const title = [...path, sub.name || 'Subsystem'].join(' / ')
      subs.push({ title, project: inner })
      subs.push(...collectSubsystems(inner, [...path, sub.name || 'Subsystem']))
    }
  }
  return subs
}

export function exportSpreadsheetReport(project: Project){
  const wb = XLSX.utils.book_new()
  // Root sheet for current canvas
  const rootRows = buildTableForProject(project)
  const rootWs = XLSX.utils.aoa_to_sheet(rootRows)
  XLSX.utils.book_append_sheet(wb, rootWs, sanitizeSheetName('Current Canvas'))

  // One sheet per nested subsystem
  const subs = collectSubsystems(project)
  const usedNames = new Set<string>()
  for (const { title, project: p } of subs){
    const rows = buildTableForProject(p)
    const ws = XLSX.utils.aoa_to_sheet(rows)
    let name = sanitizeSheetName(title)
    let suffix = 1
    while (usedNames.has(name)) { name = sanitizeSheetName(`${title} ${++suffix}`) }
    usedNames.add(name)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  download(`${project.name.replace(/\s+/g,'_')}_report.xlsx`, out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}


