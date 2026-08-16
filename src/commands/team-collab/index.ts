/**
 * src/commands/team-collab/index.ts
 *
 * 多角色协作命令 — 使用 Orchestrator 驱动 PM/Architect/Engineer/QA/Researcher 协作
 *
 * 用法：
 *   /team-collab <任务描述>        — pipeline 模式（默认）
 *   /team-collab discuss <任务>    — 讨论模式
 *   /team-collab parallel <任务>   — 并行模式
 */

import type { Command } from '../../commands.js'
import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'

// ---------------------------------------------------------------------------
// LLM 调用封装（复用项目已有 AI 基础设施）
// ---------------------------------------------------------------------------

interface CallAIOptions {
  apiKey: string
  baseURL: string
  model: string
  apiTimeout: number
}

async function callAI(
  systemPrompt: string,
  userPrompt: string,
  opts: CallAIOptions,
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), opts.apiTimeout)

  try {
    const response = await fetch(opts.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 8000,
        stream: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API ${response.status}: ${errorText.slice(0, 200)}`)
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }

    if (data.error) {
      throw new Error(`API 错误: ${data.error.message || 'unknown'}`)
    }

    return data.choices?.[0]?.message?.content || ''
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

// ---------------------------------------------------------------------------
// resolveLLMConfig
// ---------------------------------------------------------------------------

function resolveLLMConfig(): CallAIOptions {
  const apiKey = process.env.DOGE_API_KEY || process.env.ANTHROPIC_API_KEY || ''
  const baseURL =
    process.env.ANTHROPIC_BASE_URL || 'https://api.longcat.chat/openai/v1/chat/completions'
  const model = process.env.ANTHROPIC_MODEL || process.env.DOGE_MODEL || 'step-3.7-flash'
  const apiTimeout = Number(process.env.DOGE_API_TIMEOUT || 60000)

  return { apiKey, baseURL, model, apiTimeout }
}

// ---------------------------------------------------------------------------
// 动态导入 Orchestrator
// ---------------------------------------------------------------------------

async function getOrchestrator() {
  const mod = await import('../../engine/orchestrator/index.js')
  return mod
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

const call: LocalCommandCall = async (args, _context): Promise<LocalCommandResult> => {
  const trimmed = args.trim()
  if (!trimmed) {
    return {
      type: 'text',
      value: `## 多角色协作编排器 (/team-collab)

用法：
  /team-collab <任务描述>        pipeline 模式（严格顺序流水线）
  /team-collab discuss <任务>    讨论模式（多角色自由对话）
  /team-collab parallel <任务>   并行模式（调研扇出）

示例：
  /team-collab 实现用户认证模块
  /team-collab discuss 重构支付流程
  /team-collab parallel 分析代码库安全漏洞

模式说明：
- pipeline: PM → Architect → TeamLeader → Engineer → QA → TeamLeader（严格顺序）
- discuss: 角色间自由讨论，直到达成共识或达到最大轮数
- parallel: 调研阶段并行扇出，后续串行执行`,
    }
  }

  // 解析模式
  let mode: 'pipeline' | 'parallel' | 'discuss' = 'pipeline'
  let taskDescription = trimmed

  if (trimmed.startsWith('discuss ')) {
    mode = 'discuss'
    taskDescription = trimmed.slice(8).trim()
  } else if (trimmed.startsWith('parallel ')) {
    mode = 'parallel'
    taskDescription = trimmed.slice(9).trim()
  } else if (trimmed.startsWith('pipeline ')) {
    mode = 'pipeline'
    taskDescription = trimmed.slice(9).trim()
  }

  if (!taskDescription) {
    return { type: 'text', value: '❌ 请提供任务描述。' }
  }

  // 检查 API 密钥
  const llm = resolveLLMConfig()
  if (!llm.apiKey) {
    return {
      type: 'text',
      value: '❌ 需要配置 API 密钥。\n请设置 DOGE_API_KEY 或 ANTHROPIC_API_KEY 环境变量。',
    }
  }

  try {
    const { Orchestrator } = await getOrchestrator()

    // 创建编排器
    const orchestrator = new Orchestrator(
      { mode, verbose: true },
      {
        executeLLM: async (role, systemPrompt, userPrompt, _context) => {
          return callAI(systemPrompt, userPrompt, llm)
        },
      },
    )

    // 执行
    const result = await orchestrator.run(taskDescription)

    // 格式化输出
    const lines = [
      `## 🏭 多角色协作${mode === 'discuss' ? '讨论' : mode === 'parallel' ? '并行' : '流水线'}执行结果`,
      '',
      `**任务**: ${taskDescription}`,
      `**模式**: ${mode}`,
      `**状态**: ${result.success ? '✅ 成功' : '❌ 失败'}`,
      `**最终阶段**: ${result.finalStage}`,
      `**质量评分**: ${result.qualityScore}/100`,
      `**总耗时**: ${(result.totalDuration / 1000).toFixed(1)}s`,
      `**总迭代**: ${result.totalIterations}`,
      '',
    ]

    if (result.artifacts.length > 0) {
      lines.push('### 产出文件')
      for (const artifact of result.artifacts) {
        lines.push(`- ${artifact}`)
      }
      lines.push('')
    }

    lines.push('### 执行详情')
    for (const r of result.roleResults) {
      const icon = r.success ? '✅' : '❌'
      lines.push(`- ${icon} **${r.role}** (${r.stage}) — ${r.iterations} iterations, ${(r.duration / 1000).toFixed(1)}s`)
      if (r.error) lines.push(`  - 错误: ${r.error}`)
      if (r.artifacts && r.artifacts.length > 0) {
        lines.push(`  - 产出: ${r.artifacts.join(', ')}`)
      }
    }

    lines.push('', '---', '', result.summary, '', '### 合并输出', '', result.mergedOutput.slice(0, 3000))

    return { type: 'text', value: lines.join('\n') }
  } catch (error) {
    return {
      type: 'text',
      value: `❌ 协作编排失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

const teamCollab = {
  type: 'local',
  name: 'team-collab',
  description: '多角色协作编排：PM/Architect/Engineer/QA/Researcher 全流程',
  load: () => Promise.resolve({ call }),
} satisfies Command

export default teamCollab
