import { execFileSync } from 'child_process'
import { diffLines } from 'diff'
import { constants as fsConstants } from 'fs'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { extname, join } from 'path'
import type { Command } from '../commands.js'
import { queryWithModel } from '../services/api/claude.js'
import {
  AGENT_TOOL_NAME,
  LEGACY_AGENT_TOOL_NAME,
} from '../tools/AgentTool/constants.js'
import type { LogOption } from '../types/logs.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { toError } from '../utils/errors.js'
import { execFileNoThrow } from '../utils/execFileNoThrow.js'
import { logError } from '../utils/log.js'
import { extractTextContent } from '../utils/messages.js'
import { getDefaultOpusModel } from '../utils/model/model.js'
import {
  getProjectsDir,
  getSessionFilesWithMtime,
  getSessionIdFromLog,
  loadAllLogsFromSessionFile,
} from '../utils/sessionStorage.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'
import { countCharInString } from '../utils/stringUtils.js'
import { asSystemPrompt } from '../utils/systemPromptType.js'
import { escapeXmlAttr as escapeHtml } from '../utils/xml.js'

// 用于特征提取和摘要的模型（Opus - 最佳质量）
function getAnalysisModel(): string {
  return getDefaultOpusModel()
}

// 用于叙述性洞察的模型（Opus - 最佳质量）
function getInsightsModel(): string {
  return getDefaultOpusModel()
}

// ============================================================================
// 远程工作空间数据收集
// ============================================================================

type RemoteHostInfo = {
  name: string
  sessionCount: number
}

/* eslint-disable custom-rules/no-process-env-top-level */
const getRunningRemoteHosts: () => Promise<string[]> =
  process.env.USER_TYPE === 'ant'
    ? async () => {
        const { stdout, code } = await execFileNoThrow(
          'coder',
          ['list', '-o', 'json'],
          { timeout: 60000 },
        )
        if (code !== 0) return []
        try {
          const workspaces = jsonParse(stdout) as Array<{
            name: string
            latest_build?: { status?: string }
          }>
          return workspaces
            .filter(w => w.latest_build?.status === 'running')
            .map(w => w.name)
        } catch {
          return []
        }
      }
    : async () => []

const getRemoteHostSessionCount: (hs: string) => Promise<number> =
  process.env.USER_TYPE === 'ant'
    ? async (homespace: string) => {
        const { stdout, code } = await execFileNoThrow(
          'ssh',
          [
            `${homespace}.coder`,
            'find /root/.claude/projects -name "*.jsonl" 2>/dev/null | wc -l',
          ],
          { timeout: 60000 },
        )
        if (code !== 0) return 0
        return parseInt(stdout.trim(), 10) || 0
      }
    : async () => 0

const collectFromRemoteHost: (
  hs: string,
  destDir: string,
) => Promise<{ copied: number; skipped: number }> =
  process.env.USER_TYPE === 'ant'
    ? async (homespace: string, destDir: string) => {
        const result = { copied: 0, skipped: 0 }

        // 创建临时目录
        const tempDir = await mkdtemp(join(tmpdir(), 'claude-hs-'))

        try {
          // 通过 SCP 复制 projects 文件夹
          const scpResult = await execFileNoThrow(
            'scp',
            ['-rq', `${homespace}.coder:/root/.claude/projects/`, tempDir],
            { timeout: 600000 },
          )
          if (scpResult.code !== 0) {
            // SCP 失败
            return result
          }

          const projectsDir = join(tempDir, 'projects')
          let projectDirents: Awaited<ReturnType<typeof readdir>>
          try {
            projectDirents = await readdir(projectsDir, { withFileTypes: true })
          } catch {
            return result
          }

          // 合并到目标目录（按项目目录并行处理）
          await Promise.all(
            projectDirents.map(async dirent => {
              const projectName = dirent.name
              const projectPath = join(projectsDir, projectName)

              // 跳过非目录项
              if (!dirent.isDirectory()) return

              const destProjectName = `${projectName}__${homespace}`
              const destProjectPath = join(destDir, destProjectName)

              try {
                await mkdir(destProjectPath, { recursive: true })
              } catch {
                // 目录可能已存在
              }

              // 复制会话文件（跳过已存在的）
              let files: Awaited<ReturnType<typeof readdir>>
              try {
                files = await readdir(projectPath, { withFileTypes: true })
              } catch {
                return
              }
              await Promise.all(
                files.map(async fileDirent => {
                  const fileName = fileDirent.name
                  if (!fileName.endsWith('.jsonl')) return

                  const srcFile = join(projectPath, fileName)
                  const destFile = join(destProjectPath, fileName)

                  try {
                    await copyFile(srcFile, destFile, fsConstants.COPYFILE_EXCL)
                    result.copied++
                  } catch {
                    // COPYFILE_EXCL 的 EEXIST 错误表示目标已存在
                    result.skipped++
                  }
                }),
              )
            }),
          )
        } finally {
          try {
            await rm(tempDir, { recursive: true, force: true })
          } catch {
            // 忽略清理错误
          }
        }

        return result
      }
    : async () => ({ copied: 0, skipped: 0 })

const collectAllRemoteHostData: (destDir: string) => Promise<{
  hosts: RemoteHostInfo[]
  totalCopied: number
  totalSkipped: number
}> =
  process.env.USER_TYPE === 'ant'
    ? async (destDir: string) => {
        const rHosts = await getRunningRemoteHosts()
        const result: RemoteHostInfo[] = []
        let totalCopied = 0
        let totalSkipped = 0

        // 从所有主机并行收集（每台主机的 SCP 可能需要数秒）
        const hostResults = await Promise.all(
          rHosts.map(async hs => {
            const sessionCount = await getRemoteHostSessionCount(hs)
            if (sessionCount > 0) {
              const { copied, skipped } = await collectFromRemoteHost(
                hs,
                destDir,
              )
              return { name: hs, sessionCount, copied, skipped }
            }
            return { name: hs, sessionCount, copied: 0, skipped: 0 }
          }),
        )

        for (const hr of hostResults) {
          result.push({ name: hr.name, sessionCount: hr.sessionCount })
          totalCopied += hr.copied
          totalSkipped += hr.skipped
        }

        return { hosts: result, totalCopied, totalSkipped }
      }
    : async () => ({ hosts: [], totalCopied: 0, totalSkipped: 0 })
/* eslint-enable custom-rules/no-process-env-top-level */

// ============================================================================
// 类型定义
// ============================================================================

type SessionMeta = {
  session_id: string
  project_path: string
  start_time: string
  duration_minutes: number
  user_message_count: number
  assistant_message_count: number
  tool_counts: Record<string, number>
  languages: Record<string, number>
  git_commits: number
  git_pushes: number
  input_tokens: number
  output_tokens: number
  first_prompt: string
  summary?: string
  // 新增统计
  user_interruptions: number
  user_response_times: number[]
  tool_errors: number
  tool_error_categories: Record<string, number>
  uses_task_agent: boolean
  uses_mcp: boolean
  uses_web_search: boolean
  uses_web_fetch: boolean
  // 附加统计
  lines_added: number
  lines_removed: number
  files_modified: number
  message_hours: number[]
  user_message_timestamps: string[] // ISO 时间戳，用于检测并行会话
}

type SessionFacets = {
  session_id: string
  underlying_goal: string
  goal_categories: Record<string, number>
  outcome: string
  user_satisfaction_counts: Record<string, number>
  claude_helpfulness: string
  session_type: string
  friction_counts: Record<string, number>
  friction_detail: string
  primary_success: string
  brief_summary: string
  user_instructions_to_claude?: string[]
}

type AggregatedData = {
  total_sessions: number
  total_sessions_scanned?: number
  sessions_with_facets: number
  date_range: { start: string; end: string }
  total_messages: number
  total_duration_hours: number
  total_input_tokens: number
  total_output_tokens: number
  tool_counts: Record<string, number>
  languages: Record<string, number>
  git_commits: number
  git_pushes: number
  projects: Record<string, number>
  goal_categories: Record<string, number>
  outcomes: Record<string, number>
  satisfaction: Record<string, number>
  helpfulness: Record<string, number>
  session_types: Record<string, number>
  friction: Record<string, number>
  success: Record<string, number>
  session_summaries: Array<{
    id: string
    date: string
    summary: string
    goal?: string
  }>
  // 新增聚合统计
  total_interruptions: number
  total_tool_errors: number
  tool_error_categories: Record<string, number>
  user_response_times: number[]
  median_response_time: number
  avg_response_time: number
  sessions_using_task_agent: number
  sessions_using_mcp: number
  sessions_using_web_search: number
  sessions_using_web_fetch: number
  // 来自 Python 参考实现的附加统计
  total_lines_added: number
  total_lines_removed: number
  total_files_modified: number
  days_active: number
  messages_per_day: number
  message_hours: number[] // 每条用户消息所在的小时（用于时段分布图）
  // 并行会话统计（与 Python 参考实现保持一致）
  multi_clauding: {
    overlap_events: number
    sessions_involved: number
    user_messages_during: number
  }
}

// ============================================================================
// 常量定义
// ============================================================================

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.md': 'Markdown',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.sh': 'Shell',
  '.css': 'CSS',
  '.html': 'HTML',
}

// 标签映射表，用于清理类别名称（与 Python 参考实现一致）
const LABEL_MAP: Record<string, string> = {
  // 目标类别
  debug_investigate: '调试/调查',
  implement_feature: '实现功能',
  fix_bug: '修复 Bug',
  write_script_tool: '编写脚本/工具',
  refactor_code: '重构代码',
  configure_system: '配置系统',
  create_pr_commit: '创建 PR/提交',
  analyze_data: '分析数据',
  understand_codebase: '理解代码库',
  write_tests: '编写测试',
  write_docs: '编写文档',
  deploy_infra: '部署/基础设施',
  warmup_minimal: '缓存预热/短会话',
  // 成功因素
  fast_accurate_search: '快速/准确的搜索',
  correct_code_edits: '正确的代码编辑',
  good_explanations: '清晰的解释',
  proactive_help: '主动帮助',
  multi_file_changes: '多文件修改',
  handled_complexity: '处理复杂性',
  good_debugging: '有效调试',
  // 摩擦类型
  misunderstood_request: '误解需求',
  wrong_approach: '方法错误',
  buggy_code: '代码有缺陷',
  user_rejected_action: '用户拒绝操作',
  claude_got_blocked: 'Claude 被阻止',
  user_stopped_early: '用户提前停止',
  wrong_file_or_location: '文件或位置错误',
  excessive_changes: '改动过大',
  slow_or_verbose: '响应慢/过于啰嗦',
  tool_failed: '工具执行失败',
  user_unclear: '用户表述不清',
  external_issue: '外部问题',
  // 满意度标签
  frustrated: '沮丧',
  dissatisfied: '不满意',
  likely_satisfied: '可能满意',
  satisfied: '满意',
  happy: '高兴',
  unsure: '不确定',
  neutral: '中立',
  delighted: '非常满意',
  // 会话类型
  single_task: '单一任务',
  multi_task: '多项任务',
  iterative_refinement: '迭代优化',
  exploration: '探索性',
  quick_question: '快速提问',
  // 结果
  fully_achieved: '完全达成',
  mostly_achieved: '大部分达成',
  partially_achieved: '部分达成',
  not_achieved: '未达成',
  unclear_from_transcript: '记录中无法判断',
  // 帮助程度
  unhelpful: '没有帮助',
  slightly_helpful: '略有帮助',
  moderately_helpful: '有一定帮助',
  very_helpful: '非常有帮助',
  essential: '不可或缺',
}

// 惰性 getter：getClaudeConfigHomeDir() 已进行记忆化并读取 process.env。
// 如果在模块作用域调用，会在入口点设置 CLAUDE_CONFIG_DIR 之前填充记忆化缓存，
// 从而破坏所有其他 150+ 调用者。
function getDataDir(): string {
  return join(getClaudeConfigHomeDir(), 'usage-data')
}
function getFacetsDir(): string {
  return join(getDataDir(), 'facets')
}
function getSessionMetaDir(): string {
  return join(getDataDir(), 'session-meta')
}

const FACET_EXTRACTION_PROMPT = `分析本次 Claude Code 会话并提取结构化特征。

关键准则：

1. **goal_categories**：仅统计用户明确提出的需求。
   - 不要统计 Claude 自主进行的代码库探索行为
   - 不要统计 Claude 自行决定完成的工作
   - 仅当用户说“你能帮我...”、“请...”、“我需要...”、“我们来...”等明确指令时才算入

2. **user_satisfaction_counts**：仅基于用户明确的反馈信号判断。
   - “太好了！”、“棒极了！”、“完美！” → 高兴
   - “谢谢”、“看起来不错”、“这样就行” → 满意
   - “好，接下来我们...”（无抱怨地继续） → 可能满意
   - “不对”、“再试一次” → 不满意
   - “这有问题”、“我放弃了” → 沮丧

3. **friction_counts**：明确问题类型。
   - misunderstood_request：Claude 理解错误
   - wrong_approach：目标正确但解决方法错误
   - buggy_code：代码未能正常工作
   - user_rejected_action：用户对工具调用说“不”或停止操作
   - excessive_changes：过度设计或改动过大

4. 若会话极短或仅为热身，则将 goal_category 标记为 warmup_minimal

会话内容：
`
// ============================================================================
// 辅助函数
// ============================================================================

function getLanguageFromPath(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase()
  return EXTENSION_TO_LANGUAGE[ext] || null
}

