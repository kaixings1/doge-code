/**
 * agentOrchestrator.ts — 多 Agent 并行编排引擎
 *
 * 让多个"角色 Agent"以不同系统提示词/模型并行处理同一任务，
 * 再聚合结果——从"单助手"升级为"Agent 军团"。
 * - fan-out：每个角色独立调用模型 API（可指定不同 model）
 * - 进度推送：通过 BrowserWindow 推送实时进度事件
 * - 取消：编排中可取消，消费流即停
 * - 超时保护：单个 Agent 超时标记 failed，不阻塞其他
 */

import { BrowserWindow } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createDesktopApiClient, type DesktopApiConfig } from './apiClient.js'
import type { APIRequest } from '../engine/requestBuilder.js'

// ─── 类型 ───

export interface AgentRole {
  id: string
  name: string
  description?: string
  systemPrompt: string
  model?: string // 覆盖默认模型
}

export interface AgentOutput {
  roleId: string
  name: string
  content: string
  durationMs: number
  status: 'completed' | 'failed' | 'cancelled' | 'timeout'
  error?: string
  inputTokens: number
  outputTokens: number
}

export interface OrchestrateParams {
  task: string
  roles: AgentRole[]
  defaultModel: string
  maxTokens?: number
  timeoutMs?: number // 单个 Agent 超时（默认 120s）
  mode?: 'parallel' | 'discuss' // parallel=独立并行；discuss=多轮讨论（发散→迭代交叉评审）
  maxRounds?: number // discuss 模式最大讨论轮数（默认 3，含第一轮）
}

export interface OrchestrationProgress {
  orchestrationId: string
  completedCount: number
  totalCount: number
  runningRoles: string[]
  status: 'running' | 'completed' | 'cancelled'
}

export interface OrchestrationResult {
  orchestrationId: string
  task: string
  status: 'completed' | 'cancelled'
  outputs: AgentOutput[]
  round1Outputs?: AgentOutput[] // 兼容旧字段：第一轮（发散）输出
  rounds?: AgentOutput[][] // 每轮完整输出（含第一轮），最后一轮与 outputs 相同
  mode?: 'parallel' | 'discuss'
  roundsUsed?: number // discuss 实际进行的轮数
  startedAt: number
  finishedAt: number
  durationMs: number
  successCount: number
  failedCount: number
}

// ─── 内置角色模板 ───

export const DEFAULT_AGENT_ROLES: AgentRole[] = [
  {
    id: 'architect',
    name: '架构师',
    description: '从整体架构角度分析，设计模块划分与数据流',
    systemPrompt: '你是一位资深软件架构师。请从架构层面分析任务：模块划分、数据流、接口设计、扩展性、风险点。输出结构化的架构分析，控制在 400 字以内。',
  },
  {
    id: 'reviewer',
    name: '审查员',
    description: '以批判视角审查方案，找出缺陷与遗漏',
    systemPrompt: '你是一位严格的代码审查专家。请批判性地分析任务：找出潜在 bug、边界条件遗漏、安全风险、性能问题。直接指出问题，不要客套。控制在 400 字以内。',
  },
  {
    id: 'implementer',
    name: '实施者',
    description: '给出具体可落地的实施步骤',
    systemPrompt: '你是一位实战派工程师。请给出任务的具体实施方案：步骤、关键代码思路、验证方式。要具体可执行，避免空话。控制在 400 字以内。',
  },
  {
    id: 'security',
    name: '安全审计员',
    description: '以安全视角审查，找出漏洞与风险',
    systemPrompt: '你是一位应用安全专家。请从安全角度审查任务内容：找出注入、越权、敏感信息泄露、不安全依赖等风险，并给出修复建议。只报告真实风险，不夸大。控制在 400 字以内。',
  },
  {
    id: 'tester',
    name: '测试设计员',
    description: '设计覆盖边界与异常场景的测试方案',
    systemPrompt: '你是一位测试工程师。请为任务内容设计测试方案：核心用例、边界条件、异常场景、回归风险点。给出可执行的具体测试思路。控制在 400 字以内。',
  },
  {
    id: 'perf',
    name: '性能优化员',
    description: '找出性能瓶颈并给出优化方案',
    systemPrompt: '你是一位性能工程师。请从性能角度审查：算法复杂度、IO 瓶颈、内存使用、并发问题。给出可度量的优化建议和预期收益。控制在 400 字以内。',
  },
  {
    id: 'doc',
    name: '文档编写员',
    description: '将方案整理为清晰的文档',
    systemPrompt: '你是一位技术文档作者。请将任务相关的结论整理为结构化、易读的文档：概述、要点、示例、注意事项。语言简洁准确。控制在 400 字以内。',
  },
]

