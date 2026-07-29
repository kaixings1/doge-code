/**
 * 独立诊断：追踪工具名称数据流 toolExecutor → QueryEngine → requestBuilder → apiClient
 */
import { createAdaptedTools } from './desktop/src/main/toolExecutor.js'
import { QueryEngine } from './src/engine/index.js'
import { zodToJsonSchema } from './src/utils/zodToJsonSchema.js'

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
      description: tool.description?.slice(0, 60),
      parameters: tool.parameters
    })
  }
}
// 检查是否有空名称
const emptyNames = [...adapted.entries()].filter(([k]) => k === '')
console.log('Empty key entries:', emptyNames.length)
console.log('First 5 actual keys:', [...adapted.keys()].slice(0, 5).join(', '))

console.log('\n=== Step 2: QueryEngine._toolDefinitions ===')
const engine = new QueryEngine({
  model: config.model,
  maxOutputTokens: 1000,
  tools: adapted,
  provider: 'openai'
})
const defs = engine._toolDefinitions
console.log('Count:', defs?.length || 0)
if (defs && defs.length > 0) {
  console.log('First 3:', defs.slice(0, 3).map(d => d.name))
  const empty = defs.filter((d: any) => !d.name || d.name === '')
  console.log('Empty name entries:', empty.length)
}

console.log('\n=== Step 3: Test zodToJsonSchema on a tool ===')
const srcTool = (await import('./src/tools.js')).getAllBaseTools()[0]
console.log('srcTool.name:', srcTool.name)
console.log('srcTool.inputSchema:', srcTool.inputSchema)
console.log('type:', typeof srcTool.inputSchema, typeof srcTool.inputSchema === 'function')
if (typeof srcTool.inputSchema === 'function') {
  try {
    const schemaResult = srcTool.inputSchema()
    console.log('inputSchema() result:', JSON.stringify(schemaResult).slice(0, 200))
  } catch (e) {
    console.log('inputSchema() error:', e)
  }
}

console.log('\n=== Done ===')