function extractToolStats(log: LogOption): {
  toolCounts: Record<string, number>
  languages: Record<string, number>
  gitCommits: number
  gitPushes: number
  inputTokens: number
  outputTokens: number
  // 新增统计数据
  userInterruptions: number
  userResponseTimes: number[]
  toolErrors: number
  toolErrorCategories: Record<string, number>
  usesTaskAgent: boolean
  usesMcp: boolean
  usesWebSearch: boolean
  usesWebFetch: boolean
  // 附加统计
  linesAdded: number
  linesRemoved: number
  filesModified: Set<string>
  messageHours: number[]
  userMessageTimestamps: string[] // ISO 时间戳，用于检测并行会话
} {
  const toolCounts: Record<string, number> = {}
  const languages: Record<string, number> = {}
  let gitCommits = 0
  let gitPushes = 0
  let inputTokens = 0
  let outputTokens = 0

  // 新增统计数据
  let userInterruptions = 0
  const userResponseTimes: number[] = []
  let toolErrors = 0
  const toolErrorCategories: Record<string, number> = {}
  let usesTaskAgent = false

  // 附加统计
  let linesAdded = 0
  let linesRemoved = 0
  const filesModified = new Set<string>()
  const messageHours: number[] = []
  const userMessageTimestamps: string[] = [] // 用于检测并行会话
  let usesMcp = false
  let usesWebSearch = false
  let usesWebFetch = false
  let lastAssistantTimestamp: string | null = null

  for (const msg of log.messages) {
    // 获取消息时间戳以计算响应时间
    const msgTimestamp = (msg as { timestamp?: string }).timestamp

    if (msg.type === 'assistant' && msg.message) {
      // 记录时间戳以计算响应时间
      if (msgTimestamp) {
        lastAssistantTimestamp = msgTimestamp
      }

      const usage = (
        msg.message as {
          usage?: { input_tokens?: number; output_tokens?: number }
        }
      ).usage
      if (usage) {
        inputTokens += usage.input_tokens || 0
        outputTokens += usage.output_tokens || 0
      }

      const content = msg.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use' && 'name' in block) {
            const toolName = block.name as string
            toolCounts[toolName] = (toolCounts[toolName] || 0) + 1

            // 检查特殊工具使用情况
            if (
              toolName === AGENT_TOOL_NAME ||
              toolName === LEGACY_AGENT_TOOL_NAME
            )
              usesTaskAgent = true
            if (toolName.startsWith('mcp__')) usesMcp = true
            if (toolName === 'WebSearch') usesWebSearch = true
            if (toolName === 'WebFetch') usesWebFetch = true

            const input = (block as { input?: Record<string, unknown> }).input

            if (input) {
              const filePath = (input.file_path as string) || ''
              if (filePath) {
                const lang = getLanguageFromPath(filePath)
                if (lang) {
                  languages[lang] = (languages[lang] || 0) + 1
                }
                // 记录 Edit/Write 工具修改的文件
                if (toolName === 'Edit' || toolName === 'Write') {
                  filesModified.add(filePath)
                }
              }

              if (toolName === 'Edit') {
                const oldString = (input.old_string as string) || ''
                const newString = (input.new_string as string) || ''
                for (const change of diffLines(oldString, newString)) {
                  if (change.added) linesAdded += change.count || 0
                  if (change.removed) linesRemoved += change.count || 0
                }
              }

              // 记录 Write 工具的行数（全部为新增）
              if (toolName === 'Write') {
                const writeContent = (input.content as string) || ''
                if (writeContent) {
                  linesAdded += countCharInString(writeContent, '\n') + 1
                }
              }

              const command = (input.command as string) || ''
              if (command.includes('git commit')) gitCommits++
              if (command.includes('git push')) gitPushes++
            }
          }
        }
      }
    }

    // 检查用户消息
    if (msg.type === 'user' && msg.message) {
      const content = msg.message.content

      // 判断是否为真正的人类消息（含文本）而不是 tool_result
      // 与 Python 参考逻辑保持一致
      let isHumanMessage = false
      if (typeof content === 'string' && content.trim()) {
        isHumanMessage = true
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && 'text' in block) {
            isHumanMessage = true
            break
          }
        }
      }

      // 仅对真正的人类消息记录消息时段和响应时间
      if (isHumanMessage) {
        // 记录消息时段用于时段分布分析，以及时间戳用于检测并行会话
        if (msgTimestamp) {
          try {
            const msgDate = new Date(msgTimestamp)
            const hour = msgDate.getHours() // 本地小时 0-23
            messageHours.push(hour)
            // 收集时间戳用于检测并行会话（与 Python 实现一致）
            userMessageTimestamps.push(msgTimestamp)
          } catch {
            // 跳过无效的时间戳
          }
        }

        // 计算响应时间（从最后一条助手消息到当前用户消息的时间间隔）
        // 仅统计大于 2 秒的间隔（真正的人类思考时间，非工具结果）
        if (lastAssistantTimestamp && msgTimestamp) {
          const assistantTime = new Date(lastAssistantTimestamp).getTime()
          const userTime = new Date(msgTimestamp).getTime()
          const responseTimeSec = (userTime - assistantTime) / 1000
          // 仅统计合理响应时间（2秒至1小时），与 Python 实现一致
          if (responseTimeSec > 2 && responseTimeSec < 3600) {
            userResponseTimes.push(responseTimeSec)
          }
        }
      }

      // 处理工具结果（用于错误跟踪）
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && 'content' in block) {
            const isError = (block as { is_error?: boolean }).is_error

            // 统计并分类工具错误（与 Python 参考逻辑保持一致）
            if (isError) {
              toolErrors++
              const resultContent = (block as { content?: string }).content
              let category = 'Other'
              if (typeof resultContent === 'string') {
                const lowerContent = resultContent.toLowerCase()
                if (lowerContent.includes('exit code')) {
                  category = 'Command Failed'
                } else if (
                  lowerContent.includes('rejected') ||
                  lowerContent.includes("doesn't want")
                ) {
                  category = 'User Rejected'
                } else if (
                  lowerContent.includes('string to replace not found') ||
                  lowerContent.includes('no changes')
                ) {
                  category = 'Edit Failed'
                } else if (lowerContent.includes('modified since read')) {
                  category = 'File Changed'
                } else if (
                  lowerContent.includes('exceeds maximum') ||
                  lowerContent.includes('too large')
                ) {
                  category = 'File Too Large'
                } else if (
                  lowerContent.includes('file not found') ||
                  lowerContent.includes('does not exist')
                ) {
                  category = 'File Not Found'
                }
              }
              toolErrorCategories[category] =
                (toolErrorCategories[category] || 0) + 1
            }
          }
        }
      }

      // 检查用户中断（与 Python 参考实现一致）
      if (typeof content === 'string') {
        if (content.includes('[Request interrupted by user')) {
          userInterruptions++
        }
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (
            block.type === 'text' &&
            'text' in block &&
            (block.text as string).includes('[Request interrupted by user')
          ) {
            userInterruptions++
            break
          }
        }
      }
    }
  }

  return {
    toolCounts,
    languages,
    gitCommits,
    gitPushes,
    inputTokens,
    outputTokens,
    // 新增统计数据
    userInterruptions,
    userResponseTimes,
    toolErrors,
    toolErrorCategories,
    usesTaskAgent,
    usesMcp,
    usesWebSearch,
    usesWebFetch,
    // 附加统计
    linesAdded,
    linesRemoved,
    filesModified,
    messageHours,
    userMessageTimestamps,
  }
}

function hasValidDates(log: LogOption): boolean {
  return (
    !Number.isNaN(log.created.getTime()) &&
    !Number.isNaN(log.modified.getTime())
  )
}

function logToSessionMeta(log: LogOption): SessionMeta {
  const stats = extractToolStats(log)
  const sessionId = getSessionIdFromLog(log) || 'unknown'
  const startTime = log.created.toISOString()
  const durationMinutes = Math.round(
    (log.modified.getTime() - log.created.getTime()) / 1000 / 60,
  )

  let userMessageCount = 0
  let assistantMessageCount = 0
  for (const msg of log.messages) {
    if (msg.type === 'assistant') assistantMessageCount++
    // 仅统计含有实际文本内容的用户消息（人类消息），
    // 而非仅 tool_result 消息（与 Python 参考实现一致）
    if (msg.type === 'user' && msg.message) {
      const content = msg.message.content
      let isHumanMessage = false
      if (typeof content === 'string' && content.trim()) {
        isHumanMessage = true
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && 'text' in block) {
            isHumanMessage = true
            break
          }
        }
      }
      if (isHumanMessage) {
        userMessageCount++
      }
    }
  }

  return {
    session_id: sessionId,
    project_path: log.projectPath || '',
    start_time: startTime,
    duration_minutes: durationMinutes,
    user_message_count: userMessageCount,
    assistant_message_count: assistantMessageCount,
    tool_counts: stats.toolCounts,
    languages: stats.languages,
    git_commits: stats.gitCommits,
    git_pushes: stats.gitPushes,
    input_tokens: stats.inputTokens,
    output_tokens: stats.outputTokens,
    first_prompt: log.firstPrompt || '',
    summary: log.summary,
    // 新增统计数据
    user_interruptions: stats.userInterruptions,
    user_response_times: stats.userResponseTimes,
    tool_errors: stats.toolErrors,
    tool_error_categories: stats.toolErrorCategories,
    uses_task_agent: stats.usesTaskAgent,
    uses_mcp: stats.usesMcp,
    uses_web_search: stats.usesWebSearch,
    uses_web_fetch: stats.usesWebFetch,
    // 附加统计
    lines_added: stats.linesAdded,
    lines_removed: stats.linesRemoved,
    files_modified: stats.filesModified.size,
    message_hours: stats.messageHours,
    user_message_timestamps: stats.userMessageTimestamps,
  }
}

/**
 * 对同一会话内的对话分支进行去重。
 *
 * 当会话文件有多个叶子消息（来自重试或分支）时，
 * loadAllLogsFromSessionFile 会为每个叶子生成一个 LogOption。每个分支
 * 共享同一条根消息，因此其持续时间会与兄弟分支重叠。
 * 此函数为每个 session_id 仅保留用户消息最多的分支
 * （若数量相同则保留持续时间最长的）。
 */
export function deduplicateSessionBranches(
  entries: Array<{ log: LogOption; meta: SessionMeta }>,
): Array<{ log: LogOption; meta: SessionMeta }> {
  const bestBySession = new Map<string, { log: LogOption; meta: SessionMeta }>()
  for (const entry of entries) {
    const id = entry.meta.session_id
    const existing = bestBySession.get(id)
    if (
      !existing ||
      entry.meta.user_message_count > existing.meta.user_message_count ||
      (entry.meta.user_message_count === existing.meta.user_message_count &&
        entry.meta.duration_minutes > existing.meta.duration_minutes)
    ) {
      bestBySession.set(id, entry)
    }
  }
  return [...bestBySession.values()]
}

function formatTranscriptForFacets(log: LogOption): string {
  const lines: string[] = []
  const meta = logToSessionMeta(log)

  lines.push(`会话: ${meta.session_id.slice(0, 8)}`)
  lines.push(`日期: ${meta.start_time}`)
  lines.push(`项目: ${meta.project_path}`)
  lines.push(`持续时间: ${meta.duration_minutes} 分钟`)
  lines.push('')

  for (const msg of log.messages) {
    if (msg.type === 'user' && msg.message) {
      const content = msg.message.content
      if (typeof content === 'string') {
        lines.push(`[User]: ${content.slice(0, 500)}`)
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && 'text' in block) {
            lines.push(`[User]: ${(block.text as string).slice(0, 500)}`)
          }
        }
      }
    } else if (msg.type === 'assistant' && msg.message) {
      const content = msg.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && 'text' in block) {
            lines.push(`[Assistant]: ${(block.text as string).slice(0, 600)}`)
          } else if (block.type === 'tool_use' && 'name' in block) {
            lines.push(`[Tool: ${block.name}]`)
          }
        }
      }
    }
  }

  return lines.join('\n')
}

const SUMMARIZE_CHUNK_PROMPT = `总结这部分 Claude Code 会话记录。重点关注：
1. 用户请求了什么
2. Claude 做了什么（使用的工具、修改的文件）
3. 遇到的任何摩擦或问题
4. 最终结果

请保持简洁——3 到 5 句话。保留具体细节，如文件名、错误信息和用户反馈。

会话记录片段：
`

async function summarizeTranscriptChunk(chunk: string): Promise<string> {
  try {
    const result = await queryWithModel({
      systemPrompt: asSystemPrompt([]),
      userPrompt: SUMMARIZE_CHUNK_PROMPT + chunk,
      signal: new AbortController().signal,
      options: {
        model: getAnalysisModel(),
        querySource: 'insights',
        agents: [],
        isNonInteractiveSession: true,
        hasAppendSystemPrompt: false,
        mcpTools: [],
        maxOutputTokensOverride: 500,
      },
    })

    const text = extractTextContent(result.message.content)
    return text || chunk.slice(0, 2000)
  } catch {
    // 出错时，仅返回截断的块
    return chunk.slice(0, 2000)
  }
}

async function formatTranscriptWithSummarization(
  log: LogOption,
): Promise<string> {
  const fullTranscript = formatTranscriptForFacets(log)

  // 如果少于 6 万字符，直接使用原文
  if (fullTranscript.length <= 60000) {
    return fullTranscript
  }

  // 对于长转录，分割成多个块并并行摘要
  const CHUNK_SIZE = 25000
  const chunks: string[] = []

  for (let i = 0; i < fullTranscript.length; i += CHUNK_SIZE) {
    chunks.push(fullTranscript.slice(i, i + CHUNK_SIZE))
  }

  // 并行摘要所有块
  const summaries = await Promise.all(chunks.map(summarizeTranscriptChunk))

  // 将会话头部与摘要合并
  const meta = logToSessionMeta(log)
  const header = [
    `会话: ${meta.session_id.slice(0, 8)}`,
    `日期: ${meta.start_time}`,
    `项目: ${meta.project_path}`,
    `持续时间: ${meta.duration_minutes} 分钟`,
    `[长会话 - 已摘要 ${chunks.length} 个部分]`,
    '',
  ].join('\n')

  return header + summaries.join('\n\n---\n\n')
}

