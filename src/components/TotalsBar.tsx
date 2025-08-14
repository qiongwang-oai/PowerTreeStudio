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
  const setImportedFileName = useStore(s=>s.setImportedFileName)
  const result = compute(project)
  const warns = [...validate(project), ...result.globalWarnings]
  const onExport = ()=> download(project.name.replace(/\s+/g,'_') + '.json', JSON.stringify(project, null, 2))
  const onImport = async (f:File)=>{ const data = await importJson(f); setProject(data); setImportedFileName(f.name) }
  const onReport = ()=> exportReport(project, result)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const onClear = ()=>{
    if (!window.confirm('Clear canvas? This will remove all nodes and edges.')) return
    const cleared = { ...project, nodes: [], edges: [] }
    setProject(cleared)
    setImportedFileName(null)
  }
  return (
    <div className="h-12 bg-white border-t border-slate-200 flex items-center justify-end px-3 text-sm">
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          aria-hidden="true"
          type="file"
          accept="application/json"
          className="hidden"
          onChange={e=>{
            const file = e.target.files?.[0]
            if (file) onImport(file)
            e.currentTarget.value = ''
          }}
        />
        <Button variant="outline" onClick={()=>fileInputRef.current?.click()}>Import</Button>
        <Button variant="outline" onClick={onExport}>Export</Button>
        <Button onClick={onReport}>Report</Button>
        <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={onClear}>Clear</Button>
      </div>
    </div>
  )
}
