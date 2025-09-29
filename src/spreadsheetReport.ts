import ExcelJS from 'exceljs'
import { Project, AnyNode } from './models'
import { compute, computeDeepAggregates } from './calc'
import { download } from './io'
import { buildConverterSummary, ConverterSummaryEntry } from './converterSummary'

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet'
  return cleaned
}

function pct(frac: number): number { return Number.isFinite(frac) ? frac : 0 }

function topologyLabel(value?: string | null): string {
  if (!value) return ''
  if (value.toLowerCase() === 'llc') return 'LLC'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function converterTypeLabel(entry: ConverterSummaryEntry): string {
  const base = entry.nodeType === 'Converter' ? 'Converter' : 'Dual-output converter'
  const topo = topologyLabel(entry.topology as string | undefined)
  return topo ? `${base} / ${topo}` : base
}

function voltageText(value?: number): string {
  return Number.isFinite(value) ? (value as number).toFixed(2) : ''
}

function vinRangeLabel(min?: number, max?: number): string {
  const hasMin = Number.isFinite(min)
  const hasMax = Number.isFinite(max)
  if (hasMin && hasMax) {
    const minVal = min as number
    const maxVal = max as number
    if (Math.abs(minVal - maxVal) < 1e-6) return voltageText(minVal)
    return `${voltageText(minVal)} – ${voltageText(maxVal)}`
  }
  if (hasMin) return voltageText(min)
  if (hasMax) return voltageText(max)
  return ''
}

function voutLabel(entry: ConverterSummaryEntry): string {
  if (entry.nodeType === 'Converter') return voltageText(entry.vout)
  if (!entry.vouts || entry.vouts.length === 0) return ''
  return entry.vouts
    .map(v => {
      const value = voltageText(v.value)
      const label = (v.label || '').trim()
      if (!value) return label
      return label ? `${label}: ${value}` : value
    })
    .filter(Boolean)
    .join(', ')
}

function branchVoutLabel(value?: number): string {
  return voltageText(value)
}

function buildTableForProject(project: Project): any[][] {
  const rows: any[][] = []
  const header = ['Name','Paralleled','Critical load (W)','Non-critical load (W)','Copper loss (W)','Converter loss (W)','Total subsystem power (W)','Efficiency (%)','Details']
  rows.push(header)

  // Collect data rows (subsystems + loads), sort by Critical load (W)
  const dataRows: { crit:number, total:number, name:string, row:any[] }[] = []

  // Subsystems
  for (const n of project.nodes as AnyNode[]){
    if ((n as any).type === 'Subsystem'){
      const sub = n as any
      const count = Math.max(1, Math.round((sub.numParalleledSystems ?? 1)))
      const innerProject: Project = JSON.parse(JSON.stringify(sub.project || { id:'empty', name:'Embedded', units: project.units, defaultMargins: project.defaultMargins, scenarios: project.scenarios, currentScenario: project.currentScenario, nodes: [], edges: [] }))
      innerProject.currentScenario = project.currentScenario
      const agg = computeDeepAggregates(innerProject)
      const totalIn = agg.totalLoadPower + agg.edgeLoss + agg.converterLoss
      const eff = totalIn>0 ? (agg.criticalLoadPower/totalIn) : 0
      const crit = agg.criticalLoadPower * count
      dataRows.push({
        crit,
        total: (agg.criticalLoadPower + agg.nonCriticalLoadPower + agg.edgeLoss + agg.converterLoss) * count,
        name: (sub.name || 'Subsystem'),
        row: [
          sub.name || 'Subsystem',
          count,
          crit,
          agg.nonCriticalLoadPower * count,
          agg.edgeLoss * count,
          agg.converterLoss * count,
          (agg.criticalLoadPower + agg.nonCriticalLoadPower + agg.edgeLoss + agg.converterLoss) * count,
          pct(eff),
          ''
        ]
      })
    }
  }

  // Loads
  const result = compute(project)
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
      dataRows.push({
        crit: criticalPower,
        total: denom,
        name: (load.name || 'Load'),
        row: [
          load.name || 'Load',
          Math.max(1, Math.round((load.numParalleledDevices ?? 1))),
          criticalPower,
          nonCriticalPower,
          copperLoss,
          converterLoss,
          (criticalPower + nonCriticalPower + copperLoss + converterLoss),
          pct(eta),
          ''
        ]
      })
    }
  }

  dataRows.sort((a,b)=> (b.crit - a.crit) || (b.total - a.total) || b.name.localeCompare(a.name))
  for (const r of dataRows) rows.push(r.row)

  // Copper traces and power converters row (current canvas only sums)
  let tlCritical = 0, tlNonCritical = 0, tlConvLoss = 0, tlEdgeLoss = 0
  for (const rn of Object.values(result.nodes)){
    if ((rn as any).type === 'Load'){
      const isNonCritical = (rn as any).critical === false
      const pout = (rn as any).P_out || 0
      if (isNonCritical) tlNonCritical += pout; else tlCritical += pout
    }
    if ((rn as any).type === 'Converter' || (rn as any).type === 'DualOutputConverter') tlConvLoss += ((rn as any).loss || 0)
  }
  for (const e of Object.values(result.edges)) tlEdgeLoss += (e.P_loss_edge || 0)
  rows.push(['Copper traces and power converters','—', 0, 0, tlEdgeLoss, tlConvLoss, (tlEdgeLoss + tlConvLoss), 'NA',''])

  // Deep total summary
  const totalAgg = computeDeepAggregates(project)
  const totalIn = totalAgg.totalLoadPower + totalAgg.edgeLoss + totalAgg.converterLoss
  const effTotal = totalIn>0 ? (totalAgg.criticalLoadPower/totalIn) : 0
  rows.push(['Total','—', totalAgg.criticalLoadPower, totalAgg.nonCriticalLoadPower, totalAgg.edgeLoss, totalAgg.converterLoss, (totalAgg.totalLoadPower + totalAgg.edgeLoss + totalAgg.converterLoss), pct(effTotal), ''])

  return rows
}