async function loadCachedFacets(
  sessionId: string,
): Promise<SessionFacets | null> {
  const facetPath = join(getFacetsDir(), `${sessionId}.json`)
  try {
    const content = await readFile(facetPath, { encoding: 'utf-8' })
    const parsed: unknown = jsonParse(content)
    if (!isValidSessionFacets(parsed)) {
      // 删除损坏的缓存文件，以便下次运行时重新提取
      try {
        await unlink(facetPath)
      } catch {
        // 忽略删除错误
      }
      return null
    }
    return parsed
  } catch {
    return null
  }
}

async function saveFacets(facets: SessionFacets): Promise<void> {
  try {
    await mkdir(getFacetsDir(), { recursive: true })
  } catch {
    // 目录可能已存在
  }
  const facetPath = join(getFacetsDir(), `${facets.session_id}.json`)
  await writeFile(facetPath, jsonStringify(facets, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  })
}

async function loadCachedSessionMeta(
  sessionId: string,
): Promise<SessionMeta | null> {
  const metaPath = join(getSessionMetaDir(), `${sessionId}.json`)
  try {
    const content = await readFile(metaPath, { encoding: 'utf-8' })
    return jsonParse(content)
  } catch {
    return null
  }
}

async function saveSessionMeta(meta: SessionMeta): Promise<void> {
  try {
    await mkdir(getSessionMetaDir(), { recursive: true })
  } catch {
    // 目录可能已存在
  }
  const metaPath = join(getSessionMetaDir(), `${meta.session_id}.json`)
  await writeFile(metaPath, jsonStringify(meta, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  })
}

async function extractFacetsFromAPI(
  log: LogOption,
  sessionId: string,
): Promise<SessionFacets | null> {
  try {
    // 对长转录使用摘要功能
    const transcript = await formatTranscriptWithSummarization(log)

    // 构建提示词，要求直接返回 JSON（不使用工具调用）
	const jsonPrompt = `${FACET_EXTRACTION_PROMPT}${transcript}

	请仅返回一个符合以下模式的有效 JSON 对象：
	{
	  "underlying_goal": "用户根本想要达成的目标",
	  "goal_categories": {"类别名称": 数量, ...},
	  "outcome": "完全达成|大部分达成|部分达成|未达成|记录中无法判断",
	  "user_satisfaction_counts": {"满意度等级": 数量, ...},
	  "claude_helpfulness": "没有帮助|略有帮助|有一定帮助|非常有帮助|不可或缺",
	  "session_type": "单一任务|多项任务|迭代优化|探索性|快速提问",
	  "friction_counts": {"摩擦类型": 数量, ...},
	  "friction_detail": "用一句话描述摩擦或留空",
	  "primary_success": "无|快速准确的搜索|正确的代码编辑|清晰的解释|主动帮助|多文件修改|有效调试",
	  "brief_summary": "一句话概括：用户想要什么，以及他们是否实现了"
	}`

    const result = await queryWithModel({
      systemPrompt: asSystemPrompt([]),
      userPrompt: jsonPrompt,
      signal: new AbortController().signal,
      options: {
        model: getAnalysisModel(),
        querySource: 'insights',
        agents: [],
        isNonInteractiveSession: true,
        hasAppendSystemPrompt: false,
        mcpTools: [],
        maxOutputTokensOverride: 4096,
      },
    })

    const text = extractTextContent(result.message.content)

    // 解析 JSON 响应
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed: unknown = jsonParse(jsonMatch[0])
    if (!isValidSessionFacets(parsed)) return null
    const facets: SessionFacets = { ...parsed, session_id: sessionId }
    return facets
  } catch (err) {
    logError(new Error(`Facet extraction failed: ${toError(err).message}`))
    return null
  }
}

/**
 * 检测并行会话（同时使用多个 Claude Code 会话）。
 * 使用滑动窗口查找以下模式：session1 -> session2 -> session1
 * 在 30 分钟窗口内。
 */
export function detectMultiClauding(
  sessions: Array<{
    session_id: string
    user_message_timestamps: string[]
  }>,
): {
  overlap_events: number
  sessions_involved: number
  user_messages_during: number
} {
  const OVERLAP_WINDOW_MS = 30 * 60000
  const allSessionMessages: Array<{ ts: number; sessionId: string }> = []

  for (const session of sessions) {
    for (const timestamp of session.user_message_timestamps) {
      try {
        const ts = new Date(timestamp).getTime()
        allSessionMessages.push({ ts, sessionId: session.session_id })
      } catch {
        // 跳过无效的时间戳
      }
    }
  }

  allSessionMessages.sort((a, b) => a.ts - b.ts)

  const multiClaudeSessionPairs = new Set<string>()
  const messagesDuringMulticlaude = new Set<string>()

  // 滑动窗口：sessionLastIndex 追踪每个会话的最新索引
  let windowStart = 0
  const sessionLastIndex = new Map<string, number>()

  for (let i = 0; i < allSessionMessages.length; i++) {
    const msg = allSessionMessages[i]!

    // 从左侧缩小窗口
    while (
      windowStart < i &&
      msg.ts - allSessionMessages[windowStart]!.ts > OVERLAP_WINDOW_MS
    ) {
      const expiring = allSessionMessages[windowStart]!
      if (sessionLastIndex.get(expiring.sessionId) === windowStart) {
        sessionLastIndex.delete(expiring.sessionId)
      }
      windowStart++
    }

    // 检查此会话是否在窗口内较早出现过（模式：s1 -> s2 -> s1）
    const prevIndex = sessionLastIndex.get(msg.sessionId)
    if (prevIndex !== undefined) {
      for (let j = prevIndex + 1; j < i; j++) {
        const between = allSessionMessages[j]!
        if (between.sessionId !== msg.sessionId) {
          const pair = [msg.sessionId, between.sessionId].sort().join(':')
          multiClaudeSessionPairs.add(pair)
          messagesDuringMulticlaude.add(
            `${allSessionMessages[prevIndex]!.ts}:${msg.sessionId}`,
          )
          messagesDuringMulticlaude.add(`${between.ts}:${between.sessionId}`)
          messagesDuringMulticlaude.add(`${msg.ts}:${msg.sessionId}`)
          break
        }
      }
    }

    sessionLastIndex.set(msg.sessionId, i)
  }

  const sessionsWithOverlaps = new Set<string>()
  for (const pair of multiClaudeSessionPairs) {
    const [s1, s2] = pair.split(':')
    if (s1) sessionsWithOverlaps.add(s1)
    if (s2) sessionsWithOverlaps.add(s2)
  }

  return {
    overlap_events: multiClaudeSessionPairs.size,
    sessions_involved: sessionsWithOverlaps.size,
    user_messages_during: messagesDuringMulticlaude.size,
  }
}

function aggregateData(
  sessions: SessionMeta[],
  facets: Map<string, SessionFacets>,
): AggregatedData {
  const result: AggregatedData = {
    total_sessions: sessions.length,
    sessions_with_facets: facets.size,
    date_range: { start: '', end: '' },
    total_messages: 0,
    total_duration_hours: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    tool_counts: {},
    languages: {},
    git_commits: 0,
    git_pushes: 0,
    projects: {},
    goal_categories: {},
    outcomes: {},
    satisfaction: {},
    helpfulness: {},
    session_types: {},
    friction: {},
    success: {},
    session_summaries: [],
    // 新增统计数据
    total_interruptions: 0,
    total_tool_errors: 0,
    tool_error_categories: {},
    user_response_times: [],
    median_response_time: 0,
    avg_response_time: 0,
    sessions_using_task_agent: 0,
    sessions_using_mcp: 0,
    sessions_using_web_search: 0,
    sessions_using_web_fetch: 0,
    // 附加统计数据
    total_lines_added: 0,
    total_lines_removed: 0,
    total_files_modified: 0,
    days_active: 0,
    messages_per_day: 0,
    message_hours: [],
    // 并行会话统计（与 Python 参考实现一致）
    multi_clauding: {
      overlap_events: 0,
      sessions_involved: 0,
      user_messages_during: 0,
    },
  }

  const dates: string[] = []
  const allResponseTimes: number[] = []
  const allMessageHours: number[] = []

  for (const session of sessions) {
    dates.push(session.start_time)
    result.total_messages += session.user_message_count
    result.total_duration_hours += session.duration_minutes / 60
    result.total_input_tokens += session.input_tokens
    result.total_output_tokens += session.output_tokens
    result.git_commits += session.git_commits
    result.git_pushes += session.git_pushes

    // 聚合新增统计数据
    result.total_interruptions += session.user_interruptions
    result.total_tool_errors += session.tool_errors
    for (const [cat, count] of Object.entries(session.tool_error_categories)) {
      result.tool_error_categories[cat] =
        (result.tool_error_categories[cat] || 0) + count
    }
    allResponseTimes.push(...session.user_response_times)
    if (session.uses_task_agent) result.sessions_using_task_agent++
    if (session.uses_mcp) result.sessions_using_mcp++
    if (session.uses_web_search) result.sessions_using_web_search++
    if (session.uses_web_fetch) result.sessions_using_web_fetch++

    // 聚合附加统计数据
    result.total_lines_added += session.lines_added
    result.total_lines_removed += session.lines_removed
    result.total_files_modified += session.files_modified
    allMessageHours.push(...session.message_hours)

    for (const [tool, count] of Object.entries(session.tool_counts)) {
      result.tool_counts[tool] = (result.tool_counts[tool] || 0) + count
    }

    for (const [lang, count] of Object.entries(session.languages)) {
      result.languages[lang] = (result.languages[lang] || 0) + count
    }

    if (session.project_path) {
      result.projects[session.project_path] =
        (result.projects[session.project_path] || 0) + 1
    }

    const sessionFacets = facets.get(session.session_id)
    if (sessionFacets) {
      // 目标类别
      for (const [cat, count] of safeEntries(sessionFacets.goal_categories)) {
        if (count > 0) {
          result.goal_categories[cat] =
            (result.goal_categories[cat] || 0) + count
        }
      }

      // 成果
      result.outcomes[sessionFacets.outcome] =
        (result.outcomes[sessionFacets.outcome] || 0) + 1

      // 满意度统计
      for (const [level, count] of safeEntries(
        sessionFacets.user_satisfaction_counts,
      )) {
        if (count > 0) {
          result.satisfaction[level] = (result.satisfaction[level] || 0) + count
        }
      }

      // 有用性
      result.helpfulness[sessionFacets.claude_helpfulness] =
        (result.helpfulness[sessionFacets.claude_helpfulness] || 0) + 1

      // 会话类型
      result.session_types[sessionFacets.session_type] =
        (result.session_types[sessionFacets.session_type] || 0) + 1

      // 摩擦点统计
      for (const [type, count] of safeEntries(sessionFacets.friction_counts)) {
        if (count > 0) {
          result.friction[type] = (result.friction[type] || 0) + count
        }
      }

      // 成功因素
      if (sessionFacets.primary_success !== 'none') {
        result.success[sessionFacets.primary_success] =
          (result.success[sessionFacets.primary_success] || 0) + 1
      }
    }

    if (result.session_summaries.length < 50) {
      result.session_summaries.push({
        id: session.session_id.slice(0, 8),
        date: session.start_time.split('T')[0] || '',
        summary: session.summary || session.first_prompt.slice(0, 100),
        goal: sessionFacets?.underlying_goal,
      })
    }
  }

  dates.sort()
  result.date_range.start = dates[0]?.split('T')[0] || ''
  result.date_range.end = dates[dates.length - 1]?.split('T')[0] || ''

  // 计算响应时间统计
  result.user_response_times = allResponseTimes
  if (allResponseTimes.length > 0) {
    const sorted = [...allResponseTimes].sort((a, b) => a - b)
    result.median_response_time = sorted[Math.floor(sorted.length / 2)] || 0
    result.avg_response_time =
      allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length
  }

  // 计算活跃天数和日均消息数
  const uniqueDays = new Set(dates.map(d => d.split('T')[0]))
  result.days_active = uniqueDays.size
  result.messages_per_day =
    result.days_active > 0
      ? Math.round((result.total_messages / result.days_active) * 10) / 10
      : 0

  // 存储消息时段数据用于时段分布图
  result.message_hours = allMessageHours

  result.multi_clauding = detectMultiClauding(sessions)

  return result
}

// ============================================================================
// 并行生成洞察报告（6 个章节）
// ============================================================================

