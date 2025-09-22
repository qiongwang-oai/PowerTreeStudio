import React from 'react'
import { Project } from '../../models'
import { ComputeResult, compute, computeDeepAggregates } from '../../calc'
import { Button } from '../ui/button'
import { exportSpreadsheetReport } from '../../spreadsheetReport'
import { toPng } from 'html-to-image'
import { buildLevelPieData } from '../../reportData'
import LevelPie from './LevelPie'

function formatNumber(n: number): string { return Number.isFinite(n) ? n.toFixed(2) : '0.00' }
function formatPct(frac: number): string { return Number.isFinite(frac) ? (frac*100).toFixed(2) : '0.00' }
function levelBg(level: number): string {
  // blue-50/100/200/300
  const palette = ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd']
  return palette[Math.max(0, (level-1) % palette.length)]
}

export default function ReportDialog({ project, result, onClose }:{ project: Project, result: ComputeResult, onClose: ()=>void }){
  const [expanded, setExpanded] = React.useState<Set<string>>(()=> new Set())
  const toggle = (key: string)=>{
    setExpanded(prev=>{ const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
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
  const extraPies = []

  const renderSection = (proj: Project, res: ComputeResult, depth: number, path: string[], pathNames: string[] = [], collectedPies: React.ReactNode[] = extraPies): React.ReactNode[] => {
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
                    {[
                      ...renderSection(project, result, 0, [], [], extraPies),
                      (()=>{
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
                        const tlTotalIn = tlCritical + tlNonCritical + tlConvLoss + tlEdgeLoss
                        return (
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
                      })(),
                      (()=>{
                        const totalAgg = computeDeepAggregates(project)
                        const totalIn = totalAgg.totalLoadPower + totalAgg.edgeLoss + totalAgg.converterLoss
                        return (
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
                      })(),
                    ]}
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
          </div>
        </div>
      </div>
    </div>
  )
}