// ─── 自定义角色加载（Agent 市场） ───

/**
 * 从 .doge/agents/ 目录加载自定义 Agent 角色（JSON 文件）。
 * 文件格式：
 * {
 *   "id": "mydoc",
 *   "name": "我的文档员",
 *   "description": "…",
 *   "systemPrompt": "…",
 *   "model": "可选模型覆盖"
 * }
 * 同 id 的自定义角色覆盖内置角色。
 */
export function loadCustomAgentRoles(projectRoot: string): AgentRole[] {
  const agentsDir = path.join(projectRoot, '.doge', 'agents')
  if (!fs.existsSync(agentsDir)) return []

  const custom: AgentRole[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(agentsDir, { withFileTypes: true })
  } catch { return [] }

  for (const entry of entries) {
    if (!entry.isFile() || !(entry.name.endsWith('.json') || entry.name.endsWith('.jsonc'))) continue
    try {
      const raw = fs.readFileSync(path.join(agentsDir, entry.name), 'utf-8')
      const data = JSON.parse(raw) as Partial<AgentRole>
      if (!data.id || !data.name || !data.systemPrompt) continue
      custom.push({
        id: data.id,
        name: data.name,
        description: data.description || '',
        systemPrompt: data.systemPrompt,
        model: data.model,
      })
    } catch {
      console.warn(`[AGENT] 跳过无效角色文件: ${entry.name}`)
    }
  }
  return custom
}

/**
 * 获取全部可用角色：内置 + 自定义（自定义优先）
 */
export function loadAllRoles(projectRoot: string): AgentRole[] {
  const custom = loadCustomAgentRoles(projectRoot)
  const byId = new Map<string, AgentRole>()
  for (const r of DEFAULT_AGENT_ROLES) byId.set(r.id, r)
  for (const r of custom) byId.set(r.id, r) // 覆盖内置
  return Array.from(byId.values())
}

// ─── 编排引擎 ───

export class AgentOrchestrator {
  private active = new Map<string, { cancelled: boolean }>()
  private idCounter = 0