type InsightSection = {
  name: string
  prompt: string
  maxTokens: number
}
// 首先并行运行的部分
const INSIGHT_SECTIONS: InsightSection[] = [
  {
    name: 'project_areas',
    prompt: `分析这些 Claude Code 使用数据，识别项目领域。

请仅返回一个有效的 JSON 对象：
{
  "areas": [
    {"name": "领域名称", "session_count": N, "description": "用2-3句话描述该领域涉及的工作内容以及 Claude Code 的使用方式。"}
  ]
}

包含4-5个领域。跳过内部 CC 操作。`,
    maxTokens: 8192,
  },
  {
    name: 'interaction_style',
    prompt: `分析这些 Claude Code 使用数据，描述用户的交互风格。

请仅返回一个有效的 JSON 对象：
{
  "narrative": "用2-3个段落分析用户的交互方式。使用第二人称“您”。描述模式：是快速迭代还是详细的前期说明？经常打断还是让 Claude 自主运行？包含具体例子。用**加粗**突出关键发现。",
  "key_pattern": "用一句话总结最独特的交互风格"
}`,
    maxTokens: 8192,
  },
  {
    name: 'what_works',
    prompt: `分析这些 Claude Code 使用数据，识别哪些方面对该用户有效。使用第二人称（“您”）。

请仅返回一个有效的 JSON 对象：
{
  "intro": "1句背景介绍",
  "impressive_workflows": [
    {"title": "简短标题（3-6个词）", "description": "用2-3句话描述令人印象深刻的工作流或方法。使用“您”而非“用户”。"}
  ]
}

包含3个令人印象深刻的工作流。`,
    maxTokens: 8192,
  },
  {
    name: 'friction_analysis',
    prompt: `分析这些 Claude Code 使用数据，识别该用户的摩擦点。使用第二人称（“您”）。

请仅返回一个有效的 JSON 对象：
{
  "intro": "用1句话总结摩擦模式",
  "categories": [
    {"category": "具体的类别名称", "description": "用1-2句话解释该类别以及可能的改进方式。使用“您”而非“用户”。", "examples": ["带有后果的具体示例", "另一个示例"]}
  ]
}

包含3个摩擦类别，每类2个示例。`,
    maxTokens: 8192,
  },
  {
    name: 'suggestions',
    prompt: `分析这些 Claude Code 使用数据，提出改进建议。

## CC 功能参考（从以下内容中选择 features_to_try）：
1. **MCP 服务器**：通过模型上下文协议将 Claude 连接到外部工具、数据库和 API。
   - 使用方法：运行 \`claude mcp add <server-name> -- <command>\`
   - 适用场景：数据库查询、Slack 集成、GitHub 问题查询、连接内部 API

2. **自定义技能**：将可复用的提示词定义为 markdown 文件，通过单个 /命令运行。
   - 使用方法：创建 \`.claude/skills/commit/SKILL.md\` 并编写说明。然后输入 \`/commit\` 运行。
   - 适用场景：重复性工作流——/commit、/review、/test、/deploy、/pr，或复杂的多步骤工作流

3. **钩子**：在特定生命周期事件时自动运行的 shell 命令。
   - 使用方法：在 \`.claude/settings.json\` 的 "hooks" 键下添加。
   - 适用场景：自动格式化代码、运行类型检查、强制执行规范

4. **无头模式**：在脚本和 CI/CD 中以非交互方式运行 Claude。
   - 使用方法：\`claude -p "修复 lint 错误" --allowedTools "Edit,Read,Bash"\`
   - 适用场景：CI/CD 集成、批量代码修复、自动化审查

5. **任务代理**：Claude 生成专注的子代理进行复杂的探索或并行工作。
   - 使用方法：Claude 在需要时自动调用，或直接要求“使用代理探索 X”
   - 适用场景：代码库探索、理解复杂系统

请仅返回一个有效的 JSON 对象：
{
  "claude_md_additions": [
    {"addition": "基于工作流模式，建议添加到 CLAUDE.md 中的具体行或块。例如：'修改认证相关文件后始终运行测试'", "why": "用1句话解释根据实际会话判断为何此建议会有帮助", "prompt_scaffold": "建议在 CLAUDE.md 中添加此内容的位置。例如：'添加到 ## 测试 部分下'"}
  ],
  "features_to_try": [
    {"feature": "上述 CC 功能参考中的功能名称", "one_liner": "功能简介", "why_for_you": "基于您的会话分析，为何此功能对您有帮助", "example_code": "可复制的实际命令或配置"}
  ],
  "usage_patterns": [
    {"title": "简短标题", "suggestion": "1-2句话的总结", "detail": "3-4句话解释此模式如何适用于您的工作", "copyable_prompt": "可复制尝试的具体提示词"}
  ]
}

关于 claude_md_additions 的重要提示：优先推荐在用户数据中**多次出现**的指令。如果用户在2个或更多会话中告诉 Claude 相同的事情（例如“始终运行测试”、“使用 TypeScript”），这将是绝佳的候选内容——用户不应重复说明。

关于 features_to_try 的重要提示：从上述 CC 功能参考中选取2-3项。每类包含2-3个项目。`,
    maxTokens: 8192,
  },
  {
    name: 'on_the_horizon',
    prompt: `分析这些 Claude Code 使用数据，识别未来的可能性。

请仅返回一个有效的 JSON 对象：
{
  "intro": "用1句话介绍不断发展的 AI 辅助开发",
  "opportunities": [
    {"title": "简短标题（4-8个词）", "whats_possible": "用2-3句富有远见的话描述自主工作流", "how_to_try": "1-2句话提及相关工具", "copyable_prompt": "可尝试的详细提示词"}
  ]
}

包含3个机会。大胆设想——自主工作流、并行代理、基于测试迭代。`,
    maxTokens: 8192,
  },
  ...(process.env.USER_TYPE === 'ant'
    ? [
        {
          name: 'cc_team_improvements',
          prompt: `分析这些 Claude Code 使用数据，为 CC 团队提出产品改进建议。

请仅返回一个有效的 JSON 对象：
{
  "improvements": [
    {"title": "产品/工具改进", "detail": "3-4句话描述改进建议", "evidence": "3-4句话引用具体会话示例"}
  ]
}

根据观察到的摩擦模式，包含2-3项改进建议。`,
          maxTokens: 8192,
        },
        {
          name: 'model_behavior_improvements',
          prompt: `分析这些 Claude Code 使用数据，建议模型行为改进。

请仅返回一个有效的 JSON 对象：
{
  "improvements": [
    {"title": "模型行为变更", "detail": "3-4句话描述模型应如何调整行为", "evidence": "3-4句话引用具体示例"}
  ]
}

根据观察到的摩擦模式，包含2-3项改进建议。`,
          maxTokens: 8192,
        },
      ]
    : []),
  {
    name: 'fun_ending',
    prompt: `分析这些 Claude Code 使用数据，寻找一个难忘的时刻。

请仅返回一个有效的 JSON 对象：
{
  "headline": "记录中一个令人难忘的**定性**时刻——不是统计数据。可以是有人情味、有趣或令人惊讶的事情。",
  "detail": "关于该时刻发生时间的简要背景"
}

从会话摘要中找出真正有趣或好玩的内容。`,
    maxTokens: 8192,
  },
]

type InsightResults = {
  at_a_glance?: {
    whats_working?: string
    whats_hindering?: string
    quick_wins?: string
    ambitious_workflows?: string
  }
  project_areas?: {
    areas?: Array<{ name: string; session_count: number; description: string }>
  }
  interaction_style?: {
    narrative?: string
    key_pattern?: string
  }
  what_works?: {
    intro?: string
    impressive_workflows?: Array<{ title: string; description: string }>
  }
  friction_analysis?: {
    intro?: string
    categories?: Array<{
      category: string
      description: string
      examples?: string[]
    }>
  }
  suggestions?: {
    claude_md_additions?: Array<{
      addition: string
      why: string
      where?: string
      prompt_scaffold?: string
    }>
    features_to_try?: Array<{
      feature: string
      one_liner: string
      why_for_you: string
      example_code?: string
    }>
    usage_patterns?: Array<{
      title: string
      suggestion: string
      detail?: string
      copyable_prompt?: string
    }>
  }
  on_the_horizon?: {
    intro?: string
    opportunities?: Array<{
      title: string
      whats_possible: string
      how_to_try?: string
      copyable_prompt?: string
    }>
  }
  cc_team_improvements?: {
    improvements?: Array<{
      title: string
      detail: string
      evidence?: string
    }>
  }
  model_behavior_improvements?: {
    improvements?: Array<{
      title: string
      detail: string
      evidence?: string
    }>
  }
  fun_ending?: {
    headline?: string
    detail?: string
  }
}

async function generateSectionInsight(
  section: InsightSection,
  dataContext: string,
): Promise<{ name: string; result: unknown }> {
  try {
    const result = await queryWithModel({
      systemPrompt: asSystemPrompt([]),
      userPrompt: section.prompt + '\n\nDATA:\n' + dataContext,
      signal: new AbortController().signal,
      options: {
        model: getInsightsModel(),
        querySource: 'insights',
        agents: [],
        isNonInteractiveSession: true,
        hasAppendSystemPrompt: false,
        mcpTools: [],
        maxOutputTokensOverride: section.maxTokens,
      },
    })

    const text = extractTextContent(result.message.content)

    if (text) {
      // 解析 JSON 响应
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          return { name: section.name, result: jsonParse(jsonMatch[0]) }
        } catch {
          return { name: section.name, result: null }
        }
      }
    }
    return { name: section.name, result: null }
  } catch (err) {
    logError(new Error(`${section.name} failed: ${toError(err).message}`))
    return { name: section.name, result: null }
  }
}

