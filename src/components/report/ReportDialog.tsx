import React from 'react'
import { Project } from '../../models'
import { ComputeResult, compute, computeDeepAggregates } from '../../calc'
import { Button } from '../ui/button'
import { exportSpreadsheetReport } from '../../spreadsheetReport'
import { toPng } from 'html-to-image'
import { buildLevelPieData } from '../../reportData'
import { buildConverterSummary, ConverterSummaryEntry } from '../../converterSummary'
import LevelPie from './LevelPie'

function formatNumber(n: number): string { return Number.isFinite(n) ? n.toFixed(2) : '0.00' }
function formatPct(frac: number): string { return Number.isFinite(frac) ? (frac*100).toFixed(2) : '0.00' }
function levelBg(level: number): string {
  // blue-50/100/200/300
  const palette = ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd']
  return palette[Math.max(0, (level-1) % palette.length)]
}
function formatVoltage(value?: number): string {
  return Number.isFinite(value) ? (value as number).toFixed(2) : '—'
}
function formatTopology(value?: string | null): string {
  if (!value) return ''
  if (value.toLowerCase() === 'llc') return 'LLC'
  return value.charAt(0).toUpperCase() + value.slice(1)
}
function formatTypeTopology(entry: ConverterSummaryEntry): string {
  const typeLabel = entry.nodeType === 'Converter' ? 'Converter' : 'Dual-output converter'
  const topo = formatTopology(entry.topology as string | undefined)
  return topo ? `${typeLabel} / ${topo}` : typeLabel
}
function formatVinRange(min?: number, max?: number): string {
  const hasMin = Number.isFinite(min)
  const hasMax = Number.isFinite(max)
  if (hasMin && hasMax) {
    const minVal = min as number
    const maxVal = max as number
    if (Math.abs(minVal - maxVal) < 1e-6) return formatVoltage(minVal)
    return `${formatVoltage(minVal)} – ${formatVoltage(maxVal)}`
  }
  if (hasMin) return formatVoltage(min)
  if (hasMax) return formatVoltage(max)
  return '—'
}
function formatVoutSummary(entry: ConverterSummaryEntry): string {
  if (entry.nodeType === 'Converter') return formatVoltage(entry.vout)
  if (!entry.vouts || entry.vouts.length === 0) return '—'
  return entry.vouts.map(v => {
    const value = formatVoltage(v.value)
    const label = (v.label || '').trim()
    return label ? `${label}: ${value}` : value
  }).join(', ')
}

type ReportView = 'prompt' | 'system' | 'converter'

