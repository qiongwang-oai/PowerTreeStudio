import { Project } from '../models'

type SubsystemNode = { id: string; project?: Project }

const isSubsystem = (node: any): node is SubsystemNode => {
  return node && typeof node === 'object' && node.type === 'Subsystem'
}

export function findSubsystemPath(project: Project, targetId: string): string[] | null {
  const walk = (current: Project, path: string[]): string[] | null => {
    for (const node of current.nodes as any[]) {
      if (!isSubsystem(node)) continue
      const nextPath = [...path, node.id]
      if (node.id === targetId) {
        return nextPath
      }
      if (node.project) {
        const found = walk(node.project as Project, nextPath)
        if (found) {
          return found
        }
      }
    }
    return null
  }
  return walk(project, [])
}

export function resolveProjectAtPath(project: Project, path: string[]): Project | null {
  let current: Project | null = project
  for (const subsystemId of path) {
    if (!current) return null
    const node = (current.nodes as any[]).find(n => isSubsystem(n) && n.id === subsystemId) as SubsystemNode | undefined
    if (!node || !node.project) {
      return null
    }
    current = node.project as Project
  }
  return current
}
