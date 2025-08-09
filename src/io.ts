import { Project } from './models'
const AUTOSAVE_KEY = 'powertree_autosave_v1'
export function autosave(project: Project){ localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project)) }
export function loadAutosave(): Project | null { const s = localStorage.getItem(AUTOSAVE_KEY); return s? JSON.parse(s) : null }
export function download(filename: string, content: string, mime='application/json'){ const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url) }
export function importJson(file: File): Promise<any>{ return new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>{ try{ resolve(JSON.parse(String(reader.result))) }catch(e){ reject(e) } }; reader.onerror=reject; reader.readAsText(file) }) }
