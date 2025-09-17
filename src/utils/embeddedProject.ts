import { AnyNode, Project } from '../models'
import { genId } from '../utils'

export function sanitizeEmbeddedProject(project: Project): Project {
  const clone: Project = JSON.parse(JSON.stringify(project))
  const sources = clone.nodes.filter(n => (n as any).type === 'Source')
  if (sources.length > 0) {
    const note: AnyNode = {
      id: genId('n_'),
      type: 'Note' as any,
      name: 'Import Notice',
      text: `${sources.length} Source node(s) removed during import. Use Subsystem Input as upstream.`
    } as any
    clone.nodes = [note, ...clone.nodes.filter(n => (n as any).type !== 'Source')]
    const removedIds = new Set(sources.map(s => s.id))
    clone.edges = clone.edges.filter(e => !removedIds.has(e.from) && !removedIds.has(e.to))
  }

  const inputs = clone.nodes.filter(n => (n as any).type === 'SubsystemInput')
  if (inputs.length === 0) {
    const inputNode: AnyNode = {
      id: genId('n_'),
      type: 'SubsystemInput' as any,
      name: 'Subsystem Input',
      Vout: 12,
      x: 80,
      y: 80
    } as any
    clone.nodes = [inputNode, ...clone.nodes]
  }

  return clone
}

