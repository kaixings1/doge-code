/**
 * DynamicToolComposer — 基于对话历史动态拼装每轮工具列表。
 *
 * 设计目标：
 *   1. 保底：always-on 工具始终保留
 *   2. 弹性：根据最近 N 轮对话中的信号，动态追加或移除工具
 *   3. 稳定：不改变 ToolSearch 路径（useToolSearch=true 时跳过）
 *
 * 信号来源：
 *   - 用户消息关键词（继承 filterToolsForMessage 的 TOOL_KEYWORD_MAP）
 *   - 模型上一轮响应中提到的工具名（tool_use 块）
 *   - 模型上一轮响应文本中隐含的意图关键词
 *
 * 控制开关：
 *   ENABLE_DYNAMIC_TOOL_COMPOSER=true  // 启用（默认关闭，向后兼容）
 */

import type { Tools } from '../Tool.js'
import { ALWAYS_ON_TOOLS, TOOL_KEYWORD_MAP } from './toolSearch.js'
import { logForDebugging } from './debug.js'

// ─── 配置 ──────────────────────────────────────────────

/** 扫描最近多少轮对话提取工具信号 */
const DEFAULT_HISTORY_WINDOW = 3

/** 意图关键词 → 工具名映射（补充 TOOL_KEYWORD_MAP 未覆盖的场景） */
const INTENT_KEYWORD_MAP: Array<{ keywords: string[]; toolNames: string[] }> = [
  // 文档/文件操作
  { keywords: ['review', 'audit', 'inspect', 'analyze', '审查', '审计', '检查'], toolNames: ['AdvisorTool'] },
  { keywords: ['create agent', 'delegate', 'subagent', 'parallel', '并行', '代理'], toolNames: ['AgentTool'] },
  { keywords: ['compare', 'diff', 'compare files', '比较', '对比', '差异'], toolNames: ['CompareTool'] },
  { keywords: ['monitor', 'health', 'status', '监控', '状态', '健康'], toolNames: ['MonitorTool'] },
  { keywords: ['backup', 'restore', '备份', '恢复'], toolNames: ['BackupTool'] },
  { keywords: ['schedule', 'cron', 'timer', '定时', '计划'], toolNames: ['ScheduleTool', 'CronTool'] },
  { keywords: ['cache', '缓存'], toolNames: ['CacheTool'] },
  { keywords: ['log', 'logging', '日志'], toolNames: ['LoggerTool'] },
  { keywords: ['metric', '指标'], toolNames: ['MetricsTool'] },
  { keywords: ['queue', '队列'], toolNames: ['QueueTool'] },
  { keywords: ['event', 'stream', '事件', '流'], toolNames: ['EventStreamTool'] },
  { keywords: ['web search', 'search online', 'google', '网络搜索', '谷歌', '百度'], toolNames: ['WebSearchTool', 'MultiSearchTool'] },
  { keywords: ['fetch url', 'download', '抓取', '下载网页'], toolNames: ['WebFetchTool'] },
  { keywords: ['run command', 'execute', 'shell', '执行命令', '运行脚本'], toolNames: ['BashTool'] },
  { keywords: ['write file', 'create file', '写入', '新建文件'], toolNames: ['FileWriteTool'] },
  { keywords: ['edit file', 'modify file', '修改', '编辑文件'], toolNames: ['FileEditTool', 'MultiFileEditTool'] },
  { keywords: ['read file', 'open file', '读取', '打开文件'], toolNames: ['FileReadTool'] },
  { keywords: ['search code', 'grep', '搜索代码'], toolNames: ['GrepTool'] },
  { keywords: ['list files', 'directory', '列出', '目录'], toolNames: ['GlobTool'] },
  { keywords: ['context collapse', 'summarize', '压缩', '总结上下文'], toolNames: ['ContextCollapseTool'] },
]

// ─── 公共 API ──────────────────────────────────────────

export interface DynamicToolComposerOptions {
  /** 扫描最近多少轮对话（默认 3） */
  historyWindow?: number
  /** 是否启用（默认读环境变量） */
  enabled?: boolean
}

/**
 * 根据对话历史动态拼装工具列表。
 *
 * 替换 filterToolsForMessage 的单轮过滤，增加"基于模型响应信号的动态拼接"能力。
 *
 * @param tools - 完整工具列表
 * @param messages - 当前对话历史（从旧到新）
 * @param options - 配置项
 * @returns 过滤后的工具列表
 */
