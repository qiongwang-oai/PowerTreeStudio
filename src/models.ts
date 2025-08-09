export type NodeType = 'Source'|'Converter'|'Load'|'Bus'|'Note'
export type EfficiencyModel =
 | { type: 'fixed', value: number }
 | { type: 'curve', base: 'Pout_max' | 'Iout_max', points: { loadPct:number, eta:number }[] }
export type BaseNode = { id: string; type: NodeType; name: string; x?:number; y?:number; notes?: string; warnings?: string[] }
export type SourceNode = BaseNode & { type: 'Source'; V_nom: number; I_max?: number; P_max?: number; count?: number; redundancy?: 'N'|'N+1' }
export type ConverterNode = BaseNode & { type: 'Converter'; topology?: 'buck'|'llc'|'ldo'|'other'; Vin_min: number; Vin_max: number; Vout: number; Iout_max?: number; Pout_max?: number; efficiency: EfficiencyModel }
export type LoadNode = BaseNode & { type: 'Load'; Vreq: number; I_typ: number; I_max: number; duty_cycle?: number }
export type BusNode = BaseNode & { type: 'Bus'; V_bus: number }
export type NoteNode = BaseNode & { type: 'Note'; text: string }
export type AnyNode = SourceNode|ConverterNode|LoadNode|BusNode|NoteNode
export type Edge = { id: string; from: string; to: string; netId?: string; interconnect?: { R_milliohm?: number, length_m?: number, awg?: string } }
export type Scenario = 'Typical'|'Max'|'Idle'
export type Project = { id: string; name: string; units: { voltage:'V', current:'A', power:'W', resistance:'mΩ' }; defaultMargins: { currentPct:number, powerPct:number, voltageDropPct:number, voltageMarginPct:number }; scenarios: Scenario[]; currentScenario: Scenario; nodes: AnyNode[]; edges: Edge[] }
