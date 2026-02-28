import React from 'react'
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceDot } from 'recharts'
import { Button } from './ui/button'
import { FormField, FormGrid } from './ui/inspector'
import { etaFromModel } from '../calc'
import type { EfficiencyCurve1DModel, EfficiencyCurve2DModel, EfficiencyModel, EfficiencyTable2D } from '../models'

type EfficiencyEditorProps = {
  label?: string
  efficiency: EfficiencyModel | undefined
  maxCurrent: number
  onChange: (value: EfficiencyModel & { _lastCurve?: any }) => void
  analysis?: { P_out?: number; I_out?: number }
  modelNode?: { Pout_max?: number; Iout_max?: number; phaseCount?: number; Vout?: number }
}

type EfficiencyEditorValue = EfficiencyModel & { _lastCurve?: any }
type EfficiencyModelSelection = 'fixed' | 'curve1d' | 'curve2d'
type CurvePoint = { current: number; eta: number }
type CurveDraftCache = {
  oneDimensional?: EfficiencyCurve1DModel
  twoDimensional?: EfficiencyCurve2DModel
}

const MATRIX_LABEL_COLUMN_WIDTH = '3.75rem'
const MATRIX_DATA_COLUMN_WIDTH = '3.35rem'
const CURVE_1D_CURRENT_COLUMN_WIDTH = '50%'
const CURVE_1D_ETA_COLUMN_WIDTH = '50%'
const CURVE_1D_LINE_COLOR = '#2563eb'
const CURVE_2D_LINE_COLORS = ['#0f766e', '#2563eb', '#dc2626', '#7c3aed', '#ea580c', '#0891b2']

const clampValue = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function isCurve1D(model: EfficiencyEditorValue): model is EfficiencyCurve1DModel & { _lastCurve?: any } {
  return model.type === 'curve' && model.mode !== '2d'
}

function isCurve2D(model: EfficiencyEditorValue): model is EfficiencyCurve2DModel & { _lastCurve?: any } {
  return model.type === 'curve' && model.mode === '2d'
}

