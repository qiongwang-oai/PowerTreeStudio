import React from 'react'
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceDot } from 'recharts'
import { Button } from './ui/button'
import { etaFromModel } from '../calc'
import type { EfficiencyModel } from '../models'

type EfficiencyEditorProps = {
  label?: string
  efficiency: EfficiencyModel | undefined
  maxCurrent: number
  onChange: (value: EfficiencyModel & { _lastCurve?: any }) => void
  analysis?: { P_out?: number; I_out?: number }
  modelNode?: { Pout_max?: number; Iout_max?: number }
}

type CurvePoint = { current: number; eta: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export default function EfficiencyEditor({ label, efficiency, maxCurrent, onChange, analysis, modelNode }: EfficiencyEditorProps) {
  const eff = (efficiency && typeof efficiency === 'object') ? efficiency as EfficiencyModel & { _lastCurve?: any } : { type: 'fixed', value: 0.9 }
  const isCurve = eff.type === 'curve'
  const safeMaxCurrent = Number.isFinite(maxCurrent) && maxCurrent > 0 ? maxCurrent : 1

  const currentPoints = React.useMemo<CurvePoint[]>(() => {
    if (!isCurve) return []
    const pts = Array.isArray((eff as any).points) ? (eff as any).points : []
    const mapped = pts.map((p: any) => {
      let current = 0
      if (typeof p.current === 'number') current = p.current
      else if (typeof p.loadPct === 'number') current = (safeMaxCurrent * p.loadPct / 100)
      return { current, eta: typeof p.eta === 'number' ? p.eta : 0 }
    })
    mapped.sort((a, b) => a.current - b.current)
    return mapped
  }, [eff, isCurve, safeMaxCurrent])

  const graphData = React.useMemo(() => {
    if (!isCurve || currentPoints.length === 0) return []
    const pts = [...currentPoints]
    const first = pts[0]
    const last = pts[pts.length - 1]
    if (first.current > 0) pts.unshift({ current: 0, eta: first.eta })
    if (last.current < safeMaxCurrent) pts.push({ current: safeMaxCurrent, eta: last.eta })
    return pts
  }, [currentPoints, isCurve, safeMaxCurrent])

  const updateCurvePoints = React.useCallback((points: CurvePoint[]) => {
    const sorted = [...points].sort((a, b) => a.current - b.current)
    const mapped = sorted.map(p => ({ current: p.current, loadPct: Math.round(100 * p.current / safeMaxCurrent), eta: p.eta }))
    const next: any = { ...eff, type: 'curve', base: 'Iout_max', points: mapped }
    onChange(next)
  }, [eff, onChange, safeMaxCurrent])

  const handlePointChange = (idx: number, field: keyof CurvePoint, value: number) => {
    const next = currentPoints.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    updateCurvePoints(next)
  }

  const handleAddPoint = () => {
    const mid = safeMaxCurrent / 2
    const avgEta = currentPoints.reduce((sum, p) => sum + p.eta, 0) / (currentPoints.length || 1)
    updateCurvePoints([...currentPoints, { current: mid, eta: avgEta }])
  }

  const handleDeletePoint = (idx: number) => {
    if (currentPoints.length <= 1) return
    const next = currentPoints.filter((_, i) => i !== idx)
    updateCurvePoints(next)
  }

  const handleTypeChange = (value: 'fixed' | 'curve') => {
    const prev = eff as any
    if (value === 'fixed') {
      onChange({
        type: 'fixed',
        value: typeof prev.value === 'number' ? prev.value : 0.92,
        _lastCurve: prev.type === 'curve' ? { base: prev.base, points: prev.points } : prev._lastCurve,
      } as any)
    } else {
      const lastCurve = prev._lastCurve || (prev.type === 'curve' ? { base: prev.base, points: prev.points } : null)
      const defaultPoints = (lastCurve && Array.isArray(lastCurve.points) && lastCurve.points.length > 0)
        ? lastCurve.points
        : [
            { current: 0, eta: 0.85 },
            { current: safeMaxCurrent / 2, eta: 0.92 },
            { current: safeMaxCurrent, eta: 0.9 },
          ]
      onChange({
        type: 'curve',
        base: (lastCurve && lastCurve.base) || prev.base || 'Iout_max',
        points: defaultPoints,
        _lastCurve: lastCurve || prev._lastCurve,
      } as any)
    }
  }

  const handleFixedValueChange = (value: number) => {
    const next: any = { type: 'fixed', value, _lastCurve: (eff as any)._lastCurve }
    onChange(next)
  }

  let computedEta: number | undefined
  if (analysis) {
    try {
      computedEta = etaFromModel(eff as EfficiencyModel, analysis.P_out ?? 0, analysis.I_out ?? 0, (modelNode || {}) as any)
    } catch (_err) {
      computedEta = undefined
    }
  }

  return (
    <div className="space-y-2">
      {label && <div className="text-base text-slate-600 font-medium mt-2">{label}</div>}
      <label className="flex items-center justify-between gap-2">
        <span>Model</span>
        <select className="input" value={isCurve ? 'curve' : 'fixed'} onChange={e => handleTypeChange(e.target.value as 'fixed' | 'curve')}>
          <option value="fixed">fixed</option>
          <option value="curve">curve</option>
        </select>
      </label>
      {isCurve ? (
        <>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={graphData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="current" unit="A" type="number" domain={[0, safeMaxCurrent]} />
                <YAxis domain={[0, 1]} />
                <Tooltip formatter={(v: any, name: string) => (name === 'eta' ? Number(v).toFixed(3) : v)} />
                <Line type="monotone" dataKey="eta" dot />
                {analysis && typeof computedEta === 'number' && (
                  <ReferenceDot
                    x={clamp(analysis.I_out ?? 0, 0, safeMaxCurrent)}
                    y={clamp(computedEta, 0, 1)}
                    r={4}
                    fill="#ef4444"
                    stroke="none"
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2">
            {currentPoints.map((pt, idx) => (
              <div key={`${idx}-${pt.current}`} className="flex items-center gap-2 text-xs">
                <label className="flex items-center gap-1">
                  <span>Current (A)</span>
                  <input
                    type="number"
                    className="input w-24"
                    value={pt.current}
                    min={0}
                    max={safeMaxCurrent}
                    step={0.01}
                    onChange={e => handlePointChange(idx, 'current', clamp(Number(e.target.value), 0, safeMaxCurrent))}
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span>Efficiency</span>
                  <input
                    type="number"
                    className="input w-20"
                    value={pt.eta}
                    min={0}
                    max={1}
                    step={0.001}
                    onChange={e => handlePointChange(idx, 'eta', clamp(Number(e.target.value), 0, 1))}
                  />
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeletePoint(idx)}
                  disabled={currentPoints.length <= 1}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-fit" onClick={handleAddPoint}>
              Add point
            </Button>
          </div>
        </>
      ) : (
        <label className="flex items-center justify-between gap-2">
          <span>η value (0-1)</span>
          <input
            type="number"
            className="input"
            value={typeof (eff as any).value === 'number' ? (eff as any).value : ''}
            min={0}
            max={1}
            step={0.001}
            onChange={e => handleFixedValueChange(clamp(Number(e.target.value), 0, 1))}
          />
        </label>
      )}
      {analysis && (
        <div className="text-sm text-slate-600 space-y-1">
          <div>
            I<sub>out</sub> (computed): <b>{(analysis.I_out ?? 0).toFixed(4)} A</b>
          </div>
          {typeof computedEta === 'number' && (
            <div>
              η (at I<sub>out</sub> = {(analysis.I_out ?? 0).toFixed(3)} A): <b>{computedEta.toFixed(4)}</b>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
