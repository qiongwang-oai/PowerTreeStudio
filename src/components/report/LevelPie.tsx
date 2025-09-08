import React from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { LevelSlice } from '../../reportData'

export default function LevelPie({ data, title, id }:{ data: LevelSlice[], title: string, id?: string }){
  const total = data.reduce((a, s) => a + (s.value || 0), 0)
  const fmt = (n: number)=> Number.isFinite(n)? n.toFixed(2) : '0.00'
  const tooltipFormatter = (value: any, name: any)=> [`${fmt(value as number)} W (${((value as number)/Math.max(total,1e-9)*100).toFixed(1)}%)`, name]

  return (
    <div id={id} className="w-full h-full flex flex-col">
      <div className="text-sm font-semibold text-slate-700 mb-2">{title}</div>
      <div className="flex-1 min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={60} outerRadius={100} stroke="#fff" strokeWidth={1} isAnimationActive={false}>
              {data.map((entry, index) => (
                <Cell key={`cell-${entry.id}`} fill={entry.color || '#8884d8'} />
              ))}
            </Pie>
            <Tooltip formatter={tooltipFormatter} />
            <Legend verticalAlign="bottom" align="center" layout="horizontal" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs text-slate-500 mt-1">Total: {fmt(total)} W</div>
    </div>
  )
}


