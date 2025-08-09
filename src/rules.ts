import { Project } from './models'
export function validate(project: Project): string[] {
  const warnings: string[] = []
  if (!project.nodes.length) warnings.push('Project has no nodes.')
  const ids = new Set(project.nodes.map(n=>n.id))
  for (const e of project.edges){ if (!ids.has(e.from) || !ids.has(e.to)) warnings.push(`Edge ${e.id} references missing nodes.`) }
  const connected = new Set<string>([...project.edges.map(e=>e.from), ...project.edges.map(e=>e.to)])
  for (const n of project.nodes){ if (n.type!=='Note' && !connected.has(n.id)) warnings.push(`Unconnected node: ${n.name}`) }
  return warnings
}
