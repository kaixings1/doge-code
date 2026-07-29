/**
 * 独立诊断：追踪工具名称数据流 toolExecutor → QueryEngine → requestBuilder → apiClient
 */
import { createAdaptedTools } from './toolExecutor.ts'
import { QueryEngine } from '../../src/engine/index.ts'

const config = {
  provider: 'openai',
  apiKey: 'sk-test',
  model: 'test',
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  workingDir: 'D:\\doge-code'
}

console.log('=== Step 1: adaptedTools Map ===')
const adapted = createAdaptedTools(config)
console.log('Size:', adapted.size)
let i = 0
for (const [name, tool] of adapted) {
  if (i++ < 5) {
    console.log(`  "${name}":`, {
      name: tool.name,
      desc: tool.description?.slice(0, 60)
    })
  }
}
const emptyKeys = [...adapted.entries()].filter(([k]) => k === '')
console.log('Empty-key entries:', emptyKeys.length)
console.log('First 5 keys:', [...adapted.keys()].slice(0, 5).join(', '))

// Verify: does each entry have matching key vs tool.name?
const mismatches = [...adapted.entries()].filter(([k, v]) => k !== v.name)
console.log('Key vs tool.name mismatches:', mismatches.length)
if (mismatches.length > 0) {
  console.log('First mismatch:', { key: mismatches[0][0], toolName: mismatches[0][1].name })
}

console.log('\n=== Step 2: QueryEngine._toolDefinitions from registry ===')
const engine = new QueryEngine({
  model: config.model,
  maxOutputTokens: 1000,
  tools: adapted,
  provider: 'openai'
})
const defs = engine._toolDefinitions
console.log('Definition count:', defs.length)
console.log('First 5 def names:', defs.slice(0, 5).map((d: any) => d.name))
const emptyDefs = defs.filter((d: any) => !d.name || d.name === '')
console.log('Empty name definitions:', emptyDefs.length)

console.log('\n=== DONE ===')