function ensureCurrent(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function ensureVoltage(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function ensureEta(value: number, fallback = 0.9): number {
  return clampValue(Number.isFinite(value) ? value : fallback, 0, 1)
}

function formatDecimal(value: number, minFractionDigits: number, maxFractionDigits: number): string {
  if (!Number.isFinite(value)) return ''
  const fixed = value.toFixed(maxFractionDigits)
  if (maxFractionDigits <= minFractionDigits) return fixed
  const [whole, fraction = ''] = fixed.split('.')
  if (fraction.length === 0) return fixed
  const trimmed = fraction.replace(/0+$/, '')
  const keptFraction = trimmed.length < minFractionDigits
    ? fraction.slice(0, minFractionDigits)
    : trimmed
  return keptFraction.length ? `${whole}.${keptFraction}` : whole
}

function formatPercentDisplay(value: number, minFractionDigits: number, maxFractionDigits: number): string {
  return `${formatDecimal(value * 100, minFractionDigits, maxFractionDigits)}%`
}

function formatCurrentDisplay(value: number, minFractionDigits: number, maxFractionDigits: number): string {
  return `${formatDecimal(value, minFractionDigits, maxFractionDigits)}A`
}

type TableNumberInputProps = {
  ariaLabel: string
  value: number | null
  minFractionDigits?: number
  maxFractionDigits: number
  allowEmpty?: boolean
  fillCell?: boolean
  minWidthCh?: number
  mode?: 'number' | 'percent'
  onValueChange: (value: number | null) => void
}

function formatTableValue(value: number | null, minFractionDigits: number, maxFractionDigits: number, mode: 'number' | 'percent'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  if (mode === 'percent') return `${formatDecimal(value * 100, minFractionDigits, maxFractionDigits)}%`
  return formatDecimal(value, minFractionDigits, maxFractionDigits)
}

function parseTableValue(rawValue: string, mode: 'number' | 'percent'): number {
  const sanitized = rawValue.replace(/%/g, '').trim()
  const parsed = Number(sanitized)
  if (!Number.isFinite(parsed)) return Number.NaN
  return mode === 'percent' ? parsed / 100 : parsed
}

function TableNumberInput({ ariaLabel, value, minFractionDigits = 0, maxFractionDigits, allowEmpty = false, fillCell = false, minWidthCh, mode = 'number', onValueChange }: TableNumberInputProps) {
  const [draft, setDraft] = React.useState(() => formatTableValue(value, minFractionDigits, maxFractionDigits, mode))
  const formattedValue = formatTableValue(value, minFractionDigits, maxFractionDigits, mode)
  const widthCh = Math.max(draft.length, formattedValue.length, minWidthCh ?? (mode === 'percent' ? 4 : 3))

  React.useEffect(() => {
    setDraft(formatTableValue(value, minFractionDigits, maxFractionDigits, mode))
  }, [value, minFractionDigits, maxFractionDigits, mode])

  return (
    <input
      aria-label={ariaLabel}
      type="text"
      inputMode="decimal"
      className={`table-cell-input min-w-0 ${fillCell ? 'w-full' : 'w-auto'}`}
      style={fillCell ? undefined : { width: `${widthCh}ch` }}
      value={draft}
      onChange={event => {
        const next = event.target.value
        setDraft(next)
        if (allowEmpty && next.trim() === '') {
          onValueChange(null)
          return
        }
        const parsed = parseTableValue(next, mode)
        if (next.trim() !== '' && Number.isFinite(parsed)) {
          onValueChange(parsed)
        }
      }}
      onBlur={() => {
        if (allowEmpty && draft.trim() === '') {
          onValueChange(null)
          setDraft('')
          return
        }
        const parsed = parseTableValue(draft, mode)
        if (draft.trim() !== '' && Number.isFinite(parsed)) {
          onValueChange(parsed)
          setDraft(formatTableValue(parsed, minFractionDigits, maxFractionDigits, mode))
        } else {
          setDraft(formatTableValue(value, minFractionDigits, maxFractionDigits, mode))
        }
      }}
    />
  )
}

function defaultCurve1D(maxCurrent: number, base?: 'Pout_max' | 'Iout_max'): EfficiencyCurve1DModel {
  const safeMax = maxCurrent > 0 ? maxCurrent : 1
  return {
    type: 'curve',
    mode: '1d',
    base: base || 'Iout_max',
    points: [
      { current: 0, loadPct: 0, eta: 0.85 },
      { current: safeMax / 2, loadPct: 50, eta: 0.92 },
      { current: safeMax, loadPct: 100, eta: 0.9 },
    ],
  }
}

function defaultCurve2D(maxCurrent: number, vout?: number): EfficiencyCurve2DModel {
  const safeMax = maxCurrent > 0 ? maxCurrent : 1
  return {
    type: 'curve',
    mode: '2d',
    table: {
      outputVoltages: [ensureVoltage(Number(vout), 1)],
      outputCurrents: [0, safeMax / 2, safeMax],
      values: [[0.85, 0.92, 0.9]],
    },
  }
}

function collectCurveDrafts(value: EfficiencyEditorValue): CurveDraftCache {
  const drafts: CurveDraftCache = {}
  const addCandidate = (candidate: any) => {
    if (!candidate || candidate.type !== 'curve') return
    if (candidate.mode === '2d' || candidate.table) {
      drafts.twoDimensional = candidate as EfficiencyCurve2DModel
      return
    }
    if (candidate.points) {
      drafts.oneDimensional = candidate as EfficiencyCurve1DModel
    }
  }

  addCandidate(value)
  const lastCurve = value?._lastCurve
  if (lastCurve?.oneDimensional || lastCurve?.twoDimensional) {
    addCandidate(lastCurve.oneDimensional)
    addCandidate(lastCurve.twoDimensional)
  } else {
    addCandidate(lastCurve)
  }
  return drafts
}

function withCurveDrafts(next: EfficiencyModel, current: EfficiencyEditorValue): EfficiencyEditorValue {
  const drafts = collectCurveDrafts(current)
  if (next.type === 'curve') {
    if (next.mode === '2d') drafts.twoDimensional = next
    else drafts.oneDimensional = next as EfficiencyCurve1DModel
  }
  return {
    ...(next as any),
    _lastCurve: drafts,
  }
}

function curve1DToRows(curve: EfficiencyCurve1DModel, axisMaxCurrent: number): CurvePoint[] {
  const safeAxis = axisMaxCurrent > 0 ? axisMaxCurrent : 1
  const rows = Array.isArray(curve.points)
    ? curve.points.map(point => {
        const current = typeof point.current === 'number' && Number.isFinite(point.current)
          ? point.current
          : typeof point.loadPct === 'number' && Number.isFinite(point.loadPct)
            ? (safeAxis * point.loadPct) / 100
            : 0
        return {
          current: clampValue(current, 0, safeAxis),
          eta: ensureEta(point.eta, 0.9),
        }
      })
    : []
  return rows.length ? rows : curve1DToRows(defaultCurve1D(safeAxis, curve.base), safeAxis)
}

function rowsToCurve1D(rows: CurvePoint[], axisMaxCurrent: number, template?: EfficiencyCurve1DModel): EfficiencyCurve1DModel {
  const safeAxis = axisMaxCurrent > 0 ? axisMaxCurrent : 1
  const mapped = rows.map(row => {
    const current = clampValue(ensureCurrent(row.current, 0), 0, safeAxis)
    return {
      current,
      loadPct: clampValue((current / safeAxis) * 100, 0, 100),
      eta: ensureEta(row.eta, 0.9),
    }
  })
  return {
    type: 'curve',
    mode: '1d',
    base: template?.base || 'Iout_max',
    perPhase: template?.perPhase,
    points: mapped,
  }
}

function normalizeCurve2DTable(table: EfficiencyTable2D | undefined, maxCurrent: number, vout?: number): EfficiencyTable2D {
  const fallback = defaultCurve2D(maxCurrent, vout).table
  if (!table) return fallback
  const voltages = Array.isArray(table.outputVoltages) ? table.outputVoltages.map(value => ensureVoltage(Number(value), ensureVoltage(Number(vout), 1))) : fallback.outputVoltages
  const currents = Array.isArray(table.outputCurrents) ? table.outputCurrents.map(value => ensureCurrent(Number(value), 0)) : fallback.outputCurrents
  const values = Array.isArray(table.values)
    ? table.values.map((row, rowIndex) => (
        Array.isArray(row)
          ? currents.map((_, colIndex) => {
              const value = row[colIndex]
              if (value === null || value === undefined || value === '') return null
              return ensureEta(Number(value), 0.9)
            })
          : currents.map(() => null)
      ))
    : fallback.values

  if (!voltages.length || !currents.length || !values.length) return fallback
  return { outputVoltages: voltages, outputCurrents: currents, values }
}

function matrixToTsv(table: EfficiencyTable2D): string {
  const rows = [
    ['Iout \\ Vout', ...table.outputVoltages.map(value => value.toString())],
    ...table.outputCurrents.map((current, currentIndex) => [
      current.toString(),
      ...table.outputVoltages.map((_, voltageIndex) => {
        const value = table.values[voltageIndex]![currentIndex]
        return value === null || value === undefined ? '' : value.toString()
      }),
    ]),
  ]
  return rows.map(row => row.join('\t')).join('\n')
}

function curve1DToTsv(rows: CurvePoint[]): string {
  return rows.map(row => `${row.current}\t${row.eta}`).join('\n')
}

function splitDelimitedRow(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : ','
  return line.split(delimiter).map(part => part.trim())
}

function parseCurve1DText(text: string): CurvePoint[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
  if (!lines.length) throw new Error('Paste at least one current/efficiency row.')
  return lines.map((line, index) => {
    const cells = splitDelimitedRow(line)
    if (cells.length < 2) throw new Error(`Row ${index + 1} must have current and efficiency values.`)
    const current = Number(cells[0])
    const etaText = cells[1]!.trim()
    const etaNumeric = Number(etaText.replace(/%/g, '').trim())
    const eta = etaText.includes('%') || etaNumeric > 1 ? (etaNumeric / 100) : etaNumeric
    if (!Number.isFinite(current) || current < 0) throw new Error(`Row ${index + 1} has an invalid current value.`)
    if (!Number.isFinite(eta)) throw new Error(`Row ${index + 1} has an invalid efficiency value.`)
    return { current, eta: ensureEta(eta, 0.9) }
  })
}

function parseCurve2DText(text: string): EfficiencyTable2D {
  const rows = text.split(/\r?\n/).filter(line => line.trim().length > 0).map(splitDelimitedRow)
  if (rows.length < 2) throw new Error('Paste a matrix with one header row and at least one current row.')
  const header = rows[0]!
  if (header.length < 2) throw new Error('The matrix needs at least one voltage column.')
  const outputVoltages = header.slice(1).map(value => Number(value))
  if (!outputVoltages.length || outputVoltages.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Voltage headers must be finite numbers greater than zero.')
  }
  const outputCurrents: number[] = []
  const currentMajorNullableValues: Array<Array<number | null>> = []
  rows.slice(1).forEach((row, index) => {
    if (row.length !== header.length) throw new Error('All matrix rows must have the same number of columns.')
    const current = Number(row[0])
    if (!Number.isFinite(current) || current < 0) throw new Error(`Current row ${index + 1} has an invalid Iout value.`)
    outputCurrents.push(current)
    const rowValues = row.slice(1).map(value => value.trim())
    const parsedValues = rowValues.map(value => {
      if (value === '') return null
      const numeric = Number(value.replace(/%/g, '').trim())
      if (!Number.isFinite(numeric)) return Number.NaN
      const parsed = value.includes('%') || numeric > 1 ? (numeric / 100) : numeric
      return Number.isFinite(parsed) ? ensureEta(parsed, 0.9) : Number.NaN
    })
    if (parsedValues.some(value => value !== null && !Number.isFinite(value))) throw new Error(`Current row ${index + 1} has an invalid efficiency value.`)
    currentMajorNullableValues.push(parsedValues)
  })
  if (new Set(outputVoltages.map(value => value.toString())).size !== outputVoltages.length) throw new Error('Duplicate voltage headers are not allowed.')
  if (new Set(outputCurrents.map(value => value.toString())).size !== outputCurrents.length) throw new Error('Duplicate current headers are not allowed.')
  return {
    outputVoltages,
    outputCurrents,
    values: outputVoltages.map((_, voltageIndex) => outputCurrents.map((_, currentIndex) => currentMajorNullableValues[currentIndex]![voltageIndex]!)),
  }
}

function sortCurve2DAxes(table: EfficiencyTable2D): EfficiencyTable2D {
  const rowOrder = table.outputVoltages.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  const colOrder = table.outputCurrents.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  return {
    outputVoltages: rowOrder.map(entry => entry.value),
    outputCurrents: colOrder.map(entry => entry.value),
    values: rowOrder.map(({ index: rowIndex }) => colOrder.map(({ index: colIndex }) => {
      const value = table.values[rowIndex]?.[colIndex]
      return value === null || value === undefined ? null : ensureEta(value, 0.9)
    })),
  }
}

function transposeCurve2DView(table: EfficiencyTable2D): Array<{ current: number; values: Array<number | null> }> {
  return table.outputCurrents.map((current, currentIndex) => ({
    current,
    values: table.outputVoltages.map((_, voltageIndex) => table.values[voltageIndex]![currentIndex]!),
  }))
}

async function readClipboardText(): Promise<string> {
  if (!navigator.clipboard?.readText) {
    throw new Error('Clipboard read is not available in this browser.')
  }
  return navigator.clipboard.readText()
}

async function writeClipboardText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard write is not available in this browser.')
  }
  await navigator.clipboard.writeText(text)
}

