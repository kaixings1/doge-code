import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import fs from 'fs'

export const call: LocalJSXCommandCall = async (args) => {
  const p = args.trim().split(/\s+/)
  const c = p[0] || ''
  if (!c) return { type: 'text', value: '/diagram mermaid <file> | 渲染 Mermaid 图表\n/diagram template <type> | 生成图表模板\ntypes: flowchart, sequence, class, state, gantt' }

  let r = ''
  if (c === 'template') {
    const type = p[1] || 'flowchart'
    const templates: Record<string, string> = {
      flowchart: 'graph TD\nA[Start] --> B{Decision}\nB -->|Yes| C[Process]\nB -->|No| D[End]',
      sequence: 'sequenceDiagram\nAlice->>John: Hello John\nJohn-->>Alice: Hi Alice',
      class: 'classDiagram\nclass Animal {\n+String name\n+makeSound()\n}',
      state: 'stateDiagram-v2\n[*] --> Still\nStill --> Moving\nMoving --> Still\nMoving --> [*]',
      gantt: 'gantt\ntitle Project Plan\nsection Phase 1\nTask 1 :a1, 2024-01-01, 30d',
    }
    r = templates[type] || 'Unknown type: ' + type
  } else if (c === 'mermaid') {
    const file = p[1]
    if (!file || !fs.existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
    r = fs.readFileSync(file, 'utf-8')
  } else {
    r = 'Unknown: ' + c
  }
  return { type: 'text', value: r || '(no output)' }
}

const cmd = { type: 'local-jsx' as const, name: 'diagram', description: 'Mermaid 图表模板生成：template/mermaid', argumentHint: '<template|mermaid> [type|file]', isEnabled: true, load: () => import('./index.js') } satisfies Command
export default cmd
