import * as React from 'react'
export function Tabs({value,onValueChange,children}:{value:string,onValueChange:(v:string)=>void,children:React.ReactNode}){
  return <div>{React.Children.map(children,(c:any)=>React.cloneElement(c,{value,onValueChange}))}</div>
}
export function TabsList({value,onValueChange,items}:{value:string,onValueChange:(v:string)=>void,items:{value:string,label:string}[]}){
  return <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
    {items.map(it=>(
      <button key={it.value} onClick={()=>onValueChange(it.value)} className={'px-3 py-1.5 rounded-lg ' + (value===it.value?'bg-white shadow':'text-slate-600')} aria-pressed={value===it.value}>
        {it.label}
      </button>
    ))}
  </div>
}
export function TabsContent({value,when,children}:{value:string,when:string,children:React.ReactNode}){
  return value===when? <div className="mt-3">{children}</div> : null
}