export default function EfficiencyEditor({ efficiency, maxCurrent, onChange, analysis, modelNode }: EfficiencyEditorProps) {
  const eff = (efficiency && typeof efficiency === 'object') ? efficiency as EfficiencyEditorValue : { type: 'fixed', value: 0.9 }
  const isCurve = eff.type === 'curve'

  const fallbackMaxCurrent = Number.isFinite(maxCurrent) && maxCurrent > 0 ? maxCurrent : 1
  const phaseCountRaw = modelNode?.phaseCount
  const phaseCount = Number.isFinite(phaseCountRaw) && (phaseCountRaw as number) > 0 ? Math.max(1, Math.round(phaseCountRaw as number)) : 1
  const canUsePerPhase = phaseCount > 1
  const storedPerPhase = !!(eff as any).perPhase
  const perPhaseActive = canUsePerPhase ? storedPerPhase : false
  const perPhaseMaxCurrent = fallbackMaxCurrent / Math.max(phaseCount, 1)
  const axisMaxCurrent = perPhaseActive ? perPhaseMaxCurrent : fallbackMaxCurrent
  const safeAxisMaxCurrent = axisMaxCurrent > 0 ? axisMaxCurrent : 1
  const currentVout = ensureVoltage(Number(modelNode?.Vout), 1)

  const [tableError, setTableError] = React.useState<string | null>(null)

  const drafts = React.useMemo(() => collectCurveDrafts(eff), [eff])
  const curveMode = isCurve2D(eff) ? '2d' : '1d'
  const modelSelection: EfficiencyModelSelection = !isCurve ? 'fixed' : curveMode === '2d' ? 'curve2d' : 'curve1d'

  const curve1D = React.useMemo(() => {
    if (isCurve1D(eff)) return eff
    return drafts.oneDimensional || defaultCurve1D(safeAxisMaxCurrent)
  }, [drafts.oneDimensional, eff, safeAxisMaxCurrent])

  const curve2D = React.useMemo(() => {
    if (isCurve2D(eff)) return eff
    return drafts.twoDimensional || defaultCurve2D(safeAxisMaxCurrent, currentVout)
  }, [drafts.twoDimensional, eff, safeAxisMaxCurrent, currentVout])

  const currentPoints = React.useMemo<CurvePoint[]>(
    () => curve1DToRows(curve1D, safeAxisMaxCurrent),
    [curve1D, safeAxisMaxCurrent]
  )

  const matrixTable = React.useMemo<EfficiencyTable2D>(
    () => normalizeCurve2DTable(curve2D.table, safeAxisMaxCurrent, currentVout),
    [curve2D.table, safeAxisMaxCurrent, currentVout]
  )

  const transposedMatrixRows = React.useMemo(
    () => transposeCurve2DView(matrixTable),
    [matrixTable]
  )

  const graph2DSeries = React.useMemo(
    () => matrixTable.outputVoltages.map((voltage, index) => ({
      key: `voltage_${index}`,
      voltage,
      color: CURVE_2D_LINE_COLORS[index % CURVE_2D_LINE_COLORS.length]!,
      label: `Vout ${formatDecimal(voltage, 2, 2)} V`,
    })),
    [matrixTable.outputVoltages]
  )

  const graph2DData = React.useMemo(
    () => transposedMatrixRows.map(row => ({
      current: row.current,
      ...graph2DSeries.reduce<Record<string, number | undefined>>((acc, series, index) => {
        const value = row.values[index]
        acc[series.key] = value === null || value === undefined ? undefined : value
        return acc
      }, {}),
    })),
    [graph2DSeries, transposedMatrixRows]
  )

  const emitFixed = React.useCallback((value: number) => {
    setTableError(null)
    onChange(withCurveDrafts({ type: 'fixed', value, perPhase: canUsePerPhase ? perPhaseActive : undefined }, eff))
  }, [canUsePerPhase, eff, onChange, perPhaseActive])

  const emitCurve1D = React.useCallback((rows: CurvePoint[], template?: EfficiencyCurve1DModel) => {
    setTableError(null)
    const nextCurve = rowsToCurve1D(rows, safeAxisMaxCurrent, template || curve1D)
    nextCurve.perPhase = canUsePerPhase ? perPhaseActive : false
    onChange(withCurveDrafts(nextCurve, eff))
  }, [canUsePerPhase, curve1D, eff, onChange, perPhaseActive, safeAxisMaxCurrent])

  const emitCurve2D = React.useCallback((table: EfficiencyTable2D, template?: EfficiencyCurve2DModel) => {
    setTableError(null)
    const nextCurve: EfficiencyCurve2DModel = {
      type: 'curve',
      mode: '2d',
      table,
      perPhase: canUsePerPhase ? perPhaseActive : false,
      ...(template ? { perPhase: canUsePerPhase ? perPhaseActive : false } : {}),
    }
    onChange(withCurveDrafts(nextCurve, eff))
  }, [canUsePerPhase, eff, onChange, perPhaseActive])

  const handleModelSelectionChange = (value: EfficiencyModelSelection) => {
    if (value === 'fixed') {
      emitFixed(typeof (eff as any).value === 'number' ? (eff as any).value : 0.92)
      return
    }
    if (value === 'curve2d') {
      emitCurve2D(matrixTable, curve2D)
      return
    }
    emitCurve1D(currentPoints, curve1D)
  }

  const handleFixedValueChange = (value: number) => {
    emitFixed(clampValue(value, 0, 1))
  }

  const handleScopeChange = (scope: 'overall' | 'perPhase') => {
    if (!canUsePerPhase) return
    const targetPerPhase = scope === 'perPhase'
    if (targetPerPhase === perPhaseActive) return
    const scale = targetPerPhase ? (1 / Math.max(phaseCount, 1)) : Math.max(phaseCount, 1)
    if (isCurve && curveMode === '2d') {
      const scaled: EfficiencyTable2D = {
        outputVoltages: [...matrixTable.outputVoltages],
        outputCurrents: matrixTable.outputCurrents.map(current => clampValue(current * scale, 0, fallbackMaxCurrent)),
        values: matrixTable.values.map(row => [...row]),
      }
      const nextCurve: EfficiencyCurve2DModel = {
        type: 'curve',
        mode: '2d',
        table: scaled,
        perPhase: targetPerPhase,
      }
      setTableError(null)
      onChange(withCurveDrafts(nextCurve, eff))
      return
    }
    if (isCurve) {
      const scaledRows = currentPoints.map(point => ({
        current: clampValue(point.current * scale, 0, fallbackMaxCurrent),
        eta: point.eta,
      }))
      const nextCurve = rowsToCurve1D(scaledRows, targetPerPhase ? perPhaseMaxCurrent : fallbackMaxCurrent, curve1D)
      nextCurve.perPhase = targetPerPhase
      setTableError(null)
      onChange(withCurveDrafts(nextCurve, eff))
      return
    }
    onChange(withCurveDrafts({ type: 'fixed', value: typeof (eff as any).value === 'number' ? (eff as any).value : 0.92, perPhase: targetPerPhase }, eff))
  }

  const handlePaste1D = async () => {
    try {
      const text = await readClipboardText()
      emitCurve1D(parseCurve1DText(text), curve1D)
    } catch (error) {
      setTableError(error instanceof Error ? error.message : 'Unable to paste the 1D efficiency table.')
    }
  }

  const handleCopy1D = async () => {
    try {
      await writeClipboardText(curve1DToTsv(currentPoints))
      setTableError(null)
    } catch (error) {
      setTableError(error instanceof Error ? error.message : 'Unable to copy the 1D efficiency table.')
    }
  }

  const handlePaste2D = async () => {
    try {
      const text = await readClipboardText()
      emitCurve2D(sortCurve2DAxes(parseCurve2DText(text)), curve2D)
    } catch (error) {
      setTableError(error instanceof Error ? error.message : 'Unable to paste the 2D efficiency table.')
    }
  }

  const handleCopy2D = async () => {
    try {
      await writeClipboardText(matrixToTsv(matrixTable))
      setTableError(null)
    } catch (error) {
      setTableError(error instanceof Error ? error.message : 'Unable to copy the 2D efficiency table.')
    }
  }

  const update1DCurrent = (index: number, value: number) => {
    emitCurve1D(currentPoints.map((row, rowIndex) => rowIndex === index ? { ...row, current: clampValue(value, 0, safeAxisMaxCurrent) } : row), curve1D)
  }

  const update1DEta = (index: number, value: number) => {
    emitCurve1D(currentPoints.map((row, rowIndex) => rowIndex === index ? { ...row, eta: clampValue(value, 0, 1) } : row), curve1D)
  }

  const add1DRow = () => {
    const nextCurrent = currentPoints.length ? currentPoints[currentPoints.length - 1]!.current : 0
    emitCurve1D([...currentPoints, { current: nextCurrent, eta: 0.9 }], curve1D)
  }

  const sort1DRows = () => {
    emitCurve1D([...currentPoints].sort((a, b) => a.current - b.current), curve1D)
  }

  const update2DVoltage = (voltageIndex: number, value: number) => {
    const nextTable: EfficiencyTable2D = {
      outputVoltages: matrixTable.outputVoltages.map((rowValue, index) => index === voltageIndex ? ensureVoltage(value, rowValue) : rowValue),
      outputCurrents: [...matrixTable.outputCurrents],
      values: matrixTable.values.map(row => [...row]),
    }
    emitCurve2D(nextTable, curve2D)
  }

  const update2DCurrent = (currentIndex: number, value: number) => {
    const nextTable: EfficiencyTable2D = {
      outputVoltages: [...matrixTable.outputVoltages],
      outputCurrents: matrixTable.outputCurrents.map((columnValue, index) => index === currentIndex ? ensureCurrent(value, columnValue) : columnValue),
      values: matrixTable.values.map(row => [...row]),
    }
    emitCurve2D(nextTable, curve2D)
  }

  const update2DValue = (currentIndex: number, voltageIndex: number, value: number | null) => {
    const nextTable: EfficiencyTable2D = {
      outputVoltages: [...matrixTable.outputVoltages],
      outputCurrents: [...matrixTable.outputCurrents],
      values: matrixTable.values.map((row, rowVoltageIndex) => (
        rowVoltageIndex === voltageIndex
          ? row.map((cell, rowCurrentIndex) => {
              if (rowCurrentIndex !== currentIndex) return cell
              return value === null ? null : ensureEta(value, cell ?? 0.9)
            })
          : [...row]
      )),
    }
    emitCurve2D(nextTable, curve2D)
  }

  const add2DVoltageColumn = () => {
    const nextVoltage = matrixTable.outputVoltages[matrixTable.outputVoltages.length - 1]! + 0.1
    emitCurve2D({
      outputVoltages: [...matrixTable.outputVoltages, nextVoltage],
      outputCurrents: [...matrixTable.outputCurrents],
      values: [...matrixTable.values.map(row => [...row]), matrixTable.outputCurrents.map(() => null)],
    }, curve2D)
  }

  const add2DCurrentRow = () => {
    const nextCurrent = matrixTable.outputCurrents.length
      ? matrixTable.outputCurrents[matrixTable.outputCurrents.length - 1]! + Math.max(safeAxisMaxCurrent / 4, 0.1)
      : 0
    emitCurve2D({
      outputVoltages: [...matrixTable.outputVoltages],
      outputCurrents: [...matrixTable.outputCurrents, nextCurrent],
      values: matrixTable.values.map(row => [...row, null]),
    }, curve2D)
  }

  const sort2DAxes = () => {
    emitCurve2D(sortCurve2DAxes(matrixTable), curve2D)
  }

  const removeEmpty2DAxes = () => {
    const nonEmptyRows = matrixTable.outputVoltages
      .map((value, index) => ({ value, index }))
      .filter((_, index) => matrixTable.values[index]?.some(cell => Number.isFinite(cell)))
    const nonEmptyColumns = matrixTable.outputCurrents
      .map((value, index) => ({ value, index }))
      .filter(({ index }) => matrixTable.values.some(row => Number.isFinite(row[index])))
    if (!nonEmptyRows.length || !nonEmptyColumns.length) return
    emitCurve2D({
      outputVoltages: nonEmptyRows.map(entry => entry.value),
      outputCurrents: nonEmptyColumns.map(entry => entry.value),
      values: nonEmptyRows.map(({ index: rowIndex }) => nonEmptyColumns.map(({ index: colIndex }) => matrixTable.values[rowIndex]![colIndex]!)),
    }, curve2D)
  }

  const analysisTotalCurrent = analysis?.I_out ?? 0
  const analysisPerPhaseCurrent = perPhaseActive ? (analysisTotalCurrent / Math.max(phaseCount, 1)) : analysisTotalCurrent
  const operatingCurrentLabel = perPhaseActive ? 'I_phase' : 'I_out'
  const currentAxisLabel = perPhaseActive ? 'Iphase' : 'Iout'

  let computedEta: number | undefined
  if (analysis) {
    try {
      computedEta = etaFromModel(eff as EfficiencyModel, analysis.P_out ?? 0, analysis.I_out ?? 0, (modelNode || {}) as any)
    } catch (_error) {
      computedEta = undefined
    }
  }

  const graphData = React.useMemo(() => {
    if (!isCurve || curveMode !== '1d' || currentPoints.length === 0) return []
    const points = [...currentPoints].sort((a, b) => a.current - b.current)
    if (points[0]!.current > 0) points.unshift({ current: 0, eta: points[0]!.eta })
    if (points[points.length - 1]!.current < safeAxisMaxCurrent) points.push({ current: safeAxisMaxCurrent, eta: points[points.length - 1]!.eta })
    return points
  }, [curveMode, currentPoints, isCurve, safeAxisMaxCurrent])

  const etaBounds = React.useMemo(() => {
    if (graphData.length === 0) return [0, 1] as [number, number]
    const values = graphData.map(point => clampValue(point.eta, 0, 1))
    if (typeof computedEta === 'number') values.push(clampValue(computedEta, 0, 1))
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = Math.max(max - min, 0.05)
    const padding = span * 0.1
    return [clampValue(min - padding, 0, 1), clampValue(max + padding, 0, 1)] as [number, number]
  }, [computedEta, graphData])

  const etaBounds2D = React.useMemo(() => {
    if (graph2DData.length === 0 || graph2DSeries.length === 0) return [0, 1] as [number, number]
    const values = graph2DData.flatMap(point => graph2DSeries
      .map(series => point[series.key] as number | undefined)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .map(value => clampValue(value, 0, 1)))
    if (!values.length && typeof computedEta !== 'number') return [0, 1] as [number, number]
    if (typeof computedEta === 'number') values.push(clampValue(computedEta, 0, 1))
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = Math.max(max - min, 0.05)
    const padding = span * 0.1
    return [clampValue(min - padding, 0, 1), clampValue(max + padding, 0, 1)] as [number, number]
  }, [computedEta, graph2DData, graph2DSeries])

  const graph2DCurrentMin = graph2DData.length ? Number(graph2DData[0]?.current ?? 0) : 0
  const graph2DCurrentMax = graph2DData.length ? Number(graph2DData[graph2DData.length - 1]?.current ?? 0) : safeAxisMaxCurrent
  const graph1DCurrentMax = graphData.length ? Number(graphData[graphData.length - 1]?.current ?? safeAxisMaxCurrent) : safeAxisMaxCurrent

  return (
    <div className="space-y-4 text-base text-slate-700">
      <FormGrid columns={canUsePerPhase ? 2 : 1}>
        <FormField label="Eifficiency model">
          <select
            aria-label="Efficiency model"
            className="input"
            value={modelSelection}
            onChange={event => handleModelSelectionChange(event.target.value as EfficiencyModelSelection)}
          >
            <option value="fixed">Fixed</option>
            <option value="curve1d">Curve: current only</option>
            <option value="curve2d">Curve: Vout + current</option>
          </select>
        </FormField>
        {canUsePerPhase && (
          <FormField label={`Efficiency scope (x${phaseCount})`}>
            <select
              aria-label="Efficiency data scope"
              className="input"
              value={perPhaseActive ? 'perPhase' : 'overall'}
              onChange={event => handleScopeChange(event.target.value as 'overall' | 'perPhase')}
            >
              <option value="overall">Overall converter</option>
              <option value="perPhase">Per-phase</option>
            </select>
          </FormField>
        )}
      </FormGrid>

      {isCurve ? (
        <>
          {curveMode === '1d' ? (
            <>
              <div className="space-y-3">
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={graphData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="current"
                        type="number"
                        domain={[0, graph1DCurrentMax]}
                        tickFormatter={(value: number) => formatCurrentDisplay(Number(value), 1, 1)}
                      />
                      <YAxis
                        domain={etaBounds}
                        tickFormatter={(value: number) => `${Math.round(Number(value) * 100)}%`}
                      />
                      <Tooltip
                        formatter={(value: any, name: string) => [formatPercentDisplay(Number(value), 1, 1), name]}
                        labelFormatter={(value: any) => `${currentAxisLabel} ${formatDecimal(Number(value), 2, 2)} A`}
                      />
                      <Line
                        type="monotone"
                        dataKey="eta"
                        name="Efficiency curve"
                        stroke={CURVE_1D_LINE_COLOR}
                        dot={{ r: 3, fill: '#ffffff', stroke: CURVE_1D_LINE_COLOR, strokeWidth: 1.25 }}
                        activeDot={{ r: 4 }}
                        strokeWidth={2}
                      />
                      {analysis && typeof computedEta === 'number' && (
                        <ReferenceDot
                          x={clampValue(analysisPerPhaseCurrent, 0, graph1DCurrentMax)}
                          y={clampValue(computedEta, 0, 1)}
                          r={4}
                          fill="#111827"
                          stroke="#ffffff"
                          strokeWidth={1.5}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                  <div className="flex items-center gap-2" data-testid="efficiency-1d-legend-item">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CURVE_1D_LINE_COLOR }} />
                    <span>Efficiency curve</span>
                  </div>
                  {analysis && typeof computedEta === 'number' && (
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full border border-slate-900 bg-slate-900" />
                      <span>Operating point</span>
                    </div>
                  )}
                </div>
              </div>

              {analysis && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Efficiency</div>
                    <div className="text-lg font-semibold text-slate-900">{typeof computedEta === 'number' ? `${(computedEta * 100).toFixed(1)} %` : '—'}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{operatingCurrentLabel}</div>
                    <div className="text-lg font-semibold text-slate-900">{`${analysisPerPhaseCurrent.toFixed(3)} A`}</div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table data-testid="efficiency-curve-1d-table" className="w-full border-collapse table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: CURVE_1D_CURRENT_COLUMN_WIDTH }} />
                    <col style={{ width: CURVE_1D_ETA_COLUMN_WIDTH }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="whitespace-nowrap border-r border-slate-200 bg-slate-50 px-2 py-2 text-left">{operatingCurrentLabel}</th>
                      <th className="whitespace-nowrap border-l border-slate-200 bg-slate-50 px-2 py-2 text-left">Efficiency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPoints.map((point, index) => (
                      <tr key={index} className="border-b border-slate-100 last:border-b-0">
                        <td className="whitespace-nowrap border-r border-slate-200 bg-slate-50 px-0 py-0">
                          <TableNumberInput
                            ariaLabel={`Current row ${index + 1}`}
                            value={point.current}
                            minFractionDigits={1}
                            maxFractionDigits={2}
                            fillCell
                            onValueChange={value => update1DCurrent(index, value ?? point.current)}
                          />
                        </td>
                        <td className="whitespace-nowrap border-l border-slate-200 px-0 py-0">
                          <TableNumberInput
                            ariaLabel={`Efficiency row ${index + 1}`}
                            value={point.eta}
                            minFractionDigits={1}
                            maxFractionDigits={1}
                            fillCell
                            minWidthCh={6.5}
                            mode="percent"
                            onValueChange={value => update1DEta(index, value ?? point.eta)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" size="sm" onClick={add1DRow}>Add row</Button>
                <Button variant="outline" size="sm" onClick={handlePaste1D}>Paste table</Button>
                <Button variant="outline" size="sm" onClick={handleCopy1D}>Copy table</Button>
                <Button variant="outline" size="sm" onClick={sort1DRows}>Sort by current</Button>
              </div>
            </>
          ) : (
            <>
              {graph2DData.length > 0 && (
                <div className="space-y-3">
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={graph2DData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="current" unit="A" type="number" domain={[graph2DCurrentMin, graph2DCurrentMax]} />
                        <YAxis domain={etaBounds2D} tickFormatter={(value: number) => `${(value * 100).toFixed(0)}%`} />
                        <Tooltip
                          formatter={(value: any, name: string) => [`${(Number(value) * 100).toFixed(1)}%`, name]}
                          labelFormatter={(value: any) => `Iout ${Number(value).toFixed(2)} A`}
                        />
                        {graph2DSeries.map(series => (
                          <Line
                            key={series.key}
                            type="monotone"
                            dataKey={series.key}
                            name={series.label}
                            stroke={series.color}
                            dot
                            strokeWidth={2}
                          />
                        ))}
                        {analysis && typeof computedEta === 'number' && (
                          <ReferenceDot
                            x={clampValue(analysisPerPhaseCurrent, graph2DCurrentMin, graph2DCurrentMax)}
                            y={clampValue(computedEta, 0, 1)}
                            r={4}
                            fill="#111827"
                            stroke="#ffffff"
                            strokeWidth={1.5}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                    {graph2DSeries.map(series => (
                      <div key={series.key} className="flex items-center gap-2" data-testid="efficiency-2d-legend-item">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color }} />
                        <span>{series.label}</span>
                      </div>
                    ))}
                    {analysis && typeof computedEta === 'number' && (
                      <div className="flex items-center gap-2 text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-full border border-slate-900 bg-slate-900" />
                        <span>Operating point</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {analysis && (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Efficiency</div>
                    <div className="text-lg font-semibold text-slate-900">{typeof computedEta === 'number' ? `${(computedEta * 100).toFixed(1)} %` : '—'}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operating Vout</div>
                    <div className="text-lg font-semibold text-slate-900">{currentVout.toFixed(3)} V</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{perPhaseActive ? 'I_phase' : 'I_out'}</div>
                    <div className="text-lg font-semibold text-slate-900">{`${analysisPerPhaseCurrent.toFixed(3)} A`}</div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table data-testid="efficiency-matrix" className="w-max border-collapse table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: MATRIX_LABEL_COLUMN_WIDTH }} />
                    {matrixTable.outputVoltages.map((_, columnIndex) => (
                      <col key={`col-${columnIndex}`} style={{ width: MATRIX_DATA_COLUMN_WIDTH }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="sticky left-0 z-20 whitespace-nowrap border-r border-slate-200 bg-slate-50 px-2 py-2 text-left">Iout \ Vout</th>
                      {matrixTable.outputVoltages.map((voltage, columnIndex) => (
                        <th key={`voltage-${columnIndex}`} className="whitespace-nowrap border-l border-slate-200 bg-slate-50 px-0 py-0 text-left">
                          <TableNumberInput
                            ariaLabel={`Voltage column ${columnIndex + 1}`}
                            value={voltage}
                            minFractionDigits={2}
                            maxFractionDigits={2}
                            fillCell
                            onValueChange={value => update2DVoltage(columnIndex, value)}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transposedMatrixRows.map((row, rowIndex) => (
                      <tr key={`row-${rowIndex}`} className="border-b border-slate-100 last:border-b-0">
                        <td className="sticky left-0 z-10 whitespace-nowrap border-r border-slate-200 bg-slate-50 px-0 py-0">
                          <TableNumberInput
                            ariaLabel={`Current row ${rowIndex + 1}`}
                            value={row.current}
                            minFractionDigits={1}
                            maxFractionDigits={2}
                            fillCell
                            onValueChange={value => update2DCurrent(rowIndex, value)}
                          />
                        </td>
                        {row.values.map((cellValue, columnIndex) => (
                          <td key={`cell-${rowIndex}-${columnIndex}`} className="whitespace-nowrap border-l border-slate-200 px-0 py-0">
                            <TableNumberInput
                              ariaLabel={`Efficiency cell ${rowIndex + 1}-${columnIndex + 1}`}
                              value={cellValue}
                              minFractionDigits={1}
                              maxFractionDigits={1}
                              allowEmpty
                              fillCell
                              minWidthCh={6.5}
                              mode="percent"
                              onValueChange={value => update2DValue(rowIndex, columnIndex, value)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" size="sm" onClick={handlePaste2D}>Paste table</Button>
                <Button variant="outline" size="sm" onClick={handleCopy2D}>Copy table</Button>
                <Button variant="outline" size="sm" onClick={add2DVoltageColumn}>Add voltage column</Button>
                <Button variant="outline" size="sm" onClick={add2DCurrentRow}>Add current row</Button>
                <Button variant="outline" size="sm" onClick={sort2DAxes}>Sort axes</Button>
                <Button variant="outline" size="sm" onClick={removeEmpty2DAxes}>Remove empty rows/columns</Button>
              </div>
            </>
          )}

          {tableError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {tableError}
            </div>
          )}
        </>
      ) : (
        <FormField label="η value (0-1)">
          <input
            aria-label="Fixed efficiency"
            type="number"
            className="input"
            value={typeof (eff as any).value === 'number' ? (eff as any).value : ''}
            min={0}
            max={1}
            step={0.001}
            onChange={event => handleFixedValueChange(Number(event.target.value))}
          />
        </FormField>
      )}
    </div>
  )
}