export function composeToolsForTurn(
  tools: Tools,
  messages: Array<{ type: string; message?: { content?: unknown } }>,
  options: DynamicToolComposerOptions = {},
): Tools {
  // 开关控制：默认关闭，通过环境变量显式启用
  const enabled = options.enabled ?? isDynamicToolComposerEnabled()
  if (!enabled) {
    // 回退到基础过滤（仅 always-on + 用户消息匹配）
    return fallbackFilter(tools, messages)
  }

  const historyWindow = options.historyWindow ?? DEFAULT_HISTORY_WINDOW

  // 1. 提取用户最后一条消息
  const lastUserMessage = extractLastUserMessage(messages)

  // 2. 提取最近 N 轮对话中的工具信号
  const signals = extractToolSignalsFromHistory(messages, historyWindow)

  // 3. 合并：always-on + 用户消息匹配 + 历史信号
  const toolNamesToInclude = new Set<string>(ALWAYS_ON_TOOLS)

  // 3a. 用户消息关键词匹配（继承现有逻辑）
  if (!isSimpleConversationMessage(lastUserMessage)) {
    applyKeywordMatching(toolNamesToInclude, lastUserMessage)
    // 非简单对话时包含 MCP 工具
    for (const t of tools) {
      if (t.isMcp) toolNamesToInclude.add(t.name)
    }
  }

  // 3b. 历史对话信号（新增：基于模型响应的动态拼接）
  for (const toolName of signals) {
    toolNamesToInclude.add(toolName)
  }

  // 4. 过滤
  const result = tools.filter(t => toolNamesToInclude.has(t.name))

  logForDebugging(
    `[DynamicToolComposer] composed ${result.length}/${tools.length} tools ` +
      `(signals: [${signals.join(', ')}])`,
  )

  return result
}

/**
 * 检查动态工具组合器是否启用。
 */
export function isDynamicToolComposerEnabled(): boolean {
  return process.env.ENABLE_DYNAMIC_TOOL_COMPOSER === 'true'
}

// ─── 信号提取 ──────────────────────────────────────────

/**
 * 从最近 N 轮对话中提取工具使用信号。
 *
 * 信号来源：
 *   1. assistant 消息中的 tool_use 块（直接提取工具名）
 *   2. assistant 消息文本中的意图关键词（映射到工具名）
 *   3. user 消息中的工具名提及
 */
function extractToolSignalsFromHistory(
  messages: Array<{ type: string; message?: { content?: unknown } }>,
  windowSize: number,
): string[] {
  const signals = new Set<string>()
  const recentMessages = messages.slice(-windowSize * 2) // 每轮最多 user+assistant

  for (const msg of recentMessages) {
    if (msg.type === 'assistant' && msg.message?.content) {
      const content = msg.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            typeof block === 'object' &&
            block !== null &&
            (block as any).type === 'tool_use' &&
            'name' in (block as any) &&
            typeof (block as any).name === 'string'
          ) {
            signals.add((block as any).name)
          }
        }
      }
      // 从 assistant 文本中提取意图关键词
      const text = extractTextFromContent(content)
      if (text) {
        applyIntentMatching(signals, text)
      }
    }

    if (msg.type === 'user' && msg.message?.content) {
      const text = extractTextFromContent(msg.message.content)
      if (text) {
        // 检查用户是否直接提到了工具名
        for (const t of ['read', 'edit', 'write', 'bash', 'search', 'glob', 'web', 'fetch']) {
          if (text.toLowerCase().includes(t)) {
            // 映射到实际工具名
            const toolName = mapUserMentionToToolName(t)
            if (toolName) signals.add(toolName)
          }
        }
      }
    }
  }

  return Array.from(signals)
}

// ─── 辅助函数 ──────────────────────────────────────────

/** 从消息内容中提取纯文本 */
function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (typeof block === 'string') return block
        if (typeof block === 'object' && block !== null) {
          const b = block as any
          if (typeof b.text === 'string') return b.text
          if (b.type === 'tool_result' && typeof b.content === 'string') return b.content
        }
        return ''
      })
      .join(' ')
  }
  return ''
}

/** 将用户提到的简短工具名映射到实际工具名 */
function mapUserMentionToToolName(mention: string): string | null {
  const map: Record<string, string> = {
    read: 'FileReadTool',
    edit: 'FileEditTool',
    write: 'FileWriteTool',
    bash: 'BashTool',
    search: 'GrepTool',
    glob: 'GlobTool',
    web: 'WebFetchTool',
    fetch: 'WebFetchTool',
    grep: 'GrepTool',
  }
  return map[mention] ?? null
}

