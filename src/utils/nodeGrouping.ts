import type { AnyNode, Project } from '../models'

export type NodeIndexEntry = {
  node: AnyNode
  nodeId: string
  path: string[]
  pathKey: string
  pathNames: string[]
}

export type ProjectNodeGroup = {
  label: string
  path: string[]
  pathKey: string
  nameTrail: string[]
  nodeKeys: string[]
}

export type ProjectNodeGrouping = {
  groups: ProjectNodeGroup[]
  nodeIndex: Record<string, NodeIndexEntry>
}

export const encodeNodeKey = (path: string[], nodeId: string): string => JSON.stringify([path, nodeId])

export const decodeNodeKey = (key: string): { path: string[]; nodeId: string } => {
  try {
    const parsed = JSON.parse(key)
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      Array.isArray(parsed[0]) &&
      typeof parsed[1] === 'string'
    ) {
      const path = (parsed[0] as unknown[]).filter((segment): segment is string => typeof segment === 'string' && segment.length > 0)
      return { path, nodeId: parsed[1] as string }
    }
  } catch (err) {
    console.warn('Failed to decode node key', key, err)
  }
  return { path: [], nodeId: '' }
}

export function collectProjectNodeGroups(project: Project): ProjectNodeGrouping {
  const nodeIndex: Record<string, NodeIndexEntry> = {}
  const groups: ProjectNodeGroup[] = []

  const walk = (current: Project, path: string[], nameTrail: string[]): void => {
    const pathKey = path.join('>')
    const nodes = (current.nodes || []) as AnyNode[]
    const nodeKeys: string[] = []

    for (const node of nodes) {
      const key = encodeNodeKey(path, node.id)
      nodeIndex[key] = {
        node,
        nodeId: node.id,
        path,
        pathKey,
        pathNames: nameTrail,
      }
      nodeKeys.push(key)
    }

    const label = path.length === 0
      ? 'Top Level System'
      : (nameTrail.length ? nameTrail.join(' / ') : 'Subsystem')

    groups.push({
      label,
      path,
      pathKey,
      nameTrail,
      nodeKeys,
    })

    for (const node of nodes) {
      if (node.type !== 'Subsystem') continue
      const sub = node as AnyNode & { project?: Project }
      if (!sub.project) continue
      const childPath = [...path, node.id]
      const childNameTrail = [...nameTrail, node.name || 'Subsystem']
      walk(sub.project as Project, childPath, childNameTrail)
    }
  }

  walk(project, [], [])

  return { groups, nodeIndex }
}


