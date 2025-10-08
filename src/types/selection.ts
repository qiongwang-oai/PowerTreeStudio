export type SelectionMode = 'single' | 'multi'

export type SelectionModeSource = 'user' | 'temporary'

export type SelectionModeChangeOptions = {
  source?: SelectionModeSource
}

export type MultiSelection = {
  kind: 'multi'
  nodes: string[]
  edges: string[]
  markups: string[]
}

export type InspectorSelection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'markup'; id: string }
  | { kind: 'nested-node'; subsystemPath: string[]; nodeId: string }
  | { kind: 'nested-edge'; subsystemPath: string[]; edgeId: string }
  | MultiSelection

export const isNestedSelection = (
  selection: InspectorSelection | null
): selection is Extract<InspectorSelection, { kind: 'nested-node' | 'nested-edge' }> => {
  return selection?.kind === 'nested-node' || selection?.kind === 'nested-edge'
}
