import { genId } from '../utils'
import type { AnyNode, NodeType, Project } from '../models'

type NodePresetVariantMap = {
  Source: '48v-default'
  Converter: '12v-buck-95' | 'vrm-0p9-92'
  DualOutputConverter: 'dual-default'
  Load: '12v-generic'
  Bus: '12v-bus'
  Note: 'default'
  Subsystem: 'default'
  SubsystemInput: '12v-input'
}

type VariantFor<T extends NodeType> = NodePresetVariantMap[T] | undefined

export type NodePresetDescriptor<T extends NodeType = NodeType> = {
  type: T
  variant?: VariantFor<T>
}

export const NODE_PRESET_MIME = 'application/x-powertree-node-preset'

function buildSubsystemProject(): Project {
  return {
    id: genId('p_'),
    name: 'Embedded',
    units: { voltage: 'V', current: 'A', power: 'W', resistance: 'mΩ' },
    defaultMargins: {
      currentPct: 10,
      powerPct: 10,
      voltageDropPct: 5,
      voltageMarginPct: 3,
    },
    scenarios: ['Typical', 'Max', 'Idle'],
    currentScenario: 'Typical',
    nodes: [],
    edges: [],
  }
}

export function createNodePreset<T extends NodeType>(descriptor: NodePresetDescriptor<T>): AnyNode {
  const id = genId('n_')
  const { type, variant } = descriptor
  switch (type) {
    case 'Source':
      return {
        id,
        type,
        name: 'Source',
        Vout: 48,
        x: 80,
        y: 80,
      } as AnyNode
    case 'Converter': {
      if (variant === 'vrm-0p9-92') {
        return {
          id,
          type,
          name: 'VRM 0.9V 92%',
          Vin_min: 10,
          Vin_max: 13,
          Vout: 0.9,
          controllerPartNumber: '',
          powerStagePartNumber: '',
          phaseCount: 1,
          efficiency: { type: 'fixed', value: 0.92 },
          x: 640,
          y: 160,
        } as AnyNode
      }
      return {
        id,
        type,
        name: 'Buck',
        Vin_min: 40,
        Vin_max: 60,
        Vout: 12,
        controllerPartNumber: '',
        powerStagePartNumber: '',
        phaseCount: 1,
        efficiency: { type: 'fixed', value: 0.95 },
        x: 320,
        y: 160,
      } as AnyNode
    }
    case 'DualOutputConverter': {
      return {
        id,
        type,
        name: 'Dual-output Converter',
        Vin_min: 38,
        Vin_max: 60,
        controllerPartNumber: '',
        powerStagePartNumber: '',
        outputs: [
          {
            id: 'outputA',
            label: 'Output A',
            Vout: 12,
            Iout_max: 10,
            Pout_max: 120,
            phaseCount: 1,
            efficiency: { type: 'fixed', value: 0.95 },
          },
          {
            id: 'outputB',
            label: 'Output B',
            Vout: 5,
            Iout_max: 20,
            Pout_max: 100,
            phaseCount: 1,
            efficiency: { type: 'fixed', value: 0.9 },
          },
        ],
        x: 340,
        y: 260,
      } as AnyNode
    }
    case 'Load':
      return {
        id,
        type,
        name: 'Load',
        Vreq: 12,
        I_typ: 1,
        I_idle: 1,
        I_max: 2,
        Utilization_typ: 100,
        Utilization_max: 100,
        numParalleledDevices: 1,
        x: 560,
        y: 240,
      } as AnyNode
    case 'Bus':
      return {
        id,
        type,
        name: 'Bus',
        V_bus: 12,
        x: 420,
        y: 220,
      } as AnyNode
    case 'Subsystem':
      return {
        id,
        type,
        name: 'Subsystem',
        inputV_nom: 12,
        numParalleledSystems: 1,
        project: buildSubsystemProject(),
        x: 420,
        y: 300,
      } as AnyNode
    case 'SubsystemInput':
      return {
        id,
        type,
        name: 'Subsystem Input',
        Vout: 12,
        x: 80,
        y: 80,
      } as AnyNode
    default:
      return {
        id,
        type,
        name: 'Note',
        text: '...',
        x: 420,
        y: 300,
      } as AnyNode
  }
}

export function withPosition(node: AnyNode, position: { x: number; y: number }) {
  return { ...node, x: position.x, y: position.y } as AnyNode
}

export function serializePresetDescriptor(descriptor: NodePresetDescriptor): string {
  return JSON.stringify(descriptor)
}

export function deserializePresetDescriptor(raw: string | null): NodePresetDescriptor | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.type === 'string') {
      return parsed as NodePresetDescriptor
    }
  } catch (_err) {
    return null
  }
  return null
}

export function dataTransferHasNodePreset(dt: DataTransfer | null): boolean {
  if (!dt) return false
  try {
    const types = Array.from(dt.types as any as string[])
    if (types.includes(NODE_PRESET_MIME)) return true
  } catch (_err) {
    // Older browsers expose DOMStringList; fall back to getData
  }
  return Boolean(dt.getData(NODE_PRESET_MIME))
}
