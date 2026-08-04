/**
 * /loop — 目标导向循环引擎（JSX 版本）
 *
 * 接入真实 AI 执行基础设施：
 * 1. 通过 toolContext 获取 QueryEngine 和 AgentTool
 * 2. 每个子任务通过 QueryEngine.query() 执行
 * 3. 策略提供分解/评估/路由，QueryEngine 提供执行能力
 */

import * as React from 'react'
import { Box, Text, useInput, useAppState } from '../../ink.js'
import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall, LocalJSXCommandContext } from '../../types/command.js'
import type { LoopGoal, LoopStrategyName, SubTask } from './types.js'
import { getStrategy, getStrategyInfo, getAvailableStrategies } from './strategies/index.js'
import { isValidStrategy } from './engine.js'
import type { TaskExecutor } from './types.js'
import { execSync } from 'child_process'
import { mkdir, writeFile } from 'fs/promises'
import { formatStatusLine, formatFinalReport, formatSubTaskSummary, type ProgressState } from './progress-ui.js'
import { parseLoopArgs } from './shortcuts.js'

type ParsedLoopArgs = ReturnType<typeof parseLoopArgs>

// ============================================================================
// 帮助 / 示例 / 交互提示 渲染
// ============================================================================

function renderHelp(): string {
  return `# /loop — 目标导向循环引擎

给 AI 一个目标，循环执行直到达成。

## 用法
  /loop "目标描述" [选项]

## 选项
  --strategy <策略>        循环策略: langgraph / crew / autogpt / openhands / swe-agent（默认 openhands）
  --max-iterations <N>     最大迭代次数（默认 20）
  --criteria <标准>        成功标准（可多次指定）
  --json                   JSON 格式输出
  --help                   显示本帮助
  --examples               显示详细示例

## 示例
  /loop "创建一个 Node.js Hello World 服务器"
  /loop "重构 utils 目录" --strategy langgraph --max-iterations 30
  /loop "写完 README 并运行测试" --criteria "测试全部通过"

## 快捷命令
  /loop-langgraph, /loop-crew, /loop-autogpt, /loop-openhands, /loop-swe
  分别使用对应策略执行，支持 --help 查看该策略的详细手册`
}

function renderExamples(): string {
  return `# /loop — 使用示例

## 示例 1: 简单目标
  /loop "创建一个 Node.js Hello World HTTP 服务器，监听 3000 端口"
  → 使用默认 openhands 策略，最多 20 轮迭代

## 示例 2: 指定策略和迭代上限
  /loop "重构 utils 目录中的重复代码" --strategy langgraph --max-iterations 30
  → 使用 langgraph（状态机图）策略，最多 30 轮

## 示例 3: 设置成功标准
  /loop "为项目添加单元测试" --criteria "覆盖率超过 80%" --criteria "测试全部通过"
  → 多个 --criteria 都会作为成功判断标准

## 示例 4: JSON 输出
  /loop "扫描代码中的安全问题" --json
  → 以 JSON 格式输出完整结果

## 示例 5: 快捷策略命令
  /loop-autogpt "实现一个 CLI 待办应用" --help
  → /loop-autogpt 使用 autogpt 策略；--help 显示该策略的完整手册

## 可用策略
  - langgraph  : 状态机图引擎，适合有明确状态流转的任务
  - crew       : 多角色协作，适合需要分工的任务
  - autogpt    : 自主规划，适合探索性任务
  - openhands  : 默认策略，通用目标执行
  - swe-agent  : 软件工程代理，适合代码库级任务`
}

