import * as React from 'react'
export function Card({children, className=''}:{children:React.ReactNode,className?:string}){ return <div className={'rounded-2xl bg-white shadow-sm border border-slate-200 ' + className}>{children}</div> }
export function CardHeader({children, className=''}:{children:React.ReactNode,className?:string}){ return <div className={'px-4 py-3 border-b border-slate-200 ' + className}>{children}</div> }
export function CardContent({children, className=''}:{children:React.ReactNode,className?:string}){ return <div className={'p-4 ' + className}>{children}</div> }
