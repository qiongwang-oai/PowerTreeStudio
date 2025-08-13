import React from 'react'
import { Button } from './ui/button'
import { useStore } from '../state/store'
import { compute } from '../calc'
import { validate } from '../rules'
import { exportReport } from '../report'
import { download, importJson } from '../io'
import { genId } from '../utils'
export default function TotalsBar(){
  const project = useStore(s=>s.project)
  const setProject = useStore(s=>s.setProject)
  const result = compute(project)
  const warns = [...validate(project), ...result.globalWarnings]
  const onExport = ()=> download(project.name.replace(/\s+/g,'_') + '.json', JSON.stringify(project, null, 2))
  const onImport = async (f:File)=>{ const data = await importJson(f); setProject(data) }
  const onReport = ()=> exportReport(project, result)
  const onClear = ()=>{
    if (!window.confirm('Clear canvas? This will remove all nodes and edges.')) return
    const cleared = { ...project, nodes: [], edges: [] }
    setProject(cleared)
  }
  return (
    <div className="h-12 bg-white border-t border-slate-200 flex items-center justify-between px-3 text-sm">
      <div className="flex gap-6">
        <div>Σ Loads: <b>{result.totals.loadPower.toFixed(2)} W</b></div>
        <div>Σ Sources: <b>{result.totals.sourceInput.toFixed(2)} W</b></div>
        <div>Overall η: <b>{(result.totals.overallEta*100).toFixed(2)}%</b></div>
        <div>Warnings: <b>{warns.length}</b></div>
      </div>
      <div className="flex items-center gap-2">
        <input aria-label="import" type="file" accept="application/json" onChange={e=>e.target.files && onImport(e.target.files[0])} />
        <Button variant="outline" onClick={onExport}>Export</Button>
        <Button onClick={onReport}>Report</Button>
        <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={onClear}>Clear</Button>
      </div>
    </div>
  )
}