function renderInteractivePrompt(): string {
  return `# /loop — 目标导向循环引擎

给 AI 一个目标，循环执行直到达成。

请输入你的目标，例如：
  /loop 创建一个 Node.js Hello World 服务器
  /loop 重构 utils 目录 --strategy langgraph
  /loop "写完 README 并运行测试" --criteria "测试全部通过"

查看帮助: /loop --help
查看示例: /loop --examples`
}
async function createTaskExecutor(
  context: LocalJSXCommandContext,
): Promise<TaskExecutor> {
  const apiKey = process.env.DOGE_API_KEY || process.env.ANTHROPIC_API_KEY || ''
  const baseURL = process.env.ANTHROPIC_BASE_URL || 'https://api.longcat.chat/openai/v1/chat/completions'
  const model = context.options.mainLoopModel || process.env.ANTHROPIC_MODEL || 'LongCat-2.0'

  return async (prompt: string, systemPrompt: string, task: SubTask) => {
    const outputLines: string[] = []
    const createdFiles: string[] = []
    let commandsExecuted = 0

    try {
      const fullPrompt = `你是一个专业的工程师。请完成以下任务，必须执行真实的 bash 命令来创建文件。

## 任务
${task.description}

## 执行指南
${prompt}

## 关键要求（必须遵守）
1. 所有产出必须写入文件！不要只输出文本描述！
2. 用 bash 命令创建文件：
   - 简单文件：echo "内容" > 路径
   - 多行文件：cat << 'EOF' > 路径
内容
EOF
3. 配置文件（YAML/JSON/JS 等）必须写入对应路径
4. 每个步骤都要用 bash 命令创建，用代码块包裹
5. 如果命令失败，分析原因并重试
6. 最后列出所有创建的文件

## 期望输出格式
\`\`\`bash
mkdir -p 目录
echo '内容' > 文件路径
\`\`\`

现在开始执行:`

      outputLines.push(`🤖 [AI] 调用 API (model: ${model})`)

      const response = await fetch(baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '你是一个工程师。请执行真实的 bash 命令来创建文件。' },
            { role: 'user', content: fullPrompt },
          ],
          max_tokens: 4000,
          stream: false,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, output: outputLines.join('\n'), error: `API HTTP ${response.status}: ${errorText.slice(0, 200)}` }
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
        error?: { message?: string }
      }

      if (data.error) {
        return { success: false, output: outputLines.join('\n'), error: `API 错误: ${data.error.message || 'unknown'}` }
      }

      // Save raw API response for debugging
      try {
        await writeFile(`loop-api-response-${task.id}.json`, JSON.stringify(data, null, 2), 'utf-8')
      } catch { /* ignore */ }

      const aiOutput = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || ''
      outputLines.push(`🤖 [AI] 返回 (${aiOutput.length} 字符)`)

      // Parse bash commands
      const bashBlocks = aiOutput.match(/```(?:bash|sh|shell|yaml|json|yml)?\s*([\s\S]*?)```/g) || []
      let commands: string[] = []
      for (const block of bashBlocks) {
        const content = block.replace(/```(?:bash|sh|shell|yaml|json|yml)?\s*/, '').replace(/```\s*$/, '').trim()
        if (content.includes('<<')) {
          commands.push(content)
        } else {
          for (const line of content.split('\n')) {
            const trimmed = line.trim()
            if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
              commands.push(trimmed)
            }
          }
        }
      }

      // If no bash commands found, make a second AI call to convert
      if (commands.length === 0 && aiOutput.length > 0) {
        outputLines.push(`⚠️  无 bash 命令，进行第二次 AI 转换...`)
        const conversionPrompt = `请将下面的计划转换为可执行的 bash 命令：\n\n---\n\n${aiOutput}\n\n---\n\n要求：只输出 bash 命令，用代码块包裹。\n\n输出格式：\n\`\`\`bash\nmkdir -p 目录\necho '内容' > 文件路径\n\`\`\``
        try {
          const secondResponse = await fetch(baseURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: [{ role: 'system', content: 'bash 专家' }, { role: 'user', content: conversionPrompt }], max_tokens: 4000, stream: false }),
          })
          if (secondResponse.ok) {
            const secondData = await secondResponse.json() as { choices?: Array<{ message?: { content?: string } }> }
            const secondOutput = secondData.choices?.[0]?.message?.content || ''
            const secondBlocks = secondOutput.match(/```(?:bash|sh|shell|yaml|json|yml)?\s*([\s\S]*?)```/g) || []
            for (const block of secondBlocks) {
              const c = block.replace(/```(?:bash|sh|shell|yaml|json|yml)?\s*/, '').replace(/```\s*$/, '').trim()
              if (c.includes('<<')) { commands.push(c) }
              else { for (const line of c.split('\n')) { const t = line.trim(); if (t && !t.startsWith('#') && !t.startsWith('//')) commands.push(t) } }
            }
            outputLines.push(`🤖 [AI] 第二次调用 (${secondOutput.length} 字符, ${commands.length} 个命令)`)
          }
        } catch (secondErr) {
          outputLines.push(`✗ 第二次调用失败`)
        }
      }

      // Execute bash commands
      if (commands.length > 0) {
        outputLines.push(`⚡ [执行] ${commands.length} 个命令:`)
        for (const cmd of commands) {
          outputLines.push(`  > ${cmd.slice(0, 100)}${cmd.length > 100 ? '...' : ''}`)
          try {
            const isWin = process.platform === 'win32'
            const shellPath = isWin ? 'C:\\Program Files\\Git\\bin\\bash.exe' : null
            const result = execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8', timeout: 60000, shell: shellPath, stdio: ['pipe', 'pipe', 'pipe'] })
            outputLines.push(`    ✓ (${result.length} 字符)`)
            commandsExecuted++
            const fileMatch = cmd.match(/>\s*([^\s&|]+)/g)
            if (fileMatch) { for (const m of fileMatch) { const fp = m.replace(/^>\s*/, '').trim(); if (fp && !fp.startsWith('/dev/')) createdFiles.push(fp) } }
          } catch (execErr: unknown) {
            const err = execErr as { stdout?: string; stderr?: string; status?: number }
            outputLines.push(`    ✗ (${err.status ?? '?'})`)
          }
        }
      } else if (aiOutput.length > 0) {
        outputLines.push(`⚠️  无 bash 命令，写入报告文件`)
        try {
          const reportPath = `loop-report-${task.id}.md`
          await writeFile(reportPath, `# ${task.description}

${aiOutput}`, 'utf-8')
          createdFiles.push(reportPath)
          outputLines.push(`  📄 ${reportPath}`)
        } catch (writeErr) {
          outputLines.push(`  ✗ 写入失败`)
        }
      } else {
        outputLines.push(`❌ AI 返回为空`)
        return { success: false, output: outputLines.join('\n'), error: 'AI 返回了空内容' }
      }

      const uniqueFiles = [...new Set(createdFiles)]
      if (uniqueFiles.length > 0) {
        outputLines.push(`
📁 创建了 ${uniqueFiles.length} 个文件:`)
        for (const f of uniqueFiles) { outputLines.push(`   • ${f}`) }
      }

      return { success: true, output: outputLines.join('\n').slice(0, 8000) }
    } catch (error) {
      outputLines.push(`💥 [异常] ${error instanceof Error ? error.message : String(error)}`)
      return { success: false, output: outputLines.join('\n'), error: error instanceof Error ? error.message : String(error) }
    }
  }
}

