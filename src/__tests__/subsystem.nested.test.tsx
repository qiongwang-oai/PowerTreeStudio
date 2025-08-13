import { describe, it, expect } from 'vitest'
import { compute } from '../calc'
import { Project, AnyNode, Edge } from '../models'
import { useStore } from '../state/store'

function makeProject(nodes: AnyNode[], edges: Edge[], scenario:'Typical'|'Max'|'Idle'='Typical'): Project {
  return {
    id: 'p_root',
    name: 'Test',
    units: { voltage:'V', current:'A', power:'W', resistance:'mΩ' },
    defaultMargins: { currentPct:10, powerPct:10, voltageDropPct:5, voltageMarginPct:3 },
    scenarios: ['Typical','Max','Idle'],
    currentScenario: scenario,
    nodes,
    edges
  }
}

describe('Subsystem scenario sync and nested editing', () => {
  it('syncs inner scenario to parent when computing', () => {
    const innerNodes: AnyNode[] = [
      { id:'in', type:'SubsystemInput', name:'In' } as any,
      { id:'c1', type:'Converter', name:'Buck', Vin_min: 10, Vin_max: 14, Vout: 5, efficiency:{type:'fixed', value:0.9} } as any,
      { id:'l1', type:'Load', name:'CPU', Vreq:5, I_typ:1, I_max:2 } as any,
    ]
    const innerEdges: Edge[] = [
      { id:'e_in_c1', from:'in', to:'c1' },
      { id:'e_c1_l1', from:'c1', to:'l1' }
    ] as any
    const subsystem: AnyNode = { id:'ss', type:'Subsystem', name:'SS', inputV_nom:12, project: makeProject(innerNodes, innerEdges, 'Typical') } as any
    const source: AnyNode = { id:'s', type:'Source', name:'S', Vout:12 } as any
    const root = makeProject([source, subsystem], [{ id:'e_s_ss', from:'s', to:'ss' } as any], 'Typical')
    const r1 = compute(root)
    expect(Number(r1.nodes['ss']?.P_out?.toFixed(2))).toBe(5.00)
    // Switch to Max at root; inner will be synced by compute
    root.currentScenario = 'Max'
    const r2 = compute(root)
    expect(Number(r2.nodes['ss']?.P_out?.toFixed(2))).toBe(10.00)
  })

  it('nested store mutations persist in embedded project', () => {
    const subsystem: AnyNode = { id:'ss2', type:'Subsystem', name:'SS2', inputV_nom:12, project: makeProject([], [], 'Typical') } as any
    const root = makeProject([subsystem], [], 'Typical')
    const { setProject, subsystemAddNode, subsystemAddEdge } = useStore.getState()
    setProject(root)
    // add input and a load
    subsystemAddNode('ss2', { id:'in', type:'SubsystemInput', name:'In' } as any)
    subsystemAddNode('ss2', { id:'l', type:'Load', name:'L', Vreq:5, I_typ:1, I_max:2 } as any)
    // connect (no converter for simplicity)
    subsystemAddEdge('ss2', { id:'e_in_l', from:'in', to:'l' } as any)
    const proj = useStore.getState().project
    const ss2 = proj.nodes.find(n=>n.id==='ss2') as any
    expect(ss2.project.nodes.some((n:any)=>n.id==='in')).toBe(true)
    expect(ss2.project.nodes.some((n:any)=>n.id==='l')).toBe(true)
    expect(ss2.project.edges.some((e:any)=>e.id==='e_in_l')).toBe(true)
  })
})


