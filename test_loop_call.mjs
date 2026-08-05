// 真实复现用户问题：调用 index.tsx 的 call 函数
// 使用真实环境变量（API key 已配置）

import { call } from './src/commands/loop/index.tsx'

// 模拟 onDone（收集所有输出）
const outputs = []
function onDone(text, options) {
  const display = options?.display || 'user'
  outputs.push({ display, text: typeof text === 'string' ? text : JSON.stringify(text) })
  console.log(`[OUT ${display}] ${String(text).slice(0, 200)}`)
}

// 模拟 context
const context = {
  options: {},  // mainLoopModel 未设置，使用环境变量
}

console.log('=== 开始调用 /loop ===')
console.log('环境: DOGE_API_KEY=', (process.env.DOGE_API_KEY || '').slice(0, 10) + '...')
console.log('环境: ANTHROPIC_BASE_URL=', process.env.ANTHROPIC_BASE_URL)
console.log('环境: ANTHROPIC_MODEL=', process.env.ANTHROPIC_MODEL)
console.log('')

const startTime = Date.now()
try {
  await call(onDone, context, '创建一个 Node.js Hello World 服务器,代码放在test/里面')
  console.log('')
  console.log('=== 调用完成 ===')
  console.log('总耗时:', Date.now() - startTime + 'ms')
  console.log('输出次数:', outputs.length)
} catch (e) {
  console.log('')
  console.log('=== call 抛异常 ===')
  console.log('异常:', e.message)
}
process.exit(0)
