import React from 'react'
import { useStore } from '../state/store'
import { compute } from '../calc'

export default function TotalsBar(){
  const project = useStore(s=>s.project)
  const result = compute(project)

  let criticalLoadPower = 0
  let nonCriticalLoadPower = 0
  let converterLoss = 0
  for (const n of Object.values(result.nodes)){
    if (n.type === 'Load'){
      const isNonCritical = (n as any).critical === false
      const pout = n.P_out || 0
      if (isNonCritical) nonCriticalLoadPower += pout
      else criticalLoadPower += pout
    }
    if (n.type === 'Converter' || n.type === 'DualOutputConverter'){
      converterLoss += (n.loss || 0)
    }
  }
  const edgeLoss = Object.values(result.edges).reduce((a,e)=> a + (e.P_loss_edge || 0), 0)
  const overallEta = result.totals.overallEta || 0
  const totalPower = criticalLoadPower + nonCriticalLoadPower + edgeLoss + converterLoss

  return (
    <div className="h-12 bg-white border-t border-slate-200 flex items-center justify-end px-3 text-sm">
      <div className="flex items-center gap-4 text-slate-700">
        <div><span className="text-slate-500">Total</span>: {totalPower.toFixed(2)} W</div>
        <div><span className="text-slate-500">Critical</span>: {criticalLoadPower.toFixed(2)} W</div>
        <div><span className="text-slate-500">Non-critical</span>: {nonCriticalLoadPower.toFixed(2)} W</div>
        <div><span className="text-slate-500">Copper loss</span>: {edgeLoss.toFixed(2)} W</div>
        <div><span className="text-slate-500">Converter loss</span>: {converterLoss.toFixed(2)} W</div>
        <div><span className="text-slate-500">Efficiency</span>: {(overallEta*100).toFixed(2)}%</div>
      </div>
    </div>
  )
}