async function generateParallelInsights(
  data: AggregatedData,
  facets: Map<string, SessionFacets>,
): Promise<InsightResults> {
  // 构建数据上下文字符串
  const facetSummaries = Array.from(facets.values())
    .slice(0, 50)
    .map(f => `- ${f.brief_summary} (${f.outcome}, ${f.claude_helpfulness})`)
    .join('\n')

  const frictionDetails = Array.from(facets.values())
    .filter(f => f.friction_detail)
    .slice(0, 20)
    .map(f => `- ${f.friction_detail}`)
    .join('\n')

  const userInstructions = Array.from(facets.values())
    .flatMap(f => f.user_instructions_to_claude || [])
    .slice(0, 15)
    .map(i => `- ${i}`)
    .join('\n')

  const dataContext = jsonStringify(
    {
      sessions: data.total_sessions,
      analyzed: data.sessions_with_facets,
      date_range: data.date_range,
      messages: data.total_messages,
      hours: Math.round(data.total_duration_hours),
      commits: data.git_commits,
      top_tools: Object.entries(data.tool_counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
      top_goals: Object.entries(data.goal_categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
      outcomes: data.outcomes,
      satisfaction: data.satisfaction,
      friction: data.friction,
      success: data.success,
      languages: data.languages,
    },
    null,
    2,
  )

  const fullContext =
    dataContext +
    '\n\nSESSION SUMMARIES:\n' +
    facetSummaries +
    '\n\nFRICTION DETAILS:\n' +
    frictionDetails +
    '\n\nUSER INSTRUCTIONS TO CLAUDE:\n' +
    (userInstructions || 'None captured')

  // 先并行运行各章节（排除概览部分）
  const results = await Promise.all(
    INSIGHT_SECTIONS.map(section =>
      generateSectionInsight(section, fullContext),
    ),
  )

  // 合并结果
  const insights: InsightResults = {}
  for (const { name, result } of results) {
    if (result) {
      ;(insights as Record<string, unknown>)[name] = result
    }
  }

  // 从已生成的各章节构建丰富的上下文供概览使用
  const projectAreasText =
    (
      insights.project_areas as {
        areas?: Array<{ name: string; description: string }>
      }
    )?.areas
      ?.map(a => `- ${a.name}: ${a.description}`)
      .join('\n') || ''

  const bigWinsText =
    (
      insights.what_works as {
        impressive_workflows?: Array<{ title: string; description: string }>
      }
    )?.impressive_workflows
      ?.map(w => `- ${w.title}: ${w.description}`)
      .join('\n') || ''

  const frictionText =
    (
      insights.friction_analysis as {
        categories?: Array<{ category: string; description: string }>
      }
    )?.categories
      ?.map(c => `- ${c.category}: ${c.description}`)
      .join('\n') || ''

  const featuresText =
    (
      insights.suggestions as {
        features_to_try?: Array<{ feature: string; one_liner: string }>
      }
    )?.features_to_try
      ?.map(f => `- ${f.feature}: ${f.one_liner}`)
      .join('\n') || ''

  const patternsText =
    (
      insights.suggestions as {
        usage_patterns?: Array<{ title: string; suggestion: string }>
      }
    )?.usage_patterns
      ?.map(p => `- ${p.title}: ${p.suggestion}`)
      .join('\n') || ''

  const horizonText =
    (
      insights.on_the_horizon as {
        opportunities?: Array<{ title: string; whats_possible: string }>
      }
    )?.opportunities
      ?.map(o => `- ${o.title}: ${o.whats_possible}`)
      .join('\n') || ''

  // 现在基于其他部分的输出来生成"概览"部分
const atAGlancePrompt = `您正在为 Claude Code 用户撰写一份 Claude Code 使用情况洞察报告的“概览”摘要。目的是帮助他们了解自己的使用情况，并随着模型能力的提升，更有效地使用 Claude。

请采用以下四部分结构：

1. **哪些方面做得好** — 用户与 Claude 交互的独特风格是什么？他们完成了哪些有影响力的事情？可以包含一两个细节，但保持高层概括，因为用户可能对具体内容印象不深。避免空泛或过度赞美。也不要只关注他们使用了哪些工具调用。

2. **哪些方面阻碍了您** — 分为（a）Claude 的责任（误解、错误的方法、代码缺陷）和（b）用户侧的摩擦（提供上下文不足、环境问题——最好比单个项目更通用）。保持诚实但具有建设性。

3. **值得尝试的快速改进** — 从下方示例中挑选他们可以尝试的具体 Claude Code 功能，或者一个您认为非常有说服力的工作流技巧。（避免推荐诸如“让 Claude 在操作前确认”或“提前提供更多上下文”这类相对乏味的建议。）

4. **面向更强模型的进阶工作流** — 随着未来 3-6 个月内模型能力的大幅提升，他们应该为哪些工作流做准备？现在看起来不可能的工作流中有哪些将变得可行？请从下方对应部分选取内容。

每部分保持 2-3 个不长的句子。不要用信息淹没用户。不要提及下方会话数据中的具体数字统计或标注类别。使用教练式的语气。

请仅返回一个有效的 JSON 对象：
{
  "whats_working": "（参考上方说明）",
  "whats_hindering": "（参考上方说明）",
  "quick_wins": "（参考上方说明）",
  "ambitious_workflows": "（参考上方说明）"
}

会话数据：
${fullContext}

## 项目领域（用户的工作内容）
${projectAreasText}

## 重大成果（令人印象深刻的成就）
${bigWinsText}

## 摩擦类别（出现问题的地方）
${frictionText}

## 值得尝试的功能
${featuresText}

## 值得采纳的使用模式
${patternsText}

## 未来展望（面向更强模型的进阶工作流）
${horizonText}`

  const atAGlanceSection: InsightSection = {
    name: 'at_a_glance',
    prompt: atAGlancePrompt,
    maxTokens: 8192,
  }

  const atAGlanceResult = await generateSectionInsight(atAGlanceSection, '')
  if (atAGlanceResult.result) {
    insights.at_a_glance = atAGlanceResult.result as {
      whats_working?: string
      whats_hindering?: string
      quick_wins?: string
      ambitious_workflows?: string
    }
  }

  return insights
}

// 转义 HTML 但将 **加粗** 渲染为 <strong>
function escapeHtmlWithBold(text: string): string {
  const escaped = escapeHtml(text)
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

// 特定图表的固定顺序（与 Python 参考实现一致）
const SATISFACTION_ORDER = [
  'frustrated',
  'dissatisfied',
  'likely_satisfied',
  'satisfied',
  'happy',
  'unsure',
]

const OUTCOME_ORDER = [
  'not_achieved',
  'partially_achieved',
  'mostly_achieved',
  'fully_achieved',
  'unclear_from_transcript',
]

function generateBarChart(
  data: Record<string, number>,
  color: string,
  maxItems = 6,
  fixedOrder?: string[],
): string {
  let entries: [string, number][]

  if (fixedOrder) {
    // 使用固定顺序，仅包含数据中存在的项
    entries = fixedOrder
      .filter(key => key in data && (data[key] ?? 0) > 0)
      .map(key => [key, data[key] ?? 0] as [string, number])
  } else {
    // 按数量降序排列
    entries = Object.entries(data)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxItems)
  }

  if (entries.length === 0) return '<p class="empty">暂无数据</p>'

  const maxVal = Math.max(...entries.map(e => e[1]))
  return entries
    .map(([label, count]) => {
      const pct = (count / maxVal) * 100
      // 使用 LABEL_MAP（如有），否则替换下划线并转换为首字母大写
      const cleanLabel =
        LABEL_MAP[label] ||
        label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      return `<div class="bar-row">
        <div class="bar-label">${escapeHtml(cleanLabel)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="bar-value">${count}</div>
      </div>`
    })
    .join('\n')
}

function generateResponseTimeHistogram(times: number[]): string {
  if (times.length === 0) return '<p class="empty">无响应时间数据</p>'

  // 创建时间桶（与 Python 参考实现一致）
  const buckets: Record<string, number> = {
    '2-10s': 0,
    '10-30s': 0,
    '30s-1m': 0,
    '1-2m': 0,
    '2-5m': 0,
    '5-15m': 0,
    '>15m': 0,
  }

  for (const t of times) {
    if (t < 10) buckets['2-10s'] = (buckets['2-10s'] ?? 0) + 1
    else if (t < 30) buckets['10-30s'] = (buckets['10-30s'] ?? 0) + 1
    else if (t < 60) buckets['30s-1m'] = (buckets['30s-1m'] ?? 0) + 1
    else if (t < 120) buckets['1-2m'] = (buckets['1-2m'] ?? 0) + 1
    else if (t < 600) buckets['2-6m'] = (buckets['2-6m'] ?? 0) + 1
    else if (t < 900) buckets['6-15m'] = (buckets['6-15m'] ?? 0) + 1
    else buckets['>15m'] = (buckets['>15m'] ?? 0) + 1
  }

  const maxVal = Math.max(...Object.values(buckets))
  if (maxVal === 0) return '<p class="empty">无响应时间数据</p>'

  return Object.entries(buckets)
    .map(([label, count]) => {
      const pct = (count / maxVal) * 100
      return `<div class="bar-row">
        <div class="bar-label">${label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:#6366f1"></div></div>
        <div class="bar-value">${count}</div>
      </div>`
    })
    .join('\n')
}

function generateTimeOfDayChart(messageHours: number[]): string {
  if (messageHours.length === 0) return '<p class="empty">无时间数据</p>'

  // 按时间段分组
  const periods = [
    { label: '上午 (6-12)', range: [6, 7, 8, 9, 10, 11] },
    { label: '下午 (12-18)', range: [12, 13, 14, 15, 16, 17] },
    { label: '傍晚 (18-24)', range: [18, 19, 20, 21, 22, 23] },
    { label: '夜间 (0-6)', range: [0, 1, 2, 3, 4, 5] },
  ]

  const hourCounts: Record<number, number> = {}
  for (const h of messageHours) {
    hourCounts[h] = (hourCounts[h] || 0) + 1
  }

  const periodCounts = periods.map(p => ({
    label: p.label,
    count: p.range.reduce((sum, h) => sum + (hourCounts[h] || 0), 0),
  }))

  const maxVal = Math.max(...periodCounts.map(p => p.count)) || 1

  const barsHtml = periodCounts
    .map(
      p => `
      <div class="bar-row">
        <div class="bar-label">${p.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(p.count / maxVal) * 100}%;background:#8b5cf6"></div></div>
        <div class="bar-value">${p.count}</div>
      </div>`,
    )
    .join('\n')

  return `<div id="hour-histogram">${barsHtml}</div>`
}

function getHourCountsJson(messageHours: number[]): string {
  const hourCounts: Record<number, number> = {}
  for (const h of messageHours) {
    hourCounts[h] = (hourCounts[h] || 0) + 1
  }
  return jsonStringify(hourCounts)
}

function generateHtmlReport(
  data: AggregatedData,
  insights: InsightResults,
): string {
  const markdownToHtml = (md: string): string => {
    if (!md) return ''
    return md
      .split('\n\n')
      .map(p => {
        let html = escapeHtml(p)
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        html = html.replace(/^- /gm, '• ')
        html = html.replace(/\n/g, '<br>')
        return `<p>${html}</p>`
      })
      .join('\n')
  }

  // 构建概览章节（4 部分格式，带章节链接）
  const atAGlance = insights.at_a_glance
	const atAGlanceHtml = atAGlance
	  ? `
		<div class="at-a-glance">
		  <div class="glance-title">概览</div>
		  <div class="glance-sections">
			${atAGlance.whats_working ? `<div class="glance-section"><strong>做得好的方面：</strong> ${escapeHtmlWithBold(atAGlance.whats_working)} <a href="#section-wins" class="see-more">令人印象深刻的成就 →</a></div>` : ''}
			${atAGlance.whats_hindering ? `<div class="glance-section"><strong>阻碍您的方面：</strong> ${escapeHtmlWithBold(atAGlance.whats_hindering)} <a href="#section-friction" class="see-more">问题出在哪里 →</a></div>` : ''}
			${atAGlance.quick_wins ? `<div class="glance-section"><strong>值得一试的小改进：</strong> ${escapeHtmlWithBold(atAGlance.quick_wins)} <a href="#section-features" class="see-more">值得尝试的功能 →</a></div>` : ''}
			${atAGlance.ambitious_workflows ? `<div class="glance-section"><strong>面向未来的高阶工作流：</strong> ${escapeHtmlWithBold(atAGlance.ambitious_workflows)} <a href="#section-horizon" class="see-more">未来展望 →</a></div>` : ''}
		  </div>
		</div>
    `
    : ''

  // 构建项目领域章节
  const projectAreas = insights.project_areas?.areas || []
const projectAreasHtml =
  projectAreas.length > 0
    ? `
    <h2 id="section-work">您的工作内容</h2>
    <div class="project-areas">
      ${projectAreas
        .map(
          area => `
        <div class="project-area">
          <div class="area-header">
            <span class="area-name">${escapeHtml(area.name)}</span>
            <span class="area-count">约 ${area.session_count} 个会话</span>
          </div>
          <div class="area-desc">${escapeHtml(area.description)}</div>
        </div>
      `,
        )
        .join('')}
    </div>
    `
      : ''

  // 构建交互风格章节
  const interactionStyle = insights.interaction_style
const interactionHtml = interactionStyle?.narrative
  ? `
    <h2 id="section-usage">您使用 Claude Code 的方式</h2>
    <div class="narrative">
      ${markdownToHtml(interactionStyle.narrative)}
      ${interactionStyle.key_pattern ? `<div class="key-insight"><strong>关键模式：</strong> ${escapeHtml(interactionStyle.key_pattern)}</div>` : ''}
    </div>
    `
    : ''

  // 构建突出成就章节
  const whatWorks = insights.what_works
const whatWorksHtml =
  whatWorks?.impressive_workflows && whatWorks.impressive_workflows.length > 0
    ? `
    <h2 id="section-wins">令人印象深刻的成就</h2>
    ${whatWorks.intro ? `<p class="section-intro">${escapeHtml(whatWorks.intro)}</p>` : ''}
    <div class="big-wins">
      ${whatWorks.impressive_workflows
        .map(
          wf => `
        <div class="big-win">
          <div class="big-win-title">${escapeHtml(wf.title || '')}</div>
          <div class="big-win-desc">${escapeHtml(wf.description || '')}</div>
        </div>
      `,
        )
        .join('')}
    </div>
    `
      : ''

  // 构建摩擦分析章节
  const frictionAnalysis = insights.friction_analysis
const frictionHtml =
  frictionAnalysis?.categories && frictionAnalysis.categories.length > 0
    ? `
    <h2 id="section-friction">问题出在哪里</h2>
    ${frictionAnalysis.intro ? `<p class="section-intro">${escapeHtml(frictionAnalysis.intro)}</p>` : ''}
    <div class="friction-categories">
      ${frictionAnalysis.categories
        .map(
          cat => `
        <div class="friction-category">
          <div class="friction-title">${escapeHtml(cat.category || '')}</div>
          <div class="friction-desc">${escapeHtml(cat.description || '')}</div>
          ${cat.examples ? `<ul class="friction-examples">${cat.examples.map(ex => `<li>${escapeHtml(ex)}</li>`).join('')}</ul>` : ''}
        </div>
      `,
        )
        .join('')}
    </div>
    `
      : ''

  // 构建建议章节
  const suggestions = insights.suggestions
 const suggestionsHtml = suggestions
  ? `
    ${
      suggestions.claude_md_additions &&
      suggestions.claude_md_additions.length > 0
        ? `
    <h2 id="section-features">值得尝试的现有功能</h2>
    <div class="claude-md-section">
      <h3>建议添加到 CLAUDE.md 的内容</h3>
      <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">直接复制到 Claude Code 即可添加到 CLAUDE.md 文件中。</p>
      <div class="claude-md-actions">
        <button class="copy-all-btn" onclick="copyAllCheckedClaudeMd()">复制已选中的全部项</button>
      </div>
      ${suggestions.claude_md_additions
        .map(
          (add, i) => `
        <div class="claude-md-item">
          <input type="checkbox" id="cmd-${i}" class="cmd-checkbox" checked data-text="${escapeHtml(add.prompt_scaffold || add.where || '添加到 CLAUDE.md')}\\n\\n${escapeHtml(add.addition)}">
          <label for="cmd-${i}">
            <code class="cmd-code">${escapeHtml(add.addition)}</code>
            <button class="copy-btn" onclick="copyCmdItem(${i})">复制</button>
          </label>
          <div class="cmd-why">${escapeHtml(add.why)}</div>
        </div>
      `,
        )
        .join('')}
    </div>
    `
        : ''
    }
    ${
      suggestions.features_to_try && suggestions.features_to_try.length > 0
        ? `
    <p style="font-size: 13px; color: #64748b; margin-bottom: 12px;">直接复制到 Claude Code 即可完成设置。</p>
    <div class="features-section">
      ${suggestions.features_to_try
        .map(
          feat => `
        <div class="feature-card">
          <div class="feature-title">${escapeHtml(feat.feature || '')}</div>
          <div class="feature-oneliner">${escapeHtml(feat.one_liner || '')}</div>
          <div class="feature-why"><strong>为什么适合您：</strong> ${escapeHtml(feat.why_for_you || '')}</div>
          ${
            feat.example_code
              ? `
          <div class="feature-examples">
            <div class="feature-example">
              <div class="example-code-row">
                <code class="example-code">${escapeHtml(feat.example_code)}</code>
                <button class="copy-btn" onclick="copyText(this)">复制</button>
              </div>
            </div>
          </div>
          `
              : ''
          }
        </div>
      `,
        )
        .join('')}
    </div>
    `
        : ''
    }
    ${
      suggestions.usage_patterns && suggestions.usage_patterns.length > 0
        ? `
    <h2 id="section-patterns">新的使用模式</h2>
    <p style="font-size: 13px; color: #64748b; margin-bottom: 12px;">直接复制到 Claude Code 中，它会引导您完成操作。</p>
    <div class="patterns-section">
      ${suggestions.usage_patterns
        .map(
          pat => `
        <div class="pattern-card">
          <div class="pattern-title">${escapeHtml(pat.title || '')}</div>
          <div class="pattern-summary">${escapeHtml(pat.suggestion || '')}</div>
          ${pat.detail ? `<div class="pattern-detail">${escapeHtml(pat.detail)}</div>` : ''}
          ${
            pat.copyable_prompt
              ? `
          <div class="copyable-prompt-section">
            <div class="prompt-label">粘贴到 Claude Code 中：</div>
            <div class="copyable-prompt-row">
              <code class="copyable-prompt">${escapeHtml(pat.copyable_prompt)}</code>
              <button class="copy-btn" onclick="copyText(this)">复制</button>
            </div>
          </div>
          `
              : ''
          }
        </div>
      `,
        )
        .join('')}
    </div>
    `
        : ''
    }
    `
  : ''

  // 构建未来展望章节
  const horizonData = insights.on_the_horizon
 const horizonHtml =
  horizonData?.opportunities && horizonData.opportunities.length > 0
    ? `
    <h2 id="section-horizon">未来展望</h2>
    ${horizonData.intro ? `<p class="section-intro">${escapeHtml(horizonData.intro)}</p>` : ''}
    <div class="horizon-section">
      ${horizonData.opportunities
        .map(
          opp => `
        <div class="horizon-card">
          <div class="horizon-title">${escapeHtml(opp.title || '')}</div>
          <div class="horizon-possible">${escapeHtml(opp.whats_possible || '')}</div>
          ${opp.how_to_try ? `<div class="horizon-tip"><strong>入门指南：</strong> ${escapeHtml(opp.how_to_try)}</div>` : ''}
          ${opp.copyable_prompt ? `<div class="pattern-prompt"><div class="prompt-label">粘贴到 Claude Code 中：</div><code>${escapeHtml(opp.copyable_prompt)}</code><button class="copy-btn" onclick="copyText(this)">复制</button></div>` : ''}
        </div>
      `,
        )
        .join('')}
    </div>
    `
      : ''

  // 构建团队反馈章节（可折叠，仅 Ant 内部用户）
  const ccImprovements =
    process.env.USER_TYPE === 'ant'
      ? insights.cc_team_improvements?.improvements || []
      : []
  const modelImprovements =
    process.env.USER_TYPE === 'ant'
      ? insights.model_behavior_improvements?.improvements || []
      : []
 const teamFeedbackHtml =
  ccImprovements.length > 0 || modelImprovements.length > 0
    ? `
    <h2 id="section-feedback" class="feedback-header">反馈闭环：给其他团队的建议</h2>
    <p class="feedback-intro">基于您的使用模式，为 CC 产品团队和模型团队提出的改进建议。点击展开查看。</p>
    ${
      ccImprovements.length > 0
        ? `
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapsible(this)">
        <span class="collapsible-arrow">▶</span>
        <h3>给 CC 产品团队的产品改进建议</h3>
      </div>
      <div class="collapsible-content">
        <div class="suggestions-section">
          ${ccImprovements
            .map(
              imp => `
            <div class="feedback-card team-card">
              <div class="feedback-title">${escapeHtml(imp.title || '')}</div>
              <div class="feedback-detail">${escapeHtml(imp.detail || '')}</div>
              ${imp.evidence ? `<div class="feedback-evidence"><em>证据：</em> ${escapeHtml(imp.evidence)}</div>` : ''}
            </div>
          `,
            )
            .join('')}
        </div>
      </div>
    </div>
    `
        : ''
    }
    ${
      modelImprovements.length > 0
        ? `
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapsible(this)">
        <span class="collapsible-arrow">▶</span>
        <h3>模型行为改进建议</h3>
      </div>
      <div class="collapsible-content">
        <div class="suggestions-section">
          ${modelImprovements
            .map(
              imp => `
            <div class="feedback-card model-card">
              <div class="feedback-title">${escapeHtml(imp.title || '')}</div>
              <div class="feedback-detail">${escapeHtml(imp.detail || '')}</div>
              ${imp.evidence ? `<div class="feedback-evidence"><em>证据：</em> ${escapeHtml(imp.evidence)}</div>` : ''}
            </div>
          `,
            )
            .join('')}
        </div>
      </div>
    </div>
    `
        : ''
    }
    `
    : ''

  // 构建趣味结尾章节
  const funEnding = insights.fun_ending
const funEndingHtml = funEnding?.headline
  ? `
    <div class="fun-ending">
      <div class="fun-headline">“${escapeHtml(funEnding.headline)}”</div>
      ${funEnding.detail ? `<div class="fun-detail">${escapeHtml(funEnding.detail)}</div>` : ''}
    </div>
    `
  : ''

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; color: #334155; line-height: 1.65; padding: 48px 24px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 32px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
    h2 { font-size: 20px; font-weight: 600; color: #0f172a; margin-top: 48px; margin-bottom: 16px; }
    .subtitle { color: #64748b; font-size: 15px; margin-bottom: 32px; }
    .nav-toc { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0 32px 0; padding: 16px; background: white; border-radius: 8px; border: 1px solid #e2e8f0; }
    .nav-toc a { font-size: 12px; color: #64748b; text-decoration: none; padding: 6px 12px; border-radius: 6px; background: #f1f5f9; transition: all 0.15s; }
    .nav-toc a:hover { background: #e2e8f0; color: #334155; }
    .stats-row { display: flex; gap: 24px; margin-bottom: 40px; padding: 20px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
    .stat { text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; color: #0f172a; }
    .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
    .at-a-glance { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #f59e0b; border-radius: 12px; padding: 20px 24px; margin-bottom: 32px; }
    .glance-title { font-size: 16px; font-weight: 700; color: #92400e; margin-bottom: 16px; }
    .glance-sections { display: flex; flex-direction: column; gap: 12px; }
    .glance-section { font-size: 14px; color: #78350f; line-height: 1.6; }
    .glance-section strong { color: #92400e; }
    .see-more { color: #b45309; text-decoration: none; font-size: 13px; white-space: nowrap; }
    .see-more:hover { text-decoration: underline; }
    .project-areas { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }
    .project-area { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .area-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .area-name { font-weight: 600; font-size: 15px; color: #0f172a; }
    .area-count { font-size: 12px; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; }
    .area-desc { font-size: 14px; color: #475569; line-height: 1.5; }
    .narrative { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .narrative p { margin-bottom: 12px; font-size: 14px; color: #475569; line-height: 1.7; }
    .key-insight { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-top: 12px; font-size: 14px; color: #166534; }
    .section-intro { font-size: 14px; color: #64748b; margin-bottom: 16px; }
    .big-wins { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
    .big-win { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; }
    .big-win-title { font-weight: 600; font-size: 15px; color: #166534; margin-bottom: 8px; }
    .big-win-desc { font-size: 14px; color: #15803d; line-height: 1.5; }
    .friction-categories { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
    .friction-category { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 16px; }
    .friction-title { font-weight: 600; font-size: 15px; color: #991b1b; margin-bottom: 6px; }
    .friction-desc { font-size: 13px; color: #7f1d1d; margin-bottom: 10px; }
    .friction-examples { margin: 0 0 0 20px; font-size: 13px; color: #334155; }
    .friction-examples li { margin-bottom: 4px; }
    .claude-md-section { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .claude-md-section h3 { font-size: 14px; font-weight: 600; color: #1e40af; margin: 0 0 12px 0; }
    .claude-md-actions { margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #dbeafe; }
    .copy-all-btn { background: #2563eb; color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 12px; cursor: pointer; font-weight: 500; transition: all 0.2s; }
    .copy-all-btn:hover { background: #1d4ed8; }
    .copy-all-btn.copied { background: #16a34a; }
    .claude-md-item { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; padding: 10px 0; border-bottom: 1px solid #dbeafe; }
    .claude-md-item:last-child { border-bottom: none; }
    .cmd-checkbox { margin-top: 2px; }
    .cmd-code { background: white; padding: 8px 12px; border-radius: 4px; font-size: 12px; color: #1e40af; border: 1px solid #bfdbfe; font-family: monospace; display: block; white-space: pre-wrap; word-break: break-word; flex: 1; }
    .cmd-why { font-size: 12px; color: #64748b; width: 100%; padding-left: 24px; margin-top: 4px; }
    .features-section, .patterns-section { display: flex; flex-direction: column; gap: 12px; margin: 16px 0; }
    .feature-card { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; }
    .pattern-card { background: #f0f9ff; border: 1px solid #7dd3fc; border-radius: 8px; padding: 16px; }
    .feature-title, .pattern-title { font-weight: 600; font-size: 15px; color: #0f172a; margin-bottom: 6px; }
    .feature-oneliner { font-size: 14px; color: #475569; margin-bottom: 8px; }
    .pattern-summary { font-size: 14px; color: #475569; margin-bottom: 8px; }
    .feature-why, .pattern-detail { font-size: 13px; color: #334155; line-height: 1.5; }
    .feature-examples { margin-top: 12px; }
    .feature-example { padding: 8px 0; border-top: 1px solid #d1fae5; }
    .feature-example:first-child { border-top: none; }
    .example-desc { font-size: 13px; color: #334155; margin-bottom: 6px; }
    .example-code-row { display: flex; align-items: flex-start; gap: 8px; }
    .example-code { flex: 1; background: #f1f5f9; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #334155; overflow-x: auto; white-space: pre-wrap; }
    .copyable-prompt-section { margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
    .copyable-prompt-row { display: flex; align-items: flex-start; gap: 8px; }
    .copyable-prompt { flex: 1; background: #f8fafc; padding: 10px 12px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #334155; border: 1px solid #e2e8f0; white-space: pre-wrap; line-height: 1.5; }
    .feature-code { background: #f8fafc; padding: 12px; border-radius: 6px; margin-top: 12px; border: 1px solid #e2e8f0; display: flex; align-items: flex-start; gap: 8px; }
    .feature-code code { flex: 1; font-family: monospace; font-size: 12px; color: #334155; white-space: pre-wrap; }
    .pattern-prompt { background: #f8fafc; padding: 12px; border-radius: 6px; margin-top: 12px; border: 1px solid #e2e8f0; }
    .pattern-prompt code { font-family: monospace; font-size: 12px; color: #334155; display: block; white-space: pre-wrap; margin-bottom: 8px; }
    .prompt-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
    .copy-btn { background: #e2e8f0; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer; color: #475569; flex-shrink: 0; }
    .copy-btn:hover { background: #cbd5e1; }
    .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
    .chart-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .chart-title { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 12px; }
    .bar-row { display: flex; align-items: center; margin-bottom: 6px; }
    .bar-label { width: 100px; font-size: 11px; color: #475569; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { flex: 1; height: 6px; background: #f1f5f9; border-radius: 3px; margin: 0 8px; }
    .bar-fill { height: 100%; border-radius: 3px; }
    .bar-value { width: 28px; font-size: 11px; font-weight: 500; color: #64748b; text-align: right; }
    .empty { color: #94a3b8; font-size: 13px; }
    .horizon-section { display: flex; flex-direction: column; gap: 16px; }
    .horizon-card { background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%); border: 1px solid #c4b5fd; border-radius: 8px; padding: 16px; }
    .horizon-title { font-weight: 600; font-size: 15px; color: #5b21b6; margin-bottom: 8px; }
    .horizon-possible { font-size: 14px; color: #334155; margin-bottom: 10px; line-height: 1.5; }
    .horizon-tip { font-size: 13px; color: #6b21a8; background: rgba(255,255,255,0.6); padding: 8px 12px; border-radius: 4px; }
    .feedback-header { margin-top: 48px; color: #64748b; font-size: 16px; }
    .feedback-intro { font-size: 13px; color: #94a3b8; margin-bottom: 16px; }
    .feedback-section { margin-top: 16px; }
    .feedback-section h3 { font-size: 14px; font-weight: 600; color: #475569; margin-bottom: 12px; }
    .feedback-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .feedback-card.team-card { background: #eff6ff; border-color: #bfdbfe; }
    .feedback-card.model-card { background: #faf5ff; border-color: #e9d5ff; }
    .feedback-title { font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 6px; }
    .feedback-detail { font-size: 13px; color: #475569; line-height: 1.5; }
    .feedback-evidence { font-size: 12px; color: #64748b; margin-top: 8px; }
    .fun-ending { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #fbbf24; border-radius: 12px; padding: 24px; margin-top: 40px; text-align: center; }
    .fun-headline { font-size: 18px; font-weight: 600; color: #78350f; margin-bottom: 8px; }
    .fun-detail { font-size: 14px; color: #92400e; }
    .collapsible-section { margin-top: 16px; }
    .collapsible-header { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 12px 0; border-bottom: 1px solid #e2e8f0; }
    .collapsible-header h3 { margin: 0; font-size: 14px; font-weight: 600; color: #475569; }
    .collapsible-arrow { font-size: 12px; color: #94a3b8; transition: transform 0.2s; }
    .collapsible-content { display: none; padding-top: 16px; }
    .collapsible-content.open { display: block; }
    .collapsible-header.open .collapsible-arrow { transform: rotate(90deg); }
    @media (max-width: 640px) { .charts-row { grid-template-columns: 1fr; } .stats-row { justify-content: center; } }
  `

  const hourCountsJson = getHourCountsJson(data.message_hours)

  const js = `
    function toggleCollapsible(header) {
      header.classList.toggle('open');
      const content = header.nextElementSibling;
      content.classList.toggle('open');
    }
    function copyText(btn) {
      const code = btn.previousElementSibling;
      navigator.clipboard.writeText(code.textContent).then(() => {
        btn.textContent = '已复制!';
        setTimeout(() => { btn.textContent = '复制'; }, 2000);
      });
    }
    function copyCmdItem(idx) {
      const checkbox = document.getElementById('cmd-' + idx);
      if (checkbox) {
        const text = checkbox.dataset.text;
        navigator.clipboard.writeText(text).then(() => {
          const btn = checkbox.nextElementSibling.querySelector('.copy-btn');
          if (btn) { btn.textContent = '已复制!'; setTimeout(() => { btn.textContent = '复制'; }, 2000); }
        });
      }
    }
    function copyAllCheckedClaudeMd() {
      const checkboxes = document.querySelectorAll('.cmd-checkbox:checked');
      const texts = [];
      checkboxes.forEach(cb => {
        if (cb.dataset.text) { texts.push(cb.dataset.text); }
      });
      const combined = texts.join('\\n');
      const btn = document.querySelector('.copy-all-btn');
      if (btn) {
        navigator.clipboard.writeText(combined).then(() => {
          btn.textContent = '已复制 ' + texts.length + ' 项！';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = '复制已选中的全部项'; btn.classList.remove('copied'); }, 2000);
        });
      }
    }
    // 时段分布图的时区选择器（数据来自自有分析，非用户输入）
    const rawHourCounts = ${hourCountsJson};
    function updateHourHistogram(offsetFromPT) {
      const periods = [
		  { label: "上午 (6-12)", range: [6,7,8,9,10,11] },
		  { label: "下午 (12-18)", range: [12,13,14,15,16,17] },
		  { label: "晚间 (18-24)", range: [18,19,20,21,22,23] },
		  { label: "深夜 (0-6)", range: [0,1,2,3,4,5] }
      ];
      const adjustedCounts = {};
      for (const [hour, count] of Object.entries(rawHourCounts)) {
        const newHour = (parseInt(hour) + offsetFromPT + 24) % 24;
        adjustedCounts[newHour] = (adjustedCounts[newHour] || 0) + count;
      }
      const periodCounts = periods.map(p => ({
        label: p.label,
        count: p.range.reduce((sum, h) => sum + (adjustedCounts[h] || 0), 0)
      }));
      const maxCount = Math.max(...periodCounts.map(p => p.count)) || 1;
      const container = document.getElementById('hour-histogram');
      container.textContent = '';
      periodCounts.forEach(p => {
        const row = document.createElement('div');
        row.className = 'bar-row';
        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = p.label;
        const track = document.createElement('div');
        track.className = 'bar-track';
        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        fill.style.width = (p.count / maxCount) * 100 + '%';
        fill.style.background = '#8b5cf6';
        track.appendChild(fill);
        const value = document.createElement('div');
        value.className = 'bar-value';
        value.textContent = p.count;
        row.appendChild(label);
        row.appendChild(track);
        row.appendChild(value);
        container.appendChild(row);
      });
    }
    document.getElementById('timezone-select').addEventListener('change', function() {
      const customInput = document.getElementById('custom-offset');
      if (this.value === 'custom') {
        customInput.style.display = 'inline-block';
        customInput.focus();
      } else {
        customInput.style.display = 'none';
        updateHourHistogram(parseInt(this.value));
      }
    });
    document.getElementById('custom-offset').addEventListener('change', function() {
      const offset = parseInt(this.value) + 8;
      updateHourHistogram(offset);
    });
  `

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Claude Code Insights</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body>
  <div class="container">
    <h1>Claude Code Insights</h1>
		<p class="subtitle">共 ${data.total_messages.toLocaleString()} 条消息 · ${data.total_sessions} 个会话${data.total_sessions_scanned && data.total_sessions_scanned > data.total_sessions ? ` (共扫描 ${data.total_sessions_scanned.toLocaleString()} 个)` : ''} · ${data.date_range.start} 至 ${data.date_range.end} </p>
    ${atAGlanceHtml}

	<nav class="nav-toc">
	  <a href="#section-work">您的工作内容</a>
	  <a href="#section-usage">您的使用方式</a>
	  <a href="#section-wins">突出成就</a>
	  <a href="#section-friction">摩擦与问题</a>
	  <a href="#section-features">功能推荐</a>
	  <a href="#section-patterns">使用模式</a>
	  <a href="#section-horizon">未来展望</a>
	  <a href="#section-feedback">团队反馈</a>
	</nav>

    <div class="stats-row">
      <div class="stat"><div class="stat-value">${data.total_messages.toLocaleString()}</div><div class="stat-label">消息总数</div></div>
      <div class="stat"><div class="stat-value">+${data.total_lines_added.toLocaleString()}/-${data.total_lines_removed.toLocaleString()}</div><div class="stat-label">增/删行数</div></div>
      <div class="stat"><div class="stat-value">${data.total_files_modified}</div><div class="stat-label">修改文件数</div></div>
      <div class="stat"><div class="stat-value">${data.days_active}</div><div class="stat-label">活跃天数</div></div>
      <div class="stat"><div class="stat-value">${data.messages_per_day}</div><div class="stat-label">日均消息</div></div>
    </div>

    ${projectAreasHtml}

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">任务类别</div>
        ${generateBarChart(data.goal_categories, '#2563eb')}
      </div>
      <div class="chart-card">
        <div class="chart-title">最常用工具</div>
        ${generateBarChart(data.tool_counts, '#0891b2')}
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">编程语言</div>
        ${generateBarChart(data.languages, '#10b981')}
      </div>
      <div class="chart-card">
        <div class="chart-title">会话类型</div>
        ${generateBarChart(data.session_types || {}, '#8b5cf6')}
      </div>
    </div>

    ${interactionHtml}

    <!-- Response Time Distribution -->
    <div class="chart-card" style="margin: 24px 0;">
      <div class="chart-title">用户响应时间分布</div>
      ${generateResponseTimeHistogram(data.user_response_times)}
      <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
        中位数：${data.median_response_time.toFixed(1)}秒 · 平均值：${data.avg_response_time.toFixed(1)}秒
      </div>
    </div>

    <!-- Multi-clauding Section (matching Python reference) -->
    <div class="chart-card" style="margin: 24px 0;">
      <div class="chart-title">并行会话 (多开 Claude Code)</div>
      ${
        data.multi_clauding.overlap_events === 0
          ? `
        <p style="font-size: 14px; color: #64748b; padding: 8px 0;">
          未检测到并行会话。您通常一次只使用一个 Claude Code 会话。
        </p>
      `
          : `
        <div style="display: flex; gap: 24px; margin: 12px 0;">
          <div style="text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${data.multi_clauding.overlap_events}</div>
            <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">重叠事件数</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${data.multi_clauding.sessions_involved}</div>
            <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">涉及会话数</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${data.total_messages > 0 ? Math.round((100 * data.multi_clauding.user_messages_during) / data.total_messages) : 0}%</div>
            <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">消息占比</div>
          </div>
        </div>
        <p style="font-size: 13px; color: #475569; margin-top: 12px;">
			您同时运行了多个 Claude Code 会话。当会话在时间上重叠时，即检测到并行使用，这表明存在并行工作流。
        </p>
      `
      }
    </div>

    <!-- Time of Day & Tool Errors -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title" style="display: flex; align-items: center; gap: 12px;">
          用户消息时段分布
          <select id="timezone-select" style="font-size: 12px; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
			<option value="0">太平洋时间 (UTC-8)</option>
			<option value="3">东部时间 (UTC-5)</option>
			<option value="8">伦敦 (UTC+0)</option>
			<option value="9">中欧时间 (UTC+1)</option>
			<option value="17">东京 (UTC+9)</option>
			<option value="custom">自定义偏移...</option>
          </select>
          <input type="number" id="custom-offset" placeholder="UTC 偏移" style="display: none; width: 80px; font-size: 12px; padding: 4px; border-radius: 4px; border: 1px solid #e2e8f0;">
        </div>
        ${generateTimeOfDayChart(data.message_hours)}
      </div>
      <div class="chart-card">
        <div class="chart-title">工具错误类型</div>
        ${Object.keys(data.tool_error_categories).length > 0 ? generateBarChart(data.tool_error_categories, '#dc2626') : '<p class="empty">无工具错误</p>'}
      </div>
    </div>

    ${whatWorksHtml}

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">Claude 的能力贡献</div>
        ${generateBarChart(data.success, '#16a34a')}
      </div>
      <div class="chart-card">
        <div class="chart-title">任务达成情况</div>
        ${generateBarChart(data.outcomes, '#8b5cf6', 6, OUTCOME_ORDER)}
      </div>
    </div>

    ${frictionHtml}

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">主要摩擦类型</div>
        ${generateBarChart(data.friction, '#dc2626')}
      </div>
      <div class="chart-card">
        <div class="chart-title">推断满意度 (模型估算)</div>
        ${generateBarChart(data.satisfaction, '#eab308', 6, SATISFACTION_ORDER)}
      </div>
    </div>

    ${suggestionsHtml}

    ${horizonHtml}

    ${funEndingHtml}

    ${teamFeedbackHtml}
  </div>
  <script>${js}</script>
</body>
</html>`
}

// ============================================================================
// 导出类型与函数
// ============================================================================

/**
 * 结构化导出格式，供 claudescope 使用
 */
export type InsightsExport = {
  metadata: {
    username: string
    generated_at: string
    claude_code_version: string
    date_range: { start: string; end: string }
    session_count: number
    remote_hosts_collected?: string[]
  }
  aggregated_data: AggregatedData
  insights: InsightResults
  facets_summary?: {
    total: number
    goal_categories: Record<string, number>
    outcomes: Record<string, number>
    satisfaction: Record<string, number>
    friction: Record<string, number>
  }
}

/**
 * 从已计算的值构建导出数据。
 * 用于后台上传到 S3。
 */
export function buildExportData(
  data: AggregatedData,
  insights: InsightResults,
  facets: Map<string, SessionFacets>,
  remoteStats?: { hosts: RemoteHostInfo[]; totalCopied: number },
): InsightsExport {
  const version = typeof MACRO !== 'undefined' ? MACRO.VERSION : 'unknown'

  const remote_hosts_collected = remoteStats?.hosts
    .filter(h => h.sessionCount > 0)
    .map(h => h.name)

  const facets_summary = {
    total: facets.size,
    goal_categories: {} as Record<string, number>,
    outcomes: {} as Record<string, number>,
    satisfaction: {} as Record<string, number>,
    friction: {} as Record<string, number>,
  }
  for (const f of facets.values()) {
    for (const [cat, count] of safeEntries(f.goal_categories)) {
      if (count > 0) {
        facets_summary.goal_categories[cat] =
          (facets_summary.goal_categories[cat] || 0) + count
      }
    }
    facets_summary.outcomes[f.outcome] =
      (facets_summary.outcomes[f.outcome] || 0) + 1
    for (const [level, count] of safeEntries(f.user_satisfaction_counts)) {
      if (count > 0) {
        facets_summary.satisfaction[level] =
          (facets_summary.satisfaction[level] || 0) + count
      }
    }
    for (const [type, count] of safeEntries(f.friction_counts)) {
      if (count > 0) {
        facets_summary.friction[type] =
          (facets_summary.friction[type] || 0) + count
      }
    }
  }

  return {
    metadata: {
      username: process.env.SAFEUSER || process.env.USER || 'unknown',
      generated_at: new Date().toISOString(),
      claude_code_version: version,
      date_range: data.date_range,
      session_count: data.total_sessions,
      ...(remote_hosts_collected &&
        remote_hosts_collected.length > 0 && {
          remote_hosts_collected,
        }),
    },
    aggregated_data: data,
    insights,
    facets_summary,
  }
}

// ============================================================================
// 轻量级会话扫描
// ============================================================================

type LiteSessionInfo = {
  sessionId: string
  path: string
  mtime: number
  size: number
}

/**
 * 仅使用文件系统元数据扫描所有项目目录（不解析 JSONL）。
 * 返回按 mtime 降序排列的会话文件信息列表。
 * 在项目目录之间让出事件循环以保持界面响应。
 */
async function scanAllSessions(): Promise<LiteSessionInfo[]> {
  const projectsDir = getProjectsDir()

  let dirents: Awaited<ReturnType<typeof readdir>>
  try {
    dirents = await readdir(projectsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const projectDirs = dirents
    .filter(dirent => dirent.isDirectory())
    .map(dirent => join(projectsDir, dirent.name))

  const allSessions: LiteSessionInfo[] = []

  for (let i = 0; i < projectDirs.length; i++) {
    const sessionFiles = await getSessionFilesWithMtime(projectDirs[i]!)
    for (const [sessionId, fileInfo] of sessionFiles) {
      allSessions.push({
        sessionId,
        path: fileInfo.path,
        mtime: fileInfo.mtime,
        size: fileInfo.size,
      })
    }
    // 每处理 10 个项目目录就让出事件循环
    if (i % 10 === 9) {
      await new Promise<void>(resolve => setImmediate(resolve))
    }
  }

  // 按 mtime 降序排列（最新的在前）
  allSessions.sort((a, b) => b.mtime - a.mtime)
  return allSessions
}

// ============================================================================
// 主函数
// ============================================================================

export async function generateUsageReport(options?: {
  collectRemote?: boolean
}): Promise<{
  insights: InsightResults
  htmlPath: string
  data: AggregatedData
  remoteStats?: { hosts: RemoteHostInfo[]; totalCopied: number }
  facets: Map<string, SessionFacets>
}> {
  let remoteStats: { hosts: RemoteHostInfo[]; totalCopied: number } | undefined

  // 可选：先从远程主机收集数据（仅 Ant 内部用户）
  if (process.env.USER_TYPE === 'ant' && options?.collectRemote) {
    const destDir = join(getClaudeConfigHomeDir(), 'projects')
    const { hosts, totalCopied } = await collectAllRemoteHostData(destDir)
    remoteStats = { hosts, totalCopied }
  }

  // 阶段 1：轻量扫描 — 仅文件系统元数据（不解析 JSONL）
  const allScannedSessions = await scanAllSessions()
  const totalSessionsScanned = allScannedSessions.length

  // 阶段 2：加载 SessionMeta — 优先使用缓存，仅解析未缓存的数据
  // 并行批量读取缓存的元数据，避免阻塞事件循环
  const META_BATCH_SIZE = 50
  const MAX_SESSIONS_TO_LOAD = 200
  let allMetas: SessionMeta[] = []
  const uncachedSessions: LiteSessionInfo[] = []

  for (let i = 0; i < allScannedSessions.length; i += META_BATCH_SIZE) {
    const batch = allScannedSessions.slice(i, i + META_BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async sessionInfo => ({
        sessionInfo,
        cached: await loadCachedSessionMeta(sessionInfo.sessionId),
      })),
    )
    for (const { sessionInfo, cached } of results) {
      if (cached) {
        allMetas.push(cached)
      } else if (uncachedSessions.length < MAX_SESSIONS_TO_LOAD) {
        uncachedSessions.push(sessionInfo)
      }
    }
  }

  // 仅对未缓存的会话加载完整消息数据并计算 SessionMeta
  const logsForFacets = new Map<string, LogOption>()

  // 过滤掉 /insights 元会话（特征提取 API 调用会被记录为会话）
  const isMetaSession = (log: LogOption): boolean => {
    for (const msg of log.messages.slice(0, 5)) {
      if (msg.type === 'user' && msg.message) {
        const content = msg.message.content
        if (typeof content === 'string') {
          if (
            content.includes('RESPOND WITH ONLY A VALID JSON OBJECT') ||
            content.includes('record_facets')
          ) {
            return true
          }
        }
      }
    }
    return false
  }

  // 分批加载未缓存的会话，在批次之间让出事件循环
  const LOAD_BATCH_SIZE = 10
  for (let i = 0; i < uncachedSessions.length; i += LOAD_BATCH_SIZE) {
    const batch = uncachedSessions.slice(i, i + LOAD_BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async sessionInfo => {
        try {
          return await loadAllLogsFromSessionFile(sessionInfo.path)
        } catch {
          return []
        }
      }),
    )
    // 同步收集元数据，然后并行保存（写操作互不依赖）
    const metasToSave: SessionMeta[] = []
    for (const logs of batchResults) {
      for (const log of logs) {
        if (isMetaSession(log) || !hasValidDates(log)) continue
        const meta = logToSessionMeta(log)
        allMetas.push(meta)
        metasToSave.push(meta)
        // 保留日志以备后续特征提取
        logsForFacets.set(meta.session_id, log)
      }
    }
    await Promise.all(metasToSave.map(meta => saveSessionMeta(meta)))
  }

  // 去重会话分支（每个 session_id 保留用户消息最多的那个）
  // 防止因一个会话有多个对话分支而导致总数虚高
  const bestBySession = new Map<string, SessionMeta>()
  for (const meta of allMetas) {
    const existing = bestBySession.get(meta.session_id)
    if (
      !existing ||
      meta.user_message_count > existing.user_message_count ||
      (meta.user_message_count === existing.user_message_count &&
        meta.duration_minutes > existing.duration_minutes)
    ) {
      bestBySession.set(meta.session_id, meta)
    }
  }
  // 用去重后的列表替换 allMetas，并从 logsForFacets 中移除未使用的日志
  const keptSessionIds = new Set(bestBySession.keys())
  allMetas = [...bestBySession.values()]
  for (const sessionId of logsForFacets.keys()) {
    if (!keptSessionIds.has(sessionId)) {
      logsForFacets.delete(sessionId)
    }
  }

  // 按 start_time 降序排列所有元数据（最新的在前）
  allMetas.sort((a, b) => b.start_time.localeCompare(a.start_time))

  // 预过滤明显少量的会话以节省 API 调用
  // （与 Python 的实质性过滤概念一致）
  const isSubstantiveSession = (meta: SessionMeta): boolean => {
    // 跳过用户消息极少的会话
    if (meta.user_message_count < 2) return false
    // 跳过极短的会话（< 1 分钟）
    if (meta.duration_minutes < 1) return false
    return true
  }

  const substantiveMetas = allMetas.filter(isSubstantiveSession)

  // 阶段 3：特征提取 — 仅对没有缓存特征的会话进行处理
  const facets = new Map<string, SessionFacets>()
  const toExtract: Array<{ log: LogOption; sessionId: string }> = []
  const MAX_FACET_EXTRACTIONS = 50

  // 并行加载所有实质性会话的缓存特征
  const cachedFacetResults = await Promise.all(
    substantiveMetas.map(async meta => ({
      sessionId: meta.session_id,
      cached: await loadCachedFacets(meta.session_id),
    })),
  )
  for (const { sessionId, cached } of cachedFacetResults) {
    if (cached) {
      facets.set(sessionId, cached)
    } else {
      const log = logsForFacets.get(sessionId)
      if (log && toExtract.length < MAX_FACET_EXTRACTIONS) {
        toExtract.push({ log, sessionId })
      }
    }
  }

  // 对需要提取特征的会话进行提取（50 并发）
  const CONCURRENCY = 50
  for (let i = 0; i < toExtract.length; i += CONCURRENCY) {
    const batch = toExtract.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async ({ log, sessionId }) => {
        const newFacets = await extractFacetsFromAPI(log, sessionId)
        return { sessionId, newFacets }
      }),
    )
    // 同步收集特征，然后并行保存（写操作互不依赖）
    const facetsToSave: SessionFacets[] = []
    for (const { sessionId, newFacets } of results) {
      if (newFacets) {
        facets.set(sessionId, newFacets)
        facetsToSave.push(newFacets)
      }
    }
    await Promise.all(facetsToSave.map(f => saveFacets(f)))
  }

  // 过滤掉预热/微量会话（与 Python 的 is_minimal 一致）
  // 如果 warmup_minimal 是唯一的目标类别，则该会话视为微量
  const isMinimalSession = (sessionId: string): boolean => {
    const sessionFacets = facets.get(sessionId)
    if (!sessionFacets) return false
    const cats = sessionFacets.goal_categories
    const catKeys = safeKeys(cats).filter(k => (cats[k] ?? 0) > 0)
    return catKeys.length === 1 && catKeys[0] === 'warmup_minimal'
  }

  const substantiveSessions = substantiveMetas.filter(
    s => !isMinimalSession(s.session_id),
  )

  const substantiveFacets = new Map<string, SessionFacets>()
  for (const [sessionId, f] of facets) {
    if (!isMinimalSession(sessionId)) {
      substantiveFacets.set(sessionId, f)
    }
  }

  const aggregated = aggregateData(substantiveSessions, substantiveFacets)
  aggregated.total_sessions_scanned = totalSessionsScanned

  // 从 Claude 并行生成洞察分析（6 个章节）
  const insights = await generateParallelInsights(aggregated, facets)

  // 生成 HTML 报告
  const htmlReport = generateHtmlReport(aggregated, insights)

  // 保存报告
  try {
    await mkdir(getDataDir(), { recursive: true })
  } catch {
    // 目录可能已存在
  }

  const htmlPath = join(getDataDir(), 'report.html')
  await writeFile(htmlPath, htmlReport, {
    encoding: 'utf-8',
    mode: 0o600,
  })

  return {
    insights,
    htmlPath,
    data: aggregated,
    remoteStats,
    facets: substantiveFacets,
  }
}

function safeEntries<V>(
  obj: Record<string, V> | undefined | null,
): [string, V][] {
  return obj ? Object.entries(obj) : []
}

function safeKeys(obj: Record<string, unknown> | undefined | null): string[] {
  return obj ? Object.keys(obj) : []
}

// ============================================================================
// 命令定义
// ============================================================================

const usageReport: Command = {
  type: 'prompt',
  name: 'insights',
  description: '生成分析报告，洞察你的 Claude Code 会话',
  contentLength: 0, // 动态内容
  progressMessage: '正在分析你的会话',
  source: 'builtin',
  async getPromptForCommand(args) {
    let collectRemote = false
    let remoteHosts: string[] = []
    let hasRemoteHosts = false

    if (process.env.USER_TYPE === 'ant') {
      // 解析 --homespaces 参数
      collectRemote = args?.includes('--homespaces') ?? false

      // 检查可用的远程主机
      remoteHosts = await getRunningRemoteHosts()
      hasRemoteHosts = remoteHosts.length > 0

      // 如果正在收集，显示收集信息
      if (collectRemote && hasRemoteHosts) {
        // biome-ignore lint/suspicious/noConsole: intentional
        console.error(
          `Collecting sessions from ${remoteHosts.length} homespace(s): ${remoteHosts.join(', ')}...`,
        )
      }
    }

    const { insights, htmlPath, data, remoteStats } = await generateUsageReport(
      { collectRemote },
    )

    let reportUrl = `file://${htmlPath}`
    let uploadHint = ''

    if (process.env.USER_TYPE === 'ant') {
      // 尝试上传到 S3
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace('T', '_')
        .slice(0, 15)
      const username = process.env.SAFEUSER || process.env.USER || 'unknown'
      const filename = `${username}_insights_${timestamp}.html`
      const s3Path = `s3://anthropic-serve/atamkin/cc-user-reports/${filename}`
      const s3Url = `https://s3-frontend.infra.ant.dev/anthropic-serve/atamkin/cc-user-reports/${filename}`

      reportUrl = s3Url
      try {
        execFileSync('ff', ['cp', htmlPath, s3Path], {
          timeout: 60000,
          stdio: 'pipe', // 抑制输出
        })
      } catch {
        // 上传失败 - 回退到本地文件并显示上传命令
        reportUrl = `file://${htmlPath}`
        uploadHint = `\nAutomatic upload failed. Are you on the boron namespace? Try \`use-bo\` and ensure you've run \`sso\`.
To share, run: ff cp ${htmlPath} ${s3Path}
Then access at: ${s3Url}`
      }
    }

    // 构建带统计数据的头部信息
    const sessionLabel =
      data.total_sessions_scanned &&
      data.total_sessions_scanned > data.total_sessions
        ? `共 ${data.total_sessions_scanned.toLocaleString()} 个会话 · 已分析 ${data.total_sessions} 个`
        : `${data.total_sessions} 个会话`
    const stats = [
      sessionLabel,
      `${data.total_messages.toLocaleString()} 条消息`,
      `${Math.round(data.total_duration_hours)} 小时`,
      `${data.git_commits} 次提交`,
    ].join(' · ')

    // 构建远程主机信息（仅 Ant 内部用户）
    let remoteInfo = ''
    if (process.env.USER_TYPE === 'ant') {
      if (remoteStats && remoteStats.totalCopied > 0) {
        const hsNames = remoteStats.hosts
          .filter(h => h.sessionCount > 0)
          .map(h => h.name)
          .join(', ')
        remoteInfo = `\n_已从以下主机收集 ${remoteStats.totalCopied} 个新会话：${hsNames}_\n`
      } else if (!collectRemote && hasRemoteHosts) {
        // 如果用户有远程主机但未使用 --homespaces 标志，提示使用
        remoteInfo = `\n_提示：运行 \`/insights --homespaces\` 可包含您 ${remoteHosts.length} 个运行中 homespace 的会话_\n`
      }
    }

    // 从洞察结果构建 Markdown 摘要
    const atAGlance = insights.at_a_glance
    const summaryText = atAGlance
  ? `## 概览

${atAGlance.whats_working ? `**做得好的方面：** ${atAGlance.whats_working} 详见「令人印象深刻的成就」。` : ''}

${atAGlance.whats_hindering ? `**阻碍您的方面：** ${atAGlance.whats_hindering} 详见「问题出在哪里」。` : ''}

${atAGlance.quick_wins ? `**值得一试的小改进：** ${atAGlance.quick_wins} 详见「值得尝试的功能」。` : ''}

${atAGlance.ambitious_workflows ? `**面向未来的高阶工作流：** ${atAGlance.ambitious_workflows} 详见「未来展望」。` : ''}`
  : '_未生成分析摘要_'

    const header = `# Claude Code Insights

${stats}
${data.date_range.start} 至 ${data.date_range.end}
${remoteInfo}
`

    const userSummary = `${header}${summaryText}


您的完整可分享分析报告已准备就绪：${reportUrl}${uploadHint}`

// ...

return [
  {
    type: 'text',
    text: `用户刚刚执行了 /insights 命令来生成其 Claude Code 会话的使用报告。

这是完整的分析数据：
${jsonStringify(insights, null, 2)}

报告 URL：${reportUrl}
HTML 文件：${htmlPath}
特征缓存目录：${getFacetsDir()}

用户将看到以下信息：
${userSummary}

请输出以下内容（无需改动）：

<message>
您的可分享分析报告已准备就绪：
${reportUrl}${uploadHint}

想要深入了解某个部分或尝试某项建议吗？
</message>`,
  },
]
  },
}

function isValidSessionFacets(obj: unknown): obj is SessionFacets {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return (
    typeof o.underlying_goal === 'string' &&
    typeof o.outcome === 'string' &&
    typeof o.brief_summary === 'string' &&
    o.goal_categories !== null &&
    typeof o.goal_categories === 'object' &&
    o.user_satisfaction_counts !== null &&
    typeof o.user_satisfaction_counts === 'object' &&
    o.friction_counts !== null &&
    typeof o.friction_counts === 'object'
  )
}

export default usageReport