// ============================================================================
// 主命令实现
// ============================================================================

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const s = (args ?? '').trim()

  if (!s) {
    onDone(renderInteractivePrompt())
    return
  }

  let parsed: ParsedLoopArgs
  try {
    parsed = parseLoopArgs(s)
  } catch (err) {
    onDone(`❌ 参数错误: ${err instanceof Error ? err.message : String(err)}

用 /loop --help 查看帮助`)
    return
  }

  if (parsed.help) {
    onDone(renderHelp())
    return
  }

  if (parsed.examples) {
    onDone(renderExamples())
    return
  }

  if (!parsed.goal) {
    onDone(renderInteractivePrompt())
    return
  }

  try {
    const strategy = getStrategy(parsed.strategy)
    const goal: LoopGoal = {
      description: parsed.goal,
      successCriteria: parsed.criteria.length > 0 ? parsed.criteria : undefined,
      maxIterations: parsed.maxIterations,
    }

    const taskExecutor = await createTaskExecutor(context)

    const { executeLoop } = await import('./engine.js')

    const startTime = Date.now()
    let fileCount = 0
    const createdFiles: string[] = []
    const progressState: ProgressState = {
      strategy: parsed.strategy,
      currentIteration: 0,
      maxIterations: parsed.maxIterations,
      currentTask: '',
      fileCount: 0,
      startTime,
      phase: 'idle',
    }

    const result = await executeLoop({
      strategy: parsed.strategy,
      goal,
      taskExecutor,
      onProgress: (event: { type: string; [k: string]: unknown }) => {
        switch (event.type) {
          case 'loop_start':
            progressState.phase = 'planning'
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
          case 'iteration_start':
            progressState.phase = 'executing'
            progressState.currentIteration = event.iteration as number
            progressState.maxIterations = event.maxIterations as number
            progressState.fileCount = fileCount
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
          case 'task_start':
            progressState.currentTask = (event.description as string) ?? ''
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
          case 'task_end': {
            const fileMatches = (event.output as string ?? '').match(/📄\s*(.+?)(?:\s|$)/g)
            if (fileMatches) {
              fileCount += fileMatches.length
              for (const m of fileMatches) { createdFiles.push(m.replace('📄 ', '').trim()) }
              progressState.fileCount = fileCount
            }
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
          }
          case 'task_failed':
            progressState.phase = 'error'
            progressState.currentTask = `失败: ${event.error?.toString().slice(0, 30)}`
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
          case 'evaluation':
            if (event.achieved) {
              progressState.phase = 'verifying'
              onDone(formatStatusLine(progressState), { display: 'system' })
            }
            break
          case 'loop_end':
            progressState.phase = 'done'
            progressState.fileCount = fileCount
            onDone(formatStatusLine(progressState), { display: 'user' })
            break
          case 'error':
            progressState.phase = 'error'
            onDone(formatStatusLine(progressState), { display: 'system' })
            break
        }
      },
    })

    if (parsed.json) {
      onDone(JSON.stringify(result, null, 2))
      return
    }

    const lines: string[] = [
      formatFinalReport(
        { ...progressState, phase: result.success ? 'done' : 'error', fileCount },
        result.success,
        result.reason,
        createdFiles,
      ),
      formatSubTaskSummary(result.subTasks),
    ]

    if (createdFiles.length > 0) {
      const uniqueFiles = [...new Set(createdFiles)]
      lines.push('')
      lines.push(`📁 创建了 ${uniqueFiles.length} 个文件:`)
      for (const f of uniqueFiles.slice(0, 20)) { lines.push(`   • ${f}`) }
      if (uniqueFiles.length > 20) { lines.push(`   ... 还有 ${uniqueFiles.length - 20} 个文件`) }
    }

    lines.push('')
    lines.push('子任务:')
    result.subTasks.forEach((t, i) => {
      const icon = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : '⏳'
      const resultLen = t.result?.length ?? 0
      lines.push(`  ${i + 1}. ${icon} ${t.description}${resultLen > 0 ? ` (${resultLen}字符)` : ''}`)
    })

    onDone(lines.join('\n'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    onDone(`❌ 循环执行失败: ${message}`)
  }
}

const loopCommand: Command = {
  type: 'local-jsx',
  name: 'loop',
  description: '目标导向循环引擎 — 给 AI 个目标，循环直到达成',
  aliases: ['/loop', '/循环'],
  arguments: [
    { name: 'goal', description: '目标描述', required: false },
    { name: '--strategy', description: '循环策略: langgraph / crew / autogpt / openhands / swe-agent', required: false },
    { name: '--max-iterations', description: '最大迭代次数（默认 20）', required: false },
    { name: '--criteria', description: '成功标准（可多次指定）', required: false },
    { name: '--json', description: 'JSON 格式输出', required: false },
    { name: '--examples', description: '显示详细示例', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default loopCommand