  /**
   * 并行编排：所有角色同时执行，返回聚合结果
   */
  async orchestrate(apiConfig: DesktopApiConfig, params: OrchestrateParams): Promise<OrchestrationResult> {
    const orchestrationId = `orch-${Date.now()}-${(this.idCounter++).toString(36)}`
    const flag = { cancelled: false }
    this.active.set(orchestrationId, flag)

    const startedAt = Date.now()
    const timeoutMs = params.timeoutMs || 120000
    const maxTokens = params.maxTokens || 4000

    const sendProgress = (progress: OrchestrationProgress): void => {
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('doge:agent-progress', progress)
      })
    }

    sendProgress({ orchestrationId, completedCount: 0, totalCount: params.roles.length, runningRoles: params.roles.map(r => r.name), status: 'running' })

    const mode = params.mode || 'parallel'

    const runRole = async (role: AgentRole, userPrompt: string, _phase: number): Promise<AgentOutput> => {
      const roleStart = Date.now()
      if (flag.cancelled) {
        return { roleId: role.id, name: role.name, content: '', durationMs: 0, status: 'cancelled', error: '已取消', inputTokens: 0, outputTokens: 0 }
      }

      try {
        const client = createDesktopApiClient(apiConfig)
        // 讨论模式第二轮：注入其他 Agent 的第一轮输出，让角色交叉评审
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [{ role: 'user', content: userPrompt }]
        const request: APIRequest = {
          model: role.model || params.defaultModel,
          system: role.systemPrompt,
          messages,
          max_tokens: maxTokens,
          tools: [],
        }

        let text = ''
        let inputTokens = 0
        let outputTokens = 0

        // 带超时的流式消费
        const consume = async (): Promise<void> => {
          const stream = await client.sendMessage(request)
          for await (const ev of stream) {
            if (flag.cancelled) break
            const e = ev as Record<string, unknown>
            if (e.type === 'content_block_delta') {
              const delta = (e.delta ?? {}) as Record<string, unknown>
              if (delta.type === 'text_delta' && typeof delta.text === 'string') {
                text += delta.text
              }
            } else if (e.type === 'message_start') {
              const msg = (e.message ?? {}) as Record<string, unknown>
              const usage = (msg.usage ?? {}) as Record<string, number>
              inputTokens = usage.input_tokens || 0
            } else if (e.type === 'message_delta') {
              const delta = (e.delta ?? {}) as Record<string, unknown>
              const usage = (delta.usage ?? {}) as Record<string, number>
              if (usage.output_tokens) outputTokens = usage.output_tokens
            }
          }
        }

        await Promise.race([
          consume(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Agent 超时 (${timeoutMs / 1000}s)`)), timeoutMs)),
        ])

        const durationMs = Date.now() - roleStart
        if (flag.cancelled) {
          return { roleId: role.id, name: role.name, content: text, durationMs, status: 'cancelled', error: '已取消', inputTokens, outputTokens }
        }
        return { roleId: role.id, name: role.name, content: text, durationMs, status: 'completed', inputTokens, outputTokens }
      } catch (e) {
        const durationMs = Date.now() - roleStart
        const isTimeout = e instanceof Error && e.message.includes('超时')
        return {
          roleId: role.id, name: role.name, content: '', durationMs,
          status: isTimeout ? 'timeout' : 'failed',
          error: e instanceof Error ? e.message : String(e),
          inputTokens: 0, outputTokens: 0,
        }
      }
    }

    const maxRounds = params.maxRounds || 3
    let resultExtra: { rounds?: AgentOutput[][]; roundsUsed?: number } = {}

    // 第一轮：fan-out 并行独立分析
    const firstRound = await Promise.all(params.roles.map(r => runRole(r, params.task, 1)))

    let outputs = firstRound
    let roundsUsed = 1

    if (mode === 'discuss') {
      const allRounds: AgentOutput[][] = [firstRound]
      let prev = firstRound
      const summaryOf = (round: AgentOutput[]): string =>
        round
          .filter(o => o.status === 'completed' && o.content.trim())
          .map(o => `## ${o.name}（${o.roleId}）的观点\n${o.content.trim()}`)
          .join('\n\n---\n\n')

      // 第 2..maxRounds 轮：交叉评审 + 收敛检测
      for (let round = 2; round <= maxRounds; round++) {
        if (flag.cancelled) break
        sendProgress({
          orchestrationId, completedCount: allRounds.length, totalCount: params.roles.length,
          runningRoles: [`(第 ${round} 轮交叉评审)`], status: 'running',
        })
        const summary = summaryOf(prev)
        const reviewPrompt = `这是第 ${round} 轮讨论。以下是上一轮所有 Agent 的观点。请仔细阅读，指出你认为有缺陷、遗漏或分歧的地方；如果你上一轮的结论正确且无新异议，请直接输出「无新意见，维持上轮观点」并简述理由。然后给出你这一轮的最终结论。\n\n${summary || '(上一轮无有效输出)'}`
        const thisRound = await Promise.all(params.roles.map(r => runRole(r, reviewPrompt, round)))
        allRounds.push(thisRound)

        // 收敛检测：所有角色连续两轮输出完全一致 → 提前停止
        const unchanged = thisRound.every((cur, i) => {
          const prevOut = prev[i]
          return cur.status === 'completed' && prevOut.status === 'completed' && cur.content === prevOut.content
        })
        if (unchanged) {
          roundsUsed = round
          break
        }
        roundsUsed = round
        prev = thisRound
      }

      outputs = allRounds[allRounds.length - 1]
      resultExtra = { rounds: allRounds, roundsUsed }
    }

    const finishedAt = Date.now()
    this.active.delete(orchestrationId)

    const finalStatus = flag.cancelled ? 'cancelled' as const : 'completed' as const
    const result: OrchestrationResult = {
      orchestrationId,
      task: params.task,
      status: finalStatus,
      outputs,
      mode,
      rounds: resultExtra.rounds,
      roundsUsed: resultExtra.roundsUsed,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      successCount: outputs.filter(o => o.status === 'completed').length,
      failedCount: outputs.filter(o => o.status !== 'completed').length,
    }
    if (mode === 'discuss') {
      result.round1Outputs = resultExtra.rounds ? resultExtra.rounds[0] : firstRound
    }

    sendProgress({
      orchestrationId,
      completedCount: outputs.length,
      totalCount: params.roles.length,
      runningRoles: [],
      status: finalStatus,
    })

    return result
  }

  cancel(orchestrationId: string): boolean {
    const flag = this.active.get(orchestrationId)
    if (!flag) return false
    flag.cancelled = true
    return true
  }

  hasActive(): boolean {
    return this.active.size > 0
  }
}

export function createAgentOrchestrator(): AgentOrchestrator {
  return new AgentOrchestrator()
}
