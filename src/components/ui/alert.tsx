import * as React from 'react'
export function Alert({children, variant='default'}:{children:React.ReactNode, variant?:'default'|'destructive'}){
  return <div role="alert" className={'rounded-xl px-3 py-2 text-sm ' + (variant==='destructive'?'bg-red-50 text-red-700 border border-red-200':'bg-slate-50 text-slate-700 border border-slate-200')}>{children}</div>
}
