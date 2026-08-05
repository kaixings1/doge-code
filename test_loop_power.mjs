// 极限扩张功能测试
import { executeLoop } from './src/commands/loop/engine.ts'
import { autoSelectStrategy, parseLoopArgs } from './src/commands/loop/shortcuts.ts'
import * as fs from 'fs'

let pass = 0
let fail = 0
const check = (name, ok) => {
  if (ok) { pass++; console.log(`  ✅ ${name}`) } else { fail++; console.log(`  ❌ ${name}`) }
}

console.log('========== 1. 智能分解（多子任务+并行） ==========')
{
  // 服务器目标 → 应生成多个子任务
  let execCount = 0
  let maxConcurrent = 0
  let active = 0
  const r = await executeLoop({
    strategy: 'openhands',
    goal: { description: '创建一个 Web 服务器，包含前端页面', maxIterations: 3 },
    parallel: 4,
    taskExecutor: async () => {
      execCount++
      active++
      maxConcurrent = Math.max(maxConcurrent, active)
      await new Promise(res => setTimeout(res, 30))
      active--
      return { success: true, output: '📁 创建了 1 个文件:\n   • test/server.js' }
    },
  })
  check('智能分解生成多个子任务', r.subTasks.length > 1)
  check('所有子任务执行', execCount === r.subTasks.length)
  check('并行执行生效（最大并发 > 1）', maxConcurrent > 1)
  console.log(`  （子任务数: ${r.subTasks.length}, 最大并发: ${maxConcurrent}, 执行: ${execCount}）`)
}

console.log('\n========== 2. 预算超时停止 ==========')
{
  const start = Date.now()
  const r = await executeLoop({
    strategy: 'openhands',
    goal: { description: '无限循环任务', maxIterations: 50 },
    budgetMs: 500,  // 0.5s 预算
    taskExecutor: async () => {
      await new Promise(res => setTimeout(res, 200))
      return { success: true, output: '尝试中' }
    },
  })
  const elapsed = Date.now() - start
  check('预算超时停止', elapsed < 5000)
  check('未执行满 50 轮', r.iterations < 50)
  console.log(`  （耗时: ${elapsed}ms, 迭代: ${r.iterations}）`)
}

console.log('\n========== 3. 验证模式（files） ==========')
{
  // 输出不含文件标记 → 验证失败 → 任务 failed
  let calls = 0
  const r = await executeLoop({
    strategy: 'openhands',
    goal: { description: '创建文件', maxIterations: 6 },
    verifyMode: 'files',
    taskExecutor: async () => {
      calls++
      if (calls === 1) return { success: true, output: '只是文字描述，没有创建文件' }
      return { success: true, output: '📁 创建了 1 个文件:\n   • test/ok.js' }
    },
  })
  check('验证模式触发（无文件→继续迭代）', calls >= 2)
  check('第二次创建文件后成功', r.success)
  console.log(`  （AI 调用: ${calls}, 结果: ${r.success}）`)
}

console.log('\n========== 4. 检查点保存/恢复 ==========')
{
  const cpPath = 'test-loop-checkpoint.json'
  try { fs.rmSync(cpPath, { force: true }) } catch {}
  let calls = 0
  const r1 = await executeLoop({
    strategy: 'openhands',
    goal: { description: '检查点测试', maxIterations: 20 },
    checkpoint: cpPath,
    taskExecutor: async () => {
      calls++
      if (calls <= 3) return { success: true, output: `第 ${calls} 次，无文件` }
      return { success: true, output: '📁 创建了 1 个文件:\n   • test/cp.js' }
    },
  })
  const cpExists = fs.existsSync(cpPath)
  check('检查点文件已保存', cpExists)
  if (cpExists) {
    const cp = JSON.parse(fs.readFileSync(cpPath, 'utf-8'))
    check('检查点含子任务数据', Array.isArray(cp.subTasks) && cp.subTasks.length > 0)
    check('检查点含创建文件记录', Array.isArray(cp.createdFiles))
    console.log(`  （检查点: ${Object.keys(cp).join(', ')}）`)
  }
  try { fs.rmSync(cpPath, { force: true }) } catch {}
}

console.log('\n========== 5. 自适应策略选择 ==========')
{
  check('工作流→langgraph', autoSelectStrategy('搭建一个数据处理工作流') === 'langgraph')
  check('团队协作→crew', autoSelectStrategy('让团队协作完成报告') === 'crew')
  check('研究探索→autogpt', autoSelectStrategy('研究最新 AI 技术') === 'autogpt')
  check('代码重构→swe-agent', autoSelectStrategy('重构这个代码库') === 'swe-agent')
  check('默认→openhands', autoSelectStrategy('创建一个网站') === 'openhands')
}

console.log('\n========== 6. 参数解析（新选项） ==========')
{
  const p = parseLoopArgs('创建服务器 --parallel 3 --auto --budget 5m --verify files --report out.md --checkpoint cp.json')
  check('--parallel', p.parallel === 3)
  check('--auto', p.auto === true)
  check('--budget 5m', p.budget === 300000)
  check('--verify files', p.verify === 'files')
  check('--report', p.report === 'out.md')
  check('--checkpoint', p.checkpoint === 'cp.json')
  check('goal 保留', p.goal === '创建服务器')
}

console.log('\n========== 结果 ==========')
console.log(`通过: ${pass}, 失败: ${fail}`)
process.exit(fail > 0 ? 1 : 0)
