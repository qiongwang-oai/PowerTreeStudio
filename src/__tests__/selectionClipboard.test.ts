import { describe, it, expect } from 'vitest'
import { collectClipboardPayload, applyClipboardPayload } from '../utils/selectionClipboard'
import type { MultiSelection } from '../types/selection'
import type { AnyNode, Edge, CanvasMarkup } from '../models'

describe('selection clipboard helpers', () => {
  it('collects selected items and applies translated clones', () => {
    const nodes: AnyNode[] = [
      { id: 'n1', name: 'Node 1', type: 'Source', x: 10, y: 20 } as AnyNode,
      { id: 'n2', name: 'Node 2', type: 'Load', x: 60, y: 80 } as AnyNode,
    ]
    const edges: Edge[] = [
      { id: 'e1', from: 'n1', to: 'n2', midpointX: 32 } as Edge,
    ]
    const markups: CanvasMarkup[] = [
      {
        id: 'm1',
        type: 'text',
        position: { x: 15, y: 25 },
        value: 'Hello',
        fontSize: 16,
        color: '#000',
      } as CanvasMarkup,
    ]

    const selection: MultiSelection = {
      kind: 'multi',
      nodes: ['n1', 'n2'],
      edges: ['e1'],
      markups: ['m1'],
    }

    const payload = collectClipboardPayload(selection, {
      resolveNodeSnapshot: id => nodes.find(node => node.id === id) ?? null,
      resolveEdgeSnapshot: id => edges.find(edge => edge.id === id) ?? null,
      resolveMarkupSnapshot: id => markups.find(markup => markup.id === id) ?? null,
    })

    expect(payload).not.toBeNull()
    expect(payload!.nodes).toHaveLength(2)
    expect(payload!.edges).toHaveLength(1)
    expect(payload!.markups).toHaveLength(1)
    expect(payload!.origin).toEqual({ x: 10, y: 20 })

    const addedNodes: AnyNode[] = []
    const addedEdges: Edge[] = []
    const addedMarkups: CanvasMarkup[] = []
    let nodeCounter = 0
    let edgeCounter = 0
    let markupCounter = 0

    const result = applyClipboardPayload({
      payload: payload!,
      target: { x: 200, y: 120 },
      generateNodeId: () => `node_new_${nodeCounter++}`,
      generateEdgeId: () => `edge_new_${edgeCounter++}`,
      generateMarkupId: () => `markup_new_${markupCounter++}`,
      addNode: node => { addedNodes.push(node) },
      addEdge: edge => { addedEdges.push(edge) },
      addMarkup: markup => { addedMarkups.push(markup) },
    })

    expect(result.newNodeIds).toHaveLength(2)
    expect(result.newEdgeIds).toHaveLength(1)
    expect(result.newMarkupIds).toHaveLength(1)

    const translationX = 200 - 10 + 32
    const translationY = 120 - 20 + 32
    expect(addedNodes[0].x).toBeCloseTo((payload!.nodes[0]?.x ?? 0) + translationX, 5)
    expect(addedNodes[0].y).toBeCloseTo((payload!.nodes[0]?.y ?? 0) + translationY, 5)
    expect(addedNodes[1].id).toBe('node_new_1')

    expect(addedEdges[0].from).toBe('node_new_0')
    expect(addedEdges[0].to).toBe('node_new_1')
    expect(addedEdges[0].midpointX).toBeCloseTo((payload!.edges[0]?.midpointX ?? 0) + translationX, 5)

    expect(addedMarkups[0].position.x).toBeCloseTo(15 + translationX, 5)
    expect(addedMarkups[0].position.y).toBeCloseTo(25 + translationY, 5)
  })
})

