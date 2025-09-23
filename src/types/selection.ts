export type InspectorSelection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'nested-node'; subsystemPath: string[]; nodeId: string }
  | { kind: 'nested-edge'; subsystemPath: string[]; edgeId: string }

export const isNestedSelection = (
  selection: InspectorSelection | null
): selection is Extract<InspectorSelection, { kind: 'nested-node' | 'nested-edge' }> => {
  return selection?.kind === 'nested-node' || selection?.kind === 'nested-edge'
}
