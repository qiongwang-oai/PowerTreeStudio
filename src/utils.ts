export function clamp(v:number, lo:number, hi:number){ return Math.max(lo, Math.min(hi, v)) }
export function fmt(n:number, digits=3){ if (!isFinite(n)) return '—'; return Number(n).toFixed(digits) }
export function genId(prefix:string){ return prefix + Math.random().toString(36).slice(2,8) }