export default function ReportDialog({ project, result, onClose }:{ project: Project, result: ComputeResult, onClose: ()=>void }){
  const [viewMode, setViewMode] = React.useState<ReportView>('prompt')
  const [expanded, setExpanded] = React.useState<Set<string>>(()=> new Set())
  const toggle = (key: string)=>{
    setExpanded(prev=>{ const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }
  const [converterExpanded, setConverterExpanded] = React.useState<Set<string>>(()=> new Set())
  const toggleConverter = (key: string)=>{
    setConverterExpanded(prev=>{ const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }
  const sanitizeSheetName = (name: string): string => {
    const cleaned = name.replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet'
    return cleaned
  }
  const collectSubsystems = (proj, path = []) => {
    const subs = []
    for (const n of (proj.nodes || [])){
      if ((n && (n as any).type) === 'Subsystem' && (n as any).project){
        const sub = n as any
        const inner = JSON.parse(JSON.stringify(sub.project))
        inner.currentScenario = proj.currentScenario
        const title = [...path, (sub.name || 'Subsystem')].join(' / ')
        subs.push({ title, project: inner })
        subs.push(...collectSubsystems(inner, [...path, (sub.name || 'Subsystem')]))
      }
    }
    return subs
  }
const allSubsystems = React.useMemo(()=> collectSubsystems(project), [project])
const converterSummary = React.useMemo(()=> buildConverterSummary(project, result), [project, result])

const renderSection = (proj: Project, res: ComputeResult, depth: number, path: string[], pathNames: string[] = [], collectedPies: React.ReactNode[]): React.ReactNode[] => {
    const nodes = proj.nodes as any[]
    const items: { crit: number, total: number, name: string, content: React.ReactNode[] }[] = []
    // Subsystems and loads: collect then sort by Critical load (W)
    for (const n of nodes){
      if (n.type === 'Subsystem'){
        const sub = n
        const count = Math.max(1, Math.round((sub.numParalleledSystems ?? 1)))
        const innerProject: Project = JSON.parse(JSON.stringify(sub.project || { id:'empty', name:'Embedded', units: proj.units, defaultMargins: proj.defaultMargins, scenarios: proj.scenarios, currentScenario: proj.currentScenario, nodes: [], edges: [] }))
        innerProject.currentScenario = proj.currentScenario
        const agg = computeDeepAggregates(innerProject)
        const totalIn = agg.totalLoadPower + agg.edgeLoss + agg.converterLoss
        const key = [...path, sub.id].join('>')
        const sheetTitle = sanitizeSheetName([...pathNames, sub.name || 'Subsystem'].join(' / '))
        const content: React.ReactNode[] = [
          (
            <tr key={`row-${key}`} className="border-b">
              <td className="px-2 py-2 text-left whitespace-nowrap" style={{paddingLeft: depth? depth*12 : undefined}}>{sub.name || 'Subsystem'}</td>
              <td className="px-2 py-2 text-right">{count}</td>
              <td className="px-2 py-2 text-right">{formatNumber(agg.criticalLoadPower * count)}</td>
              <td className="px-2 py-2 text-right">{formatNumber(agg.nonCriticalLoadPower * count)}</td>
              <td className="px-2 py-2 text-right">{formatNumber(agg.edgeLoss * count)}</td>
              <td className="px-2 py-2 text-right">{formatNumber(agg.converterLoss * count)}</td>
              <td className="px-2 py-2 text-right">{formatNumber((agg.criticalLoadPower + agg.nonCriticalLoadPower + agg.edgeLoss + agg.converterLoss) * count)}</td>
              <td className="px-2 py-2 text-right">{formatPct(totalIn>0 ? (agg.criticalLoadPower/totalIn) : 0)}</td>
              <td className="px-2 py-2 text-left whitespace-nowrap">
                <Button size="sm" variant="outline" onClick={()=>toggle(key)}>{expanded.has(key)? 'Collapse':'Expand'}</Button>
              </td>
            </tr>
          )
        ]
        if (expanded.has(key)){
          // Compute nesting visuals first so bgColor is available for rows defined below
          const nestingLevel = depth+1
          const indentPx = nestingLevel*36
          const bgColor = levelBg(nestingLevel)

          const innerResult = compute(innerProject)
          const pieData = buildLevelPieData(innerProject, innerResult)
          const innerRows = renderSection(innerProject, innerResult, depth+1, [...path, sub.id], [...pathNames, sub.name || 'Subsystem'], collectedPies)
          // Top-Level System row for this subsystem
          let tlCritical = 0, tlNonCritical = 0, tlConvLoss = 0, tlEdgeLoss = 0
          for (const rn of Object.values(innerResult.nodes)){
            if ((rn as any).type === 'Load'){
              const isNonCritical = (rn as any).critical === false
              const pout = (rn as any).P_out || 0
              if (isNonCritical) tlNonCritical += pout; else tlCritical += pout
            }
            if ((rn as any).type === 'Converter' || (rn as any).type === 'DualOutputConverter') tlConvLoss += ((rn as any).loss || 0)
          }
          for (const e of Object.values(innerResult.edges)) tlEdgeLoss += (e.P_loss_edge || 0)
          const tlTotalIn = tlCritical + tlNonCritical + tlConvLoss + tlEdgeLoss
          const summaryRows = [
            <tr key={`inner-top-${key}`} className="border-b" style={{ backgroundColor: bgColor }}>
              <td className="px-2 py-2 text-left whitespace-nowrap" style={{paddingLeft: (depth+1)? (depth+1)*12 : undefined}}>Copper traces and power converters</td>
              <td className="px-2 py-2 text-right">—</td>
              <td className="px-2 py-2 text-right">{formatNumber(0)}</td>
              <td className="px-2 py-2 text-right">{formatNumber(0)}</td>
              <td className="px-2 py-2 text-right">{formatNumber(tlEdgeLoss)}</td>
              <td className="px-2 py-2 text-right">{formatNumber(tlConvLoss)}</td>
              <td className="px-2 py-2 text-right">{formatNumber(tlEdgeLoss + tlConvLoss)}</td>
              <td className="px-2 py-2 text-right">NA</td>
              <td className="px-2 py-2 text-left whitespace-nowrap">—</td>
            </tr>,
          ]
          const totalAgg = computeDeepAggregates(innerProject)
          const totalInInner = totalAgg.totalLoadPower + totalAgg.edgeLoss + totalAgg.converterLoss
          const deepRow = (
            <tr key={`inner-total-${key}`} className="border-t font-semibold" style={{ backgroundColor: bgColor }}>
              <td className="px-2 py-2 text-left whitespace-nowrap" style={{paddingLeft: (depth+1)? (depth+1)*12 : undefined}}>Total</td>
              <td className="px-2 py-2 text-right">—</td>
              <td className="px-2 py-2 text-right">{formatNumber(totalAgg.criticalLoadPower)}</td>
              <td className="px-2 py-2 text-right">{formatNumber(totalAgg.nonCriticalLoadPower)}</td>
              <td className="px-2 py-2 text-right">{formatNumber(totalAgg.edgeLoss)}</td>
              <td className="px-2 py-2 text-right">{formatNumber(totalAgg.converterLoss)}</td>
              <td className="px-2 py-2 text-right">{formatNumber(totalAgg.totalLoadPower + totalAgg.edgeLoss + totalAgg.converterLoss)}</td>
              <td className="px-2 py-2 text-right">{formatPct(totalInInner>0 ? (totalAgg.criticalLoadPower/totalInInner) : 0)}</td>
              <td className="px-2 py-2 text-left whitespace-nowrap">—</td>
            </tr>
          )
          content.push(
            <tr key={`expanded-${key}`}>
              <td className="px-0 py-0" colSpan={9}>
                <div className="relative" style={{paddingLeft: indentPx, paddingTop: 10, paddingBottom: 14, backgroundColor: bgColor, border: '1px solid #cbd5e1', borderRadius: 8, marginTop: 8, marginBottom: 8}}>
                  <div className="absolute" style={{left: 0, top: -14, width: indentPx, height: 32}}>
                    <div className="absolute left-0 top-0 bottom-0 bg-slate-400" style={{width: 3}} />
                    <div className="absolute left-0 top-0 bg-slate-400" style={{height: 3, width: indentPx}} />
                  </div>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b text-slate-700" style={{ backgroundColor: bgColor }}>
                        <th className="text-left px-2 py-2 font-bold">Name</th>
                        <th className="text-right px-2 py-2 font-bold">Paralleled</th>
                        <th className="text-right px-2 py-2 font-bold">Critical load (W)</th>
                        <th className="text-right px-2 py-2 font-bold">Non-critical load (W)</th>
                        <th className="text-right px-2 py-2 font-bold">Copper loss (W)</th>
                        <th className="text-right px-2 py-2 font-bold">Converter loss (W)</th>
                        <th className="text-right px-2 py-2 font-bold">Total subsystem power (W)</th>
                        <th className="text-right px-2 py-2 font-bold">Efficiency (%)</th>
                        <th className="text-left px-2 py-2 font-bold">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {innerRows}
                      {summaryRows}
                      {deepRow}
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          )
          collectedPies.push(
            <div key={`pie-${key}`} className="border rounded-md p-2 bg-white" id={`pie-${key}`} data-sheet-name={sheetTitle} style={{minWidth: 560, height: 360}}>
              <LevelPie data={pieData} title={`Subsystem power breakdown: ${sub.name || 'Subsystem'}`} />
            </div>
          )
          // Insert a header row to resume the outer table after the expanded block
          content.push(
            <tr key={`resume-header-${key}`} className="border-b text-slate-700" style={depth===0? undefined : { backgroundColor: levelBg(depth) }}>
              <td className="text-left px-2 py-2 font-bold">Name</td>
              <td className="text-right px-2 py-2 font-bold">Paralleled</td>
              <td className="text-right px-2 py-2 font-bold">Critical load (W)</td>
              <td className="text-right px-2 py-2 font-bold">Non-critical load (W)</td>
              <td className="text-right px-2 py-2 font-bold">Copper loss (W)</td>
              <td className="text-right px-2 py-2 font-bold">Converter loss (W)</td>
              <td className="text-right px-2 py-2 font-bold">Total subsystem power (W)</td>
              <td className="text-right px-2 py-2 font-bold">Efficiency (%)</td>
              <td className="text-left px-2 py-2 font-bold">Details</td>
            </tr>
          )
        }
        const criticalTotal = agg.criticalLoadPower * count
        const totalPower = (agg.criticalLoadPower + agg.nonCriticalLoadPower + agg.edgeLoss + agg.converterLoss) * count
        items.push({ crit: criticalTotal, total: totalPower, name: (sub.name || 'Subsystem'), content })
      }
    }
    // Loads
    for (const n of Object.values(res.nodes)){
      if ((n as any).type === 'Load'){
        const load = n as any
        const pout = load.P_out || 0
        const isNonCritical = load.critical === false
        const criticalPower = isNonCritical ? 0 : pout
        const nonCriticalPower = isNonCritical ? pout : 0
        const copperLoss = 0
        const converterLoss = 0
        const denom = criticalPower + nonCriticalPower + copperLoss + converterLoss
        const eta = denom>0 ? (criticalPower/denom) : 0
        items.push({
          crit: criticalPower,
          total: denom,
          name: (load.name || 'Load'),
          content: [
            (
              <tr key={`row-load-${[...path, load.id].join('>')}`} className="border-b">
                <td className="px-2 py-2 text-left whitespace-nowrap" style={{paddingLeft: depth? depth*12 : undefined}}>{load.name || 'Load'}</td>
                <td className="px-2 py-2 text-right">{Math.max(1, Math.round((load.numParalleledDevices ?? 1)))}</td>
                <td className="px-2 py-2 text-right">{formatNumber(criticalPower)}</td>
                <td className="px-2 py-2 text-right">{formatNumber(nonCriticalPower)}</td>
                <td className="px-2 py-2 text-right">{formatNumber(copperLoss)}</td>
                <td className="px-2 py-2 text-right">{formatNumber(converterLoss)}</td>
                <td className="px-2 py-2 text-right">{formatNumber(denom)}</td>
                <td className="px-2 py-2 text-right">{formatPct(eta)}</td>
                <td className="px-2 py-2 text-left whitespace-nowrap">—</td>
              </tr>
            )
          ]
        })
      }
    }
    items.sort((a,b)=> (b.crit - a.crit) || (b.total - a.total) || b.name.localeCompare(a.name))
    const rows: React.ReactNode[] = []
    for (const it of items) rows.push(...it.content)
    return rows
  }

  const renderSystemContent = (): React.ReactNode => {
    const extraPies: React.ReactNode[] = []
    const sectionRows = renderSection(project, result, 0, [], [], extraPies)

    let tlCritical = 0
    let tlNonCritical = 0
    let tlConvLoss = 0
    let tlEdgeLoss = 0
    for (const rn of Object.values(result.nodes)){
      if ((rn as any).type === 'Load'){
        const isNonCritical = (rn as any).critical === false
        const pout = (rn as any).P_out || 0
        if (isNonCritical) tlNonCritical += pout; else tlCritical += pout
      }
      if ((rn as any).type === 'Converter' || (rn as any).type === 'DualOutputConverter') tlConvLoss += ((rn as any).loss || 0)
    }
    for (const e of Object.values(result.edges)) tlEdgeLoss += (e.P_loss_edge || 0)
    const tlTotalIn = tlCritical + tlNonCritical + tlConvLoss + tlEdgeLoss

    const topLevelSummaryRow = (
      <tr key="top-level-summary" className="border-b bg-white">
        <td className="px-2 py-2 text-left whitespace-nowrap">Copper traces and power converters</td>
        <td className="px-2 py-2 text-right">—</td>
        <td className="px-2 py-2 text-right">{formatNumber(0)}</td>
        <td className="px-2 py-2 text-right">{formatNumber(0)}</td>
        <td className="px-2 py-2 text-right">{formatNumber(tlEdgeLoss)}</td>
        <td className="px-2 py-2 text-right">{formatNumber(tlConvLoss)}</td>
        <td className="px-2 py-2 text-right">{formatNumber(tlTotalIn)}</td>
        <td className="px-2 py-2 text-right">NA</td>
        <td className="px-2 py-2 text-left whitespace-nowrap">—</td>
      </tr>
    )

    const totalAgg = computeDeepAggregates(project)
    const totalIn = totalAgg.totalLoadPower + totalAgg.edgeLoss + totalAgg.converterLoss
    const totalSummaryRow = (
      <tr key="total-summary" className="border-t font-semibold bg-slate-50">
        <td className="px-2 py-2 text-left whitespace-nowrap">Total</td>
        <td className="px-2 py-2 text-right">—</td>
        <td className="px-2 py-2 text-right">{formatNumber(totalAgg.criticalLoadPower)}</td>
        <td className="px-2 py-2 text-right">{formatNumber(totalAgg.nonCriticalLoadPower)}</td>
        <td className="px-2 py-2 text-right">{formatNumber(totalAgg.edgeLoss)}</td>
        <td className="px-2 py-2 text-right">{formatNumber(totalAgg.converterLoss)}</td>
        <td className="px-2 py-2 text-right">{formatNumber(totalAgg.totalLoadPower + totalAgg.edgeLoss + totalAgg.converterLoss)}</td>
        <td className="px-2 py-2 text-right">{formatPct(totalIn>0 ? (totalAgg.criticalLoadPower/totalIn) : 0)}</td>
        <td className="px-2 py-2 text-left whitespace-nowrap">—</td>
      </tr>
    )

    return (
      <div className="grid gap-3" style={{gridTemplateColumns: '1fr 560px'}}>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-slate-700">
                <th className="text-left px-2 py-2 font-bold">Name</th>
                <th className="text-right px-2 py-2 font-bold">Paralleled</th>
                <th className="text-right px-2 py-2 font-bold">Critical load (W)</th>
                <th className="text-right px-2 py-2 font-bold">Non-critical load (W)</th>
                <th className="text-right px-2 py-2 font-bold">Copper loss (W)</th>
                <th className="text-right px-2 py-2 font-bold">Converter loss (W)</th>
                <th className="text-right px-2 py-2 font-bold">Total subsystem power (W)</th>
                <th className="text-right px-2 py-2 font-bold">Efficiency (%)</th>
                <th className="text-left px-2 py-2 font-bold">Details</th>
              </tr>
            </thead>
            <tbody>
              {sectionRows}
              {topLevelSummaryRow}
              {totalSummaryRow}
            </tbody>
          </table>
        </div>
        <div className="space-y-3" style={{minWidth: 560}}>
          <div className="border rounded-md p-2 bg-white" id="pie-root" style={{height: 360}}>
            <LevelPie data={buildLevelPieData(project, result)} title="System power breakdown" />
          </div>
          {extraPies}
          <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0 }}>
            {allSubsystems.map(({ title, project: p }, idx)=>{
              const res = compute(p)
              const data = buildLevelPieData(p, res)
              return (
                <div key={`hidden-${idx}`} id={`pie-hidden-${idx}`} data-sheet-name={sanitizeSheetName(title)} style={{ width: 560, height: 360 }}>
                  <LevelPie data={data} title={`Subsystem power breakdown: ${title}`} />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const renderConverterContent = (): React.ReactNode => (
    <div className="overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b text-slate-700">
            <th className="text-left px-2 py-2 font-bold">Name</th>
            <th className="text-left px-2 py-2 font-bold">Location</th>
            <th className="text-left px-2 py-2 font-bold">Type / topology</th>
            <th className="text-right px-2 py-2 font-bold">Vin (V)</th>
            <th className="text-right px-2 py-2 font-bold">Vout (V)</th>
            <th className="text-right px-2 py-2 font-bold">Iout (A)</th>
            <th className="text-right px-2 py-2 font-bold">Input power (W)</th>
            <th className="text-right px-2 py-2 font-bold">Output power (W)</th>
            <th className="text-right px-2 py-2 font-bold">Loss (W)</th>
            <th className="text-right px-2 py-2 font-bold">Loss per phase (W)</th>
            <th className="text-right px-2 py-2 font-bold">Efficiency (%)</th>
            <th className="text-right px-2 py-2 font-bold">Downstream edge loss (W)</th>
            <th className="text-left px-2 py-2 font-bold">Details</th>
          </tr>
        </thead>
        <tbody>
          {converterSummary.length === 0 ? (
            <tr>
              <td colSpan={13} className="px-2 py-3 text-center text-slate-500">No converters in this system.</td>
            </tr>
          ) : converterSummary.map(entry => {
            const isDual = entry.nodeType === 'DualOutputConverter'
            const hasOutputs = !!(entry.outputs && entry.outputs.length)
            const entryKey = entry.key
            const isExpanded = isDual && hasOutputs && converterExpanded.has(entryKey)
            return (
              <React.Fragment key={entryKey}>
                <tr className="border-b">
                  <td className="px-2 py-2 text-left whitespace-nowrap">{entry.name}</td>
                  <td className="px-2 py-2 text-left whitespace-nowrap">{entry.location}</td>
                  <td className="px-2 py-2 text-left whitespace-nowrap">{formatTypeTopology(entry)}</td>
                  <td className="px-2 py-2 text-right">{formatVinRange(entry.vinMin, entry.vinMax)}</td>
                  <td className="px-2 py-2 text-right">{formatVoutSummary(entry)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(entry.iout)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(entry.pin)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(entry.pout)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(entry.loss)}</td>
                  <td className="px-2 py-2 text-right">{entry.phaseCount && entry.phaseCount > 1 ? formatNumber(entry.lossPerPhase ?? entry.loss / entry.phaseCount) : '—'}</td>
                  <td className="px-2 py-2 text-right">{formatPct(entry.efficiency)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(entry.edgeLoss)}</td>
                  <td className="px-2 py-2 text-left whitespace-nowrap">
                    {isDual && hasOutputs ? (
                      <Button size="sm" variant="outline" onClick={()=>toggleConverter(entryKey)}>
                        {converterExpanded.has(entryKey) ? 'Hide outputs' : 'Show outputs'}
                      </Button>
                    ) : '—'}
                  </td>
                </tr>
                {isExpanded ? (
                  <tr key={`${entryKey}-details`}>
                    <td colSpan={13} className="px-0 py-0">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b text-slate-700">
                              <th className="text-left px-2 py-2 font-bold">Output</th>
                              <th className="text-right px-2 py-2 font-bold">Vout (V)</th>
                              <th className="text-right px-2 py-2 font-bold">Iout (A)</th>
                              <th className="text-right px-2 py-2 font-bold">Input power (W)</th>
                              <th className="text-right px-2 py-2 font-bold">Output power (W)</th>
                              <th className="text-right px-2 py-2 font-bold">Loss (W)</th>
                              <th className="text-right px-2 py-2 font-bold">Loss per phase (W)</th>
                              <th className="text-right px-2 py-2 font-bold">Efficiency (%)</th>
                              <th className="text-right px-2 py-2 font-bold">Downstream edge loss (W)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.outputs!.map(output => (
                              <tr key={output.id} className="border-b last:border-b-0">
                                <td className="px-2 py-2 text-left whitespace-nowrap">{output.label}</td>
                                <td className="px-2 py-2 text-right">{formatVoltage(output.vout)}</td>
                                <td className="px-2 py-2 text-right">{formatNumber(output.iout)}</td>
                                <td className="px-2 py-2 text-right">{formatNumber(output.pin)}</td>
                                <td className="px-2 py-2 text-right">{formatNumber(output.pout)}</td>
                                <td className="px-2 py-2 text-right">{formatNumber(output.loss)}</td>
                                <td className="px-2 py-2 text-right">{output.phaseCount && output.phaseCount > 1 ? formatNumber(output.lossPerPhase ?? output.loss / output.phaseCount) : '—'}</td>
                                <td className="px-2 py-2 text-right">{formatPct(output.efficiency)}</td>
                                <td className="px-2 py-2 text-right">{formatNumber(output.edgeLoss)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-start justify-center overflow-auto p-6">
        <div className="bg-white rounded-lg shadow-xl w-[min(1920px,100%)] border border-slate-200">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="text-lg font-semibold">Power Breakdown</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={async()=>{
                const images: Record<string,string> = {}
                const rootEl = document.getElementById('pie-root')
                if (rootEl) {
                  try { images[sanitizeSheetName('Current Canvas')] = await toPng(rootEl, { pixelRatio: 2, backgroundColor: '#ffffff' }) } catch {}
                }
                const innerEls = Array.from(document.querySelectorAll('[id^="pie-"]')) as HTMLElement[]
                for (const el of innerEls){
                  if (el.id === 'pie-root') continue
                  const sheet = (el.getAttribute('data-sheet-name') || '').trim()
                  if (!sheet) continue
                  try { images[sheet] = await toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff' }) } catch {}
                }
                exportSpreadsheetReport(project, images)
              }}>Download spreadsheet report</Button>
              <Button size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
          <div className="p-4 overflow-auto">
            {viewMode === 'prompt' ? (
              <div className="flex flex-col items-center justify-center min-h-[360px] text-center">
                <div className="text-base font-semibold text-slate-700 mb-2">Choose the report view</div>
                <p className="text-sm text-slate-600 max-w-xl mb-6">Select which summary you want to review. You can switch views at any time.</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button onClick={()=>setViewMode('system')}>System power breakdown</Button>
                  <Button variant="outline" onClick={()=>setViewMode('converter')}>Converter summary</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-600 mr-1">View:</span>
                  <Button size="sm" variant={viewMode==='system' ? 'default' : 'outline'} onClick={()=>setViewMode('system')}>System power breakdown</Button>
                  <Button size="sm" variant={viewMode==='converter' ? 'default' : 'outline'} onClick={()=>setViewMode('converter')}>Converter summary</Button>
                </div>
                {viewMode === 'system' ? renderSystemContent() : renderConverterContent()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
