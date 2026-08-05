// 测试修复后的 executeLoop
// 场景1: taskExecutor 不创建文件 → 应该继续迭代（不假成功）
// 场景2: taskExecutor 创建文件 → 应该判定成功

import { executeLoop } from './src/commands/loop/engine.ts'

console.log('========== 场景1: AI 未创建文件（应迭代改进，不假成功）==========')
let callCount = 0
const result1 = await executeLoop({
  strategy: 'openhands',
  goal: { description: '创建一个服务器', maxIterations: 3 },
  taskExecutor: async (prompt, systemPrompt, task) => {
    callCount++
    console.log(`  [EXEC ${callCount}] 收到任务`)
    // 模拟 AI 只返回文字，没有 bash 命令创建文件
    return { success: true, output: '我理解了任务，需要创建一个服务器。计划：1.创建server.js 2.运行。' }
  },
  onProgress: (e) => {
    if (e.type === 'evaluation') console.log(`  [评估] achieved=${e.achieved}: ${e.reason.slice(0, 70)}`)
  },
})
console.log('结果: success=', result1.success, '| 迭代=', result1.iterations, '| AI调用=', callCount)
console.log('原因:', result1.reason)

console.log('\n========== 场景2: AI 创建文件（应判定成功）==========')
let callCount2 = 0
const result2 = await executeLoop({
  strategy: 'openhands',
  goal: { description: '创建 test2/server.js', maxIterations: 3 },
  taskExecutor: async (prompt, systemPrompt, task) => {
    callCount2++
    console.log(`  [EXEC ${callCount2}] 收到任务`)
    return { success: true, output: '已执行 bash 命令创建文件。\n📁 创建了 1 个文件:\n   • test2/server.js' }
  },
  onProgress: (e) => {
    if (e.type === 'evaluation') console.log(`  [评估] achieved=${e.achieved}: ${e.reason.slice(0, 70)}`)
  },
})
console.log('结果: success=', result2.success, '| 迭代=', result2.iterations, '| AI调用=', callCount2)
console.log('原因:', result2.reason)

console.log('\n========== 场景3: AI 前2次失败，第3次成功（验证真实循环改进）==========')
let callCount3 = 0
const result3 = await executeLoop({
  strategy: 'openhands',
  goal: { description: '创建 test3/app.js', maxIterations: 5 },
  taskExecutor: async (prompt, systemPrompt, task) => {
    callCount3++
    if (callCount3 < 3) {
      console.log(`  [EXEC ${callCount3}] 模拟失败（无文件）`)
      return { success: true, output: `第 ${callCount3} 次执行，未创建文件。` }
    }
    console.log(`  [EXEC ${callCount3}] 模拟成功（创建文件）`)
    return { success: true, output: '📁 创建了 1 个文件:\n   • test3/app.js' }
  },
  onProgress: (e) => {
    if (e.type === 'evaluation') console.log(`  [评估] achieved=${e.achieved}: ${e.reason.slice(0, 70)}`)
  },
})
console.log('结果: success=', result3.success, '| 迭代=', result3.iterations, '| AI调用=', callCount3)
console.log('原因:', result3.reason)

process.exit(0)
