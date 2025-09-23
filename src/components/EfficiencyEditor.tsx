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
  modelNode?: { Pout_max?: number; Iout_max?: number; phaseCount?: number }
}

type CurvePoint = { current: number; eta: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export default function EfficiencyEditor({ label, efficiency, maxCurrent, onChange, analysis, modelNode }: EfficiencyEditorProps) {
  const eff = (efficiency && typeof efficiency === 'object') ? efficiency as EfficiencyModel & { _lastCurve?: any } : { type: 'fixed', value: 0.9 }
  const isCurve = eff.type === 'curve'

  const fallbackMaxCurrent = Number.isFinite(maxCurrent) && maxCurrent > 0 ? maxCurrent : 1
  const phaseCountRaw = modelNode?.phaseCount
  const phaseCount = Number.isFinite(phaseCountRaw) && (phaseCountRaw as number) > 0 ? Math.max(1, Math.round(phaseCountRaw as number)) : 1
  const canUsePerPhase = phaseCount > 1
  const storedPerPhase = !!(eff as any).perPhase
  const perPhaseActive = canUsePerPhase ? storedPerPhase : false
  const perPhaseMaxCurrent = fallbackMaxCurrent / Math.max(phaseCount, 1)
  const axisMaxCurrent = perPhaseActive ? perPhaseMaxCurrent : fallbackMaxCurrent
  const safeAxisMaxCurrent = axisMaxCurrent > 0 ? axisMaxCurrent : (fallbackMaxCurrent > 0 ? fallbackMaxCurrent : 1)

  const currentPoints = React.useMemo<CurvePoint[]>(() => {
    if (!isCurve) return []
    const pts = Array.isArray((eff as any).points) ? (eff as any).points : []
    return pts.map((p: any) => {
      let current = 0
      if (typeof p.current === 'number' && Number.isFinite(p.current)) current = p.current
      else if (typeof p.loadPct === 'number' && Number.isFinite(p.loadPct)) current = safeAxisMaxCurrent * p.loadPct / 100
      return { current, eta: typeof p.eta === 'number' ? p.eta : 0 }
    })
  }, [eff, isCurve, safeAxisMaxCurrent])

  const graphData = React.useMemo(() => {
    if (!isCurve || currentPoints.length === 0) return []
    const pts = [...currentPoints].sort((a, b) => a.current - b.current)
    const first = pts[0]
    const last = pts[pts.length - 1]
    if (first.current > 0) pts.unshift({ current: 0, eta: first.eta })
    if (last.current < safeAxisMaxCurrent) pts.push({ current: safeAxisMaxCurrent, eta: last.eta })
    return pts
  }, [currentPoints, isCurve, safeAxisMaxCurrent])

  const updateCurvePoints = React.useCallback((points: CurvePoint[], options?: { perPhase?: boolean }) => {
    const targetPerPhase = options?.perPhase ?? ((eff as any).perPhase ?? false)
    const effectivePerPhase = canUsePerPhase ? targetPerPhase : false
    const axis = effectivePerPhase ? perPhaseMaxCurrent : fallbackMaxCurrent
    const safeAxis = axis > 0 ? axis : (fallbackMaxCurrent > 0 ? fallbackMaxCurrent : 1)
    const mapped = points.map(pt => {
      const current = clamp(Number.isFinite(pt.current) ? pt.current : 0, 0, safeAxis)
      const eta = clamp(Number.isFinite(pt.eta) ? pt.eta : 0, 0, 1)
      const entry: any = { eta }
      if (Number.isFinite(current)) entry.current = current
      if (safeAxis > 0) entry.loadPct = clamp((current / safeAxis) * 100, 0, 100)
      return entry
    })
    const next: any = {
      ...eff,
      type: 'curve',
      base: (eff as any).base || 'Iout_max',
      points: mapped,
      perPhase: effectivePerPhase,
    }
    onChange(next)
  }, [eff, onChange, canUsePerPhase, perPhaseMaxCurrent, fallbackMaxCurrent])

  const handlePointChange = (idx: number, field: keyof CurvePoint, value: number) => {
    const next = currentPoints.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    updateCurvePoints(next)
  }

  const handleAddPoint = () => {
    const mid = safeAxisMaxCurrent / 2
    const avgEta = currentPoints.reduce((sum, p) => sum + p.eta, 0) / (currentPoints.length || 1)
    updateCurvePoints([...currentPoints, { current: mid, eta: avgEta }])
  }

  const handleSortPoints = () => {
    if (currentPoints.length < 2) return
    const sorted = [...currentPoints].sort((a, b) => a.current - b.current)
    updateCurvePoints(sorted)
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
        perPhase: canUsePerPhase ? perPhaseActive : undefined,
        _lastCurve: prev.type === 'curve' ? { base: prev.base, points: prev.points, perPhase: prev.perPhase } : prev._lastCurve,
      } as any)
    } else {
      const lastCurve = prev._lastCurve || (prev.type === 'curve' ? { base: prev.base, points: prev.points, perPhase: prev.perPhase } : null)
      if (lastCurve && Array.isArray(lastCurve.points) && lastCurve.points.length > 0) {
        onChange({
          type: 'curve',
          base: lastCurve.base || prev.base || 'Iout_max',
          points: lastCurve.points,
          perPhase: canUsePerPhase ? (lastCurve.perPhase ?? perPhaseActive) : false,
          _lastCurve: lastCurve || prev._lastCurve,
        } as any)
      } else {
        const defaults: CurvePoint[] = [
          { current: 0, eta: 0.85 },
          { current: safeAxisMaxCurrent / 2, eta: 0.92 },
          { current: safeAxisMaxCurrent, eta: 0.9 },
        ]
        updateCurvePoints(defaults, { perPhase: perPhaseActive })
      }
    }
  }

  const handleFixedValueChange = (value: number) => {
    const next: any = { type: 'fixed', value, perPhase: canUsePerPhase ? perPhaseActive : undefined, _lastCurve: (eff as any)._lastCurve }
    onChange(next)
  }

  const handleScopeChange = (scope: 'overall' | 'perPhase') => {
    if (!canUsePerPhase) return
    const targetPerPhase = scope === 'perPhase'
    if (targetPerPhase === perPhaseActive) return
    if (isCurve) {
      const scale = targetPerPhase ? (1 / Math.max(phaseCount, 1)) : Math.max(phaseCount, 1)
      const targetAxis = targetPerPhase ? perPhaseMaxCurrent : fallbackMaxCurrent
      const safeTargetAxis = targetAxis > 0 ? targetAxis : (fallbackMaxCurrent > 0 ? fallbackMaxCurrent : 1)
      const scaled = currentPoints.map(pt => ({ current: clamp(pt.current * scale, 0, safeTargetAxis), eta: pt.eta }))
      updateCurvePoints(scaled, { perPhase: targetPerPhase })
    } else {
      const prev = eff as any
      onChange({ type: 'fixed', value: typeof prev.value === 'number' ? prev.value : 0.92, perPhase: targetPerPhase, _lastCurve: prev._lastCurve } as any)
    }
  }

  const analysisTotalCurrent = analysis?.I_out ?? 0
  const analysisPerPhaseCurrent = perPhaseActive ? (analysisTotalCurrent / Math.max(phaseCount, 1)) : analysisTotalCurrent

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
      {canUsePerPhase && (
        <label className="flex items-center justify-between gap-2">
          <span>Data scope</span>
          <select className="input" value={perPhaseActive ? 'perPhase' : 'overall'} onChange={e => handleScopeChange(e.target.value as 'overall' | 'perPhase')}>
            <option value="overall">overall converter</option>
            <option value="perPhase">per-phase (x{phaseCount})</option>
          </select>
        </label>
      )}
      {isCurve ? (
        <>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={graphData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="current" unit="A" type="number" domain={[0, safeAxisMaxCurrent]} />
                <YAxis domain={[0, 1]} />
                <Tooltip formatter={(v: any, name: string) => (name === 'eta' ? Number(v).toFixed(3) : v)} />
                <Line type="monotone" dataKey="eta" dot />
                {analysis && typeof computedEta === 'number' && (
                  <ReferenceDot
                    x={clamp(analysisPerPhaseCurrent, 0, safeAxisMaxCurrent)}
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
              <div key={idx} className="flex items-center gap-2 text-xs">
                <label className="flex items-center gap-1">
                  <span>Current (A)</span>
                  <input
                    type="number"
                    className="input w-24"
                    value={pt.current}
                    min={0}
                    max={safeAxisMaxCurrent}
                    step={0.01}
                    onChange={e => handlePointChange(idx, 'current', clamp(Number(e.target.value), 0, safeAxisMaxCurrent))}
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
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="w-fit" onClick={handleAddPoint}>
                Add point
              </Button>
              <Button variant="outline" size="sm" className="w-fit" onClick={handleSortPoints}>
                Sort by current
              </Button>
            </div>
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
            I<sub>out</sub> (total): <b>{analysisTotalCurrent.toFixed(4)} A</b>
          </div>
          {perPhaseActive && (
            <div>
              I<sub>phase</sub>: <b>{analysisPerPhaseCurrent.toFixed(4)} A</b>
            </div>
          )}
          {typeof computedEta === 'number' && (
            <div>
              η (at {perPhaseActive ? `I_phase = ${analysisPerPhaseCurrent.toFixed(3)} A` : `I_out = ${analysisTotalCurrent.toFixed(3)} A`}): <b>{computedEta.toFixed(4)}</b>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
