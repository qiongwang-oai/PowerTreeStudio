import { Project } from './models'
const AUTOSAVE_KEY = 'powertree_autosave_v1'
export function autosave(project: Project){ localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project)) }
export function loadAutosave(): Project | null { const s = localStorage.getItem(AUTOSAVE_KEY); return s? JSON.parse(s) : null }
export function download(filename: string, content: BlobPart, mime='application/json'){
  const fallback = () => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const savePicker: any = (window as any).showSaveFilePicker
  if (typeof savePicker === 'function'){
    void (async () => {
      try {
        const extMatch = /\.[^./\\]+$/.exec(filename)
        const extension = extMatch ? extMatch[0] : (mime === 'application/json' ? '.json' : (mime === 'text/markdown' ? '.md' : ''))
        const types = extension ? [
          { description: `${extension.toUpperCase().slice(1)} file`, accept: { [mime]: [extension] } }
        ] : undefined
        const handle = await savePicker({ suggestedName: filename, types })
        const writable = await handle.createWritable()
        await writable.write(new Blob([content], { type: mime }))
        await writable.close()
      } catch (err:any) {
        if (err && err.name === 'AbortError') return
        fallback()
      }
    })()
    return
  }

  fallback()
}
export function importJson(file: File): Promise<any>{ return new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>{ try{ resolve(JSON.parse(String(reader.result))) }catch(e){ reject(e) } }; reader.onerror=reject; reader.readAsText(file) }) }
