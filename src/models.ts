export type NodeType = 'Source'|'Converter'|'Load'|'Bus'|'Note'|'Subsystem'|'SubsystemInput'
export type EfficiencyModel =
 | { type: 'fixed', value: number }
 | { type: 'curve', base: 'Pout_max' | 'Iout_max', points: { loadPct:number, eta:number }[] }
export type BaseNode = { id: string; type: NodeType; name: string; x?:number; y?:number; notes?: string; warnings?: string[] }
export type SourceNode = BaseNode & { type: 'Source'; Vout: number; I_max?: number; P_max?: number; count?: number; redundancy?: 'N'|'N+1' }
export type ConverterNode = BaseNode & { type: 'Converter'; topology?: 'buck'|'llc'|'ldo'|'other'; Vin_min: number; Vin_max: number; Vout: number; Iout_max?: number; Pout_max?: number; efficiency: EfficiencyModel }
export type LoadNode = BaseNode & { type: 'Load'; Vreq: number; I_typ: number; I_max: number; I_idle?: number; duty_cycle?: number; critical?: boolean; numParalleledDevices?: number; Utilization_typ?: number; Utilization_max?: number }
export type BusNode = BaseNode & { type: 'Bus'; V_bus: number }
export type NoteNode = BaseNode & { type: 'Note'; text: string }
export type SubsystemNode = BaseNode & { type: 'Subsystem'; inputV_nom: number; project: Project; projectFileName?: string; numParalleledSystems?: number }
export type SubsystemInputNode = BaseNode & { type: 'SubsystemInput'; Vout: number }
export type AnyNode = SourceNode|ConverterNode|LoadNode|BusNode|NoteNode|SubsystemNode|SubsystemInputNode
export type Edge = {
  id: string;
  from: string;
  to: string;
  // Optional handle anchors to support multi-handle nodes (e.g., Subsystem multi-input)
  fromHandle?: string;
  toHandle?: string;
  netId?: string;
  interconnect?: { R_milliohm?: number, length_m?: number, awg?: string }
  /** Relative position (0-1) of the middle orthogonal segment between source/target */
  midpointOffset?: number;
  /** Absolute horizontal coordinate (canvas units) for the middle segment */
  midpointX?: number;
}
export type Scenario = 'Typical'|'Max'|'Idle'
export type Project = { id: string; name: string; units: { voltage:'V', current:'A', power:'W', resistance:'mΩ' }; defaultMargins: { currentPct:number, powerPct:number, voltageDropPct:number, voltageMarginPct:number }; scenarios: Scenario[]; currentScenario: Scenario; nodes: AnyNode[]; edges: Edge[] }
