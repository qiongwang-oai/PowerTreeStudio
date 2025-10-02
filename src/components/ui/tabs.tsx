import * as React from 'react'
export function Tabs({value,onValueChange,children}:{value:string,onValueChange:(v:string)=>void,children:React.ReactNode}){
  const arr = React.Children.toArray(children)
  return <div>{arr.map((c:any)=> React.isValidElement(c) ? React.cloneElement(c as React.ReactElement, {value, onValueChange} as any) : c)}</div>
}
export function TabsList({value,onValueChange,items,className=''}:{value:string,onValueChange:(v:string)=>void,items:{value:string,label:string}[],className?:string}){
  return <div className={["flex gap-2 p-1.5 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-100/90 via-white to-slate-100/90", className].filter(Boolean).join(' ')}>
    {items.map(it=>{
      const isActive = value===it.value
      const base = 'px-3.5 py-1.5 rounded-xl text-sm font-medium transition-colors'
      const active = 'bg-sky-600 text-white'
      const inactive = 'text-slate-600 hover:bg-white/70'
      return (
        <button
          key={it.value}
          onClick={()=>onValueChange(it.value)}
          className={[base, isActive ? active : inactive].join(' ')}
          aria-pressed={isActive}
        >
          {it.label}
        </button>
      )
    })}
  </div>
}
export function TabsContent({value,when,children}:{value:string,when:string,children:React.ReactNode}){
  return value===when? <div className="mt-3">{children}</div> : null
}
