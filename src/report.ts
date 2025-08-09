import { ComputeResult } from './calc'
import { Project } from './models'
import { download } from './io'
export function generateMarkdown(project: Project, result: ComputeResult): string {
return `# PowerTree Studio Report

**Project:** ${project.name}

## Totals
- Total Load Power: ${result.totals.loadPower.toFixed(2)} W
- Total Source Input: ${result.totals.sourceInput.toFixed(2)} W
- Overall Efficiency: ${(result.totals.overallEta*100).toFixed(2)} %

## Global Warnings
${result.globalWarnings.length? result.globalWarnings.map(w=>'- '+w).join('\n'): '- None'}

## Node Warnings
${Object.values(result.nodes).map(n=>{
  const ws = n.warnings?.length? n.warnings.map(w=>'  - '+w).join('\n') : '  - None'
  return `- **${n.name}** (${n.type})\n${ws}`
}).join('\n')}
`}
export function exportReport(project: Project, result: ComputeResult){ const md = generateMarkdown(project, result); download(`${project.name.replace(/\s+/g,'_')}_report.md`, md, 'text/markdown') }