/** 应用意图关键词匹配（补充 TOOL_KEYWORD_MAP） */
function applyIntentMatching(signals: Set<string>, text: string): void {
  const lower = text.toLowerCase()
  for (const { keywords, toolNames } of INTENT_KEYWORD_MAP) {
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        for (const toolName of toolNames) {
          signals.add(toolName)
        }
        break
      }
    }
  }
}

/** 应用用户消息关键词匹配（基于 TOOL_KEYWORD_MAP） */
function applyKeywordMatching(toolNamesToInclude: Set<string>, message: string): void {
  const msg = message.toLowerCase()
  for (const { keywords, toolNames } of TOOL_KEYWORD_MAP) {
    for (const keyword of keywords) {
      if (msg.includes(keyword)) {
        for (const toolName of toolNames) {
          toolNamesToInclude.add(toolName)
        }
        break
      }
    }
  }
}

/** 回退过滤（动态组合器关闭时使用） */
function fallbackFilter(
  tools: Tools,
  messages: Array<{ type: string; message?: { content?: unknown } }>,
): Tools {
  const toolNamesToInclude = new Set<string>(ALWAYS_ON_TOOLS)
  const lastUserMessage = extractLastUserMessage(messages)

  if (!isSimpleConversationMessage(lastUserMessage)) {
    applyKeywordMatching(toolNamesToInclude, lastUserMessage)
    for (const t of tools) {
      if (t.isMcp) toolNamesToInclude.add(t.name)
    }
  }

  return tools.filter(t => toolNamesToInclude.has(t.name))
}

/** 提取最后一条用户消息 */
function extractLastUserMessage(
  messages: Array<{ type: string; message?: { content?: unknown } }>,
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === 'user') {
      return extractTextFromContent(messages[i].message?.content) || ''
    }
  }
  return ''
}

/** 判断是否为简单对话（直接复用，避免循环导入） */
function isSimpleConversationMessage(message: string): boolean {
  const msg = message.toLowerCase().trim()

  const simplePatterns: RegExp[] = [
    /^(?:hi|hello|hey|hiya|g'day|good morning|good afternoon|good evening)(?:\s|$|[^\w\s])/,
    /^(?:how are you|how are you doing|how's it going|how's going)(?:\s|$|[^\w\s])/,
    /^(?:thanks|thank you|thanks a lot|thank you so much)(?:\s|$|[^\w\s])/,
    /^(?:ok|okay|got it|understood|alright)(?:\s|$|[^\w\s])/,
    /^(?:bye|goodbye|see you|talk to you later)(?:\s|$|[^\w\s])/,
    /^(?:test|testing)$/,
    /^(?:你好|哈喽|哈罗|嗨|hey|hi)(?:\s|$|[^\w\s])/,
    /^(?:你好吗|你好啊|最近怎么样|近来怎么样)(?:\s|$|[^\w\s])/,
    /^(?:谢谢|thanks|感谢|多谢|感恩)(?:\s|$|[^\w\s])/,
    /^(?:好的|知道了|明白|了解|好|行|可以|行了|好吧)(?:\s|$|[^\w\s])/,
    /^(?:bye|再见|拜拜|回见|下次见|下次再见)(?:\s|$|[^\w\s])/,
  ]

  if (msg.length < 30) {
    for (const pattern of simplePatterns) {
      if (pattern.test(msg)) return true
    }
  }

  if (msg.length < 50) {
    const hasCodeKeywords = /\b(code|file|read|write|edit|git|bash|shell|tool|function|class|api|sql|database|web|http|search|grep|find|debug|fix|build|compile|test|run|deploy|docker|npm|node|python|java|go |rust|typescript|javascript|react|vue|angular)\b/.test(msg)
    const hasChineseCodeKeywords = /[\u4e00-\u9fa5]+(?:代码|文件|读取|编辑|搜索|修复|运行|测试|构建|部署|数据库|接口|命令|脚本|函数|类|网页|抓取|下载|版本|分支|合并|提交|推送|拉取)\b/.test(msg)
    if (!hasCodeKeywords && !hasChineseCodeKeywords && simplePatterns.some(p => p.test(msg))) return true
  }

  return false
}
