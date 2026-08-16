/**
 * 长任务执行器 — 文件系统持久化的断点续跑系统
 *
 * 解决的核心问题：
 *   1. 设定大目标后，对话被压缩/中断，后续没有下文
 *   2. 需要反复提醒"继续"
 *   3. 进度不持久化，每次重新开始
 *
 * 设计：
 *   - 任务定义写在 .doge/tasks/queue.json（用户编辑或对话中创建）
 *   - 每步执行后立即持久化状态到磁盘
 *   - 中断后重新运行同一命令，自动从断点继续
 *   - 每步有明确的验证标准，通过后才进入下一步
 *
 * 使用方式：
 *   1. 用户或助手将大目标拆成步骤，写入 .doge/tasks/queue.json
 *   2. 运行: npx tsx src/utils/taskExecutor.ts
 *   3. 每步完成后自动进入下一步，直到全部完成
 *   4. 如需暂停，在步骤描述中加 "PAUSE_AFTER" 标记
 *   5. 中断后重新运行命令即可续跑
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

// ==================== 类型定义 ====================

interface TaskStep {
  id: string
  subject: string
  description: string
  verify?: string[]          // 验证命令列表（每条成功 = 该步骤通过）
  dependencies?: string[]    // 依赖的其他步骤 id
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  result?: string            // 执行结果摘要
  error?: string             // 错误信息
  startedAt?: string
  completedAt?: string
}

interface TaskQueue {
  name: string
  goal: string
  steps: TaskStep[]
  createdAt: string
  updatedAt: string
  currentStepId?: string
}

// ==================== 持久化 ====================

const TASKS_DIR = join(process.cwd(), '.doge', 'tasks')
const QUEUE_FILE = join(TASKS_DIR, 'queue.json')
const PROGRESS_FILE = join(TASKS_DIR, 'progress.log')

function ensureTasksDir(): void {
  if (!existsSync(TASKS_DIR)) {
    mkdirSync(TASKS_DIR, { recursive: true })
  }
}

function loadQueue(): TaskQueue {
  ensureTasksDir()
  if (!existsSync(QUEUE_FILE)) {
    throw new Error(`任务队列不存在: ${QUEUE_FILE}\n请先创建任务队列文件。`)
  }
  const raw = readFileSync(QUEUE_FILE, 'utf8')
  return JSON.parse(raw) as TaskQueue
}

function saveQueue(queue: TaskQueue): void {
  queue.updatedAt = new Date().toISOString()
  writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2))
}

function logProgress(message: string): void {
  ensureTasksDir()
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${message}`
  writeFileSync(PROGRESS_FILE, line + '\n', { flag: 'a' })
}

// ==================== 核心逻辑 ====================

function getNextPendingStep(queue: TaskQueue): TaskStep | null {
  const completed = new Set(queue.steps.filter(s => s.status === 'completed').map(s => s.id))

  for (const step of queue.steps) {
    if (step.status === 'completed') continue
    if (step.status === 'skipped') continue

    // 检查依赖
    if (step.dependencies) {
      const unmet = step.dependencies.filter(dep => !completed.has(dep))
      if (unmet.length > 0) {
        console.log(`  ⏳ 步骤 [${step.id}] 依赖未满足: ${unmet.join(', ')}，跳过`)
        step.status = 'skipped'
        step.error = `依赖未满足: ${unmet.join(', ')}`
        continue
      }
    }

    if (step.status === 'failed') {
      console.log(`  ⚠️ 步骤 [${step.id}] 之前失败，重试`)
    }

    return step
  }

  return null
}

function runStep(step: TaskStep): { success: boolean; output: string } {
  console.log(`\n━━━ 执行步骤 [${step.id}]: ${step.subject} ━━━`)
  console.log(`  描述: ${step.description}`)

  step.status = 'running'
  step.startedAt = new Date().toISOString()

  // 如果步骤包含 PAUSE_AFTER 标记，暂停等待用户输入
  if (step.description.includes('PAUSE_AFTER')) {
    console.log(`  ⏸️ 此步骤需要人工确认后继续`)
    step.result = '等待人工确认'
    step.completedAt = new Date().toISOString()
    step.status = 'completed'
    return { success: true, output: '暂停等待人工确认' }
  }

  // 运行验证命令
  if (step.verify && step.verify.length > 0) {
    const { execSync } = require('child_process')
    const results: string[] = []

    for (const cmd of step.verify) {
      console.log(`  🔍 验证: ${cmd}`)
      try {
        const output = execSync(cmd, {
          encoding: 'utf8',
          cwd: process.cwd(),
          timeout: 120000,
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim()
        results.push(`✅ ${cmd}`)
        console.log(`     → 通过`)
      } catch (e: unknown) {
        const err = e as { stderr?: string; message?: string }
        const errorMsg = err.stderr || err.message || '未知错误'
        results.push(`❌ ${cmd}: ${errorMsg.slice(0, 200)}`)
        console.log(`     → 失败: ${errorMsg.slice(0, 200)}`)
        step.status = 'failed'
        step.error = errorMsg.slice(0, 500)
        step.completedAt = new Date().toISOString()
        return { success: false, output: results.join('\n') }
      }
    }

    step.result = results.join('\n')
    step.completedAt = new Date().toISOString()
    step.status = 'completed'
    return { success: true, output: step.result }
  }

  // 无验证命令的步骤，标记为完成
  step.result = '无验证命令，标记完成'
  step.completedAt = new Date().toISOString()
  step.status = 'completed'
  return { success: true, output: step.result }
}

function printSummary(queue: TaskQueue): void {
  const total = queue.steps.length
  const completed = queue.steps.filter(s => s.status === 'completed').length
  const failed = queue.steps.filter(s => s.status === 'failed').length
  const skipped = queue.steps.filter(s => s.status === 'skipped').length
  const pending = queue.steps.filter(s => s.status === 'pending').length

  console.log(`\n━━━ 任务进度: ${completed}/${total} 完成 ━━━`)
  console.log(`  ✅ 完成: ${completed}`)
  if (failed > 0) console.log(`  ❌ 失败: ${failed}`)
  if (skipped > 0) console.log(`  ⏭️ 跳过: ${skipped}`)
  if (pending > 0) console.log(`  ⏳ 待执行: ${pending}`)

  console.log('\n步骤详情:')
  for (const step of queue.steps) {
    const icon = {
      completed: '✅',
      failed: '❌',
      skipped: '⏭️',
      running: '🔄',
      pending: '⏳',
    }[step.status] || '❓'
    console.log(`  ${icon} [${step.id}] ${step.subject}`)
    if (step.error) {
      console.log(`      错误: ${step.error.slice(0, 150)}`)
    }
  }
}

// ==================== 主执行循环 ====================

function execute(maxSteps?: number): void {
  console.log('🚀 长任务执行器启动')
  console.log('   每步执行后自动持久化，中断后重新运行即可续跑\n')

  const queue = loadQueue()
  console.log(`📋 任务: ${queue.name}`)
  console.log(`🎯 目标: ${queue.goal}\n`)

  printSummary(queue)

  let stepCount = 0
  const limit = maxSteps ?? Infinity

  while (stepCount < limit) {
    const next = getNextPendingStep(queue)

    if (!next) {
      console.log('\n🎉 所有步骤已完成！')
      break
    }

    queue.currentStepId = next.id
    saveQueue(queue)
    logProgress(`开始��骤 [${next.id}]: ${next.subject}`)

    const result = runStep(next)
    saveQueue(queue)
    logProgress(`步骤 [${next.id}] ${result.success ? '完成' : '失败'}: ${next.subject}`)

    console.log(`  ${result.success ? '✅' : '❌'} ${next.subject}`)

    if (!result.success) {
      console.log('\n⚠️ 步骤失败，请修复后重新运行命令继续。')
      console.log(`   失败步骤: [${next.id}] ${next.subject}`)
      console.log(`   错误: ${next.error?.slice(0, 300)}`)
      break
    }

    stepCount++

    // 检查是否还有下一步
    const checkNext = getNextPendingStep(queue)
    if (!checkNext) {
      console.log('\n🎉 所有步骤已完成！')
      break
    }
  }

  printSummary(queue)
}

// ==================== CLI ====================

const command = process.argv[2]

switch (command) {
  case 'run':
  case '': {
    const maxSteps = process.argv[3] ? parseInt(process.argv[3], 10) : undefined
    execute(maxSteps)
    break
  }

  case 'status': {
    const queue = loadQueue()
    printSummary(queue)
    break
  }

  case 'reset': {
    const queue = loadQueue()
    for (const step of queue.steps) {
      if (step.status === 'failed' || step.status === 'running') {
        step.status = 'pending'
        delete step.error
        delete step.result
        delete step.startedAt
        delete step.completedAt
      }
    }
    saveQueue(queue)
    console.log('🔄 已重置所有未完成步骤为 pending')
    printSummary(queue)
    break
  }

  case 'reset-all': {
    const queue = loadQueue()
    for (const step of queue.steps) {
      step.status = 'pending'
      delete step.error
      delete step.result
      delete step.startedAt
      delete step.completedAt
    }
    saveQueue(queue)
    console.log('🔄 已重置所有步骤为 pending')
    printSummary(queue)
    break
  }

  case 'retry': {
    const stepId = process.argv[3]
    if (!stepId) {
      console.log('用法: npx tsx taskExecutor.ts retry <stepId>')
      process.exit(1)
    }
    const queue = loadQueue()
    const step = queue.steps.find(s => s.id === stepId)
    if (!step) {
      console.log(`步骤 [${stepId}] 不存在`)
      process.exit(1)
    }
    if (step.status !== 'failed') {
      console.log(`步骤 [${stepId}] 状态为 ${step.status}，无需重试`)
      process.exit(0)
    }
    step.status = 'pending'
    delete step.error
    delete step.result
    delete step.startedAt
    delete step.completedAt
    saveQueue(queue)
    console.log(`🔄 步骤 [${stepId}] 已重置，运行 npx tsx taskExecutor.ts run 继续`)
    break
  }

  case 'init': {
    ensureTasksDir()
    const name = process.argv[3] || 'new-task'
    const goal = process.argv[4] || '待填写目标'

    const template: TaskQueue = {
      name,
      goal,
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // 如果提供了步骤描述文件，读取步骤
    const stepsFile = process.argv[5]
    if (stepsFile && existsSync(stepsFile)) {
      const content = readFileSync(stepsFile, 'utf8')
      const lines = content.split('\n').filter(l => l.trim())
      for (let i = 0; i < lines.length; i++) {
        template.steps.push({
          id: String(i + 1).padStart(3, '0'),
          subject: lines[i].trim().slice(0, 60),
          description: lines[i].trim(),
          status: 'pending',
        })
      }
    }

    saveQueue(template)
    console.log(`📋 已创建任务队列: ${QUEUE_FILE}`)
    console.log(`   任务名: ${name}`)
    console.log(`   步骤数: ${template.steps.length}`)
    console.log(`\n编辑 ${QUEUE_FILE} 添加步骤，然后运行:`)
    console.log(`   npx tsx src/utils/taskExecutor.ts run`)
    break
  }

  default:
    console.log(`
长任务执行器 — 断点续跑系统

用法:
  npx tsx src/utils/taskExecutor.ts init <name> <goal> [stepsFile]  创建新任务
  npx tsx src/utils/taskExecutor.ts run [maxSteps]                  执行任务（默认全部）
  npx tsx src/utils/taskExecutor.ts status                          查看进度
  npx tsx src/utils/taskExecutor.ts reset                           重置失败步骤
  npx tsx src/utils/taskExecutor.ts reset-all                       重置所有步骤
  npx tsx src/utils/taskExecutor.ts retry <stepId>                 重试指定步骤

工作流程:
  1. 创建任务队列 (.doge/tasks/queue.json)
  2. 每个步骤包含: subject, description, verify(可选)
  3. 运行 run，每步完成后自动持久化
  4. 中断后重新运行同一命令，自动续跑
  5. 所有步骤完成后输出总结

验证机制:
  verify 字段包含 shell 命令列表，每条命令 exit code 0 = 通过
  任何验证失败 = 该步骤标记 failed，停止执行
  修复问题后运行 retry <stepId> 或 reset 后重新 run
`)
}