function buildConverterTableForProject(project: Project): any[][] {
  const rows: any[][] = []
  const header = ['Name','Location','Type / topology','Vin (V)','Vout (V)','Iout (A)','Input power (W)','Output power (W)','Loss (W)','Loss per phase (W)','Efficiency (%)','Downstream edge loss (W)']
  rows.push(header)

  const summary = buildConverterSummary(project)
  if (summary.length === 0) {
    rows.push(['No converters','','','','','','','','','','',''])
    return rows
  }

  for (const entry of summary) {
    rows.push([
      entry.name,
      entry.location,
      converterTypeLabel(entry),
      vinRangeLabel(entry.vinMin, entry.vinMax),
      voutLabel(entry),
      entry.iout,
      entry.pin,
      entry.pout,
      entry.loss,
      entry.phaseCount && entry.phaseCount > 1 ? (entry.lossPerPhase ?? entry.loss / entry.phaseCount) : '',
      pct(entry.efficiency),
      entry.edgeLoss,
    ])
    if (entry.outputs && entry.outputs.length) {
      for (const output of entry.outputs) {
        const label = output.label || 'Output'
        rows.push([
          `  - ${label}`,
          '',
          'Output',
          '',
          branchVoutLabel(output.vout),
          output.iout,
          output.pin,
          output.pout,
          output.loss,
          output.phaseCount && output.phaseCount > 1 ? (output.lossPerPhase ?? output.loss / output.phaseCount) : '',
          pct(output.efficiency),
          output.edgeLoss,
        ])
      }
    }
  }

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

export async function exportSpreadsheetReport(project: Project, imagesBySheet?: Record<string,string>){
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  wb.modified = new Date()

  const addSheetWithRows = (title: string, rows: any[][]) => {
    const ws = wb.addWorksheet(sanitizeSheetName(title))
    rows.forEach(r => ws.addRow(r))
    // Bold header
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true }
    // Auto width (approx)
    const colCount = rows[0]?.length || 0
    for (let c=1; c<=colCount; c++){
      let max = 8
      for (let r=1; r<=Math.min(rows.length, 200); r++){
        const v = rows[r-1]?.[c-1]
        const len = (v?.toString?.() || '').length
        if (len > max) max = len
      }
      ws.getColumn(c).width = Math.min(40, Math.max(10, Math.ceil(max*0.9)))
    }
    return ws
  }

  const setBreakdownFormats = (ws: ExcelJS.Worksheet)=>{
    const lastRow = ws.rowCount
    for (let r=2; r<=lastRow; r++){
      for (let c=2; c<=7; c++){
        const cell = ws.getRow(r).getCell(c)
        if (typeof cell.value === 'number') cell.numFmt = '0.00'
      }
      const effCell = ws.getRow(r).getCell(8)
      if (typeof effCell.value === 'number') effCell.numFmt = '0.00%'
    }
  }

  const setConverterFormats = (ws: ExcelJS.Worksheet)=>{
    const lastRow = ws.rowCount
    for (let r=2; r<=lastRow; r++){
      for (const c of [4, 5, 6, 7, 8, 9, 10, 12]){
        const cell = ws.getRow(r).getCell(c)
        if (typeof cell.value === 'number') cell.numFmt = '0.00'
      }
      const effCell = ws.getRow(r).getCell(11)
      if (typeof effCell.value === 'number') effCell.numFmt = '0.00%'
    }
  }

  const rootRows = buildTableForProject(project)
  const rootWs = addSheetWithRows('Current Canvas', rootRows)
  setBreakdownFormats(rootWs)

  const rootConverterRows = buildConverterTableForProject(project)
  const wsByName = new Map<string, ExcelJS.Worksheet>()
  const usedNames = new Set<string>()
  wsByName.set(rootWs.name, rootWs)
  usedNames.add(rootWs.name)

  const rootConverterBase = 'Current Canvas Converters'
  let rootConverterName = sanitizeSheetName(rootConverterBase)
  let rootConvSuffix = 1
  while (usedNames.has(rootConverterName) || wsByName.has(rootConverterName)) {
    rootConverterName = sanitizeSheetName(`${rootConverterBase} ${++rootConvSuffix}`)
  }
  const rootConverterWs = addSheetWithRows(rootConverterName, rootConverterRows)
  setConverterFormats(rootConverterWs)
  wsByName.set(rootConverterWs.name, rootConverterWs)
  usedNames.add(rootConverterWs.name)

  const subs = collectSubsystems(project)
  for (const { title, project: p } of subs){
    let name = sanitizeSheetName(title)
    let suffix = 1
    while (usedNames.has(name) || wsByName.has(name)) { name = sanitizeSheetName(`${title} ${++suffix}`) }
    const rows = buildTableForProject(p)
    const ws = addSheetWithRows(name, rows)
    wsByName.set(ws.name, ws)
    usedNames.add(ws.name)
    setBreakdownFormats(ws)

    const converterBase = `${title} Converters`
    let converterName = sanitizeSheetName(converterBase)
    let convSuffix = 1
    while (usedNames.has(converterName) || wsByName.has(converterName)) {
      converterName = sanitizeSheetName(`${converterBase} ${++convSuffix}`)
    }
    const convRows = buildConverterTableForProject(p)
    const convWs = addSheetWithRows(converterName, convRows)
    wsByName.set(convWs.name, convWs)
    usedNames.add(convWs.name)
    setConverterFormats(convWs)
  }

  if (imagesBySheet){
    for (const [sheetName, dataUrl] of Object.entries(imagesBySheet)){
      const ws = wsByName.get(sanitizeSheetName(sheetName))
      if (!ws) continue
      try {
        const base64 = dataUrl.split(',')[1]
        const imgId = wb.addImage({ base64, extension: 'png' })
        ws.addImage(imgId, { tl: { col: 9, row: 1 }, ext: { width: 480, height: 320 } })
      } catch {}
    }
  }

  const out = await wb.xlsx.writeBuffer()
  download(`${project.name.replace(/\s+/g,'_')}_report.xlsx`, out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}
