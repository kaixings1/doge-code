import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    scope: z.enum(['session', 'project', 'global']).optional().describe('权限白名单的作用域'),
    dryRun: z.boolean().optional().describe('仅分析不生成白名单'),
    minCount: z.number().optional().describe('生成规则的最小出现次数'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    whitelist: z.array(z.string()).describe('建议的白名单规则'),
    recommendations: z.string().describe('建议摘要'),
    totalScanned: z.number().describe('扫描的请求数'),
    rulesGenerated: z.number().describe('生成的规则数'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

interface ToolCallPattern {
  toolName: string
  inputHash: string
  count: number
  examples: string[]
  riskLevel: 'safe' | 'moderate' | 'risky'
}

const KNOWN_SAFE_PATTERNS: Record<string, string[]> = {
  'FileReadTool': ['文件路径不包含敏感目录'],
  'GrepTool': ['搜索内容为代码模式'],
  'GlobTool': ['匹配文件扩展名'],
  'BashTool': ['命令为 git 或 npm 或 ls'],
  'TaskListTool': ['无输入参数'],
  'ThemeTool': ['操作为 list'],
  'CacheTool': ['操作为 list'],
  'QueueTool': ['操作为 list'],
  'MonitorTool': ['目标为 health'],
}

function classifyRisk(toolName: string, inputJson: string): 'safe' | 'moderate' | 'risky' {
  const riskyTools = ['BashTool', 'ShellTool', 'PowerShellTool', 'FileWriteTool', 'FileEditTool', 'FileDeleteTool']
  const moderateTools = ['HttpTool', 'WebFetchTool', 'WebSearchTool', 'WebSocketTool', 'MCPTool']

  if (riskyTools.includes(toolName)) return 'risky'
  if (moderateTools.includes(toolName)) return 'moderate'
  return 'safe'
}

function generatePermissionRule(toolName: string, inputHash: string, pattern: ToolCallPattern): string {
  const risk = pattern.riskLevel
  if (risk === 'safe') {
    return `allow ${toolName} when input matches pattern ${inputHash.slice(0, 8)}`
  }
  if (risk === 'moderate') {
    return `allow ${toolName} with read-only scope when input matches pattern ${inputHash.slice(0, 8)}`
  }
  return `warn ${toolName} - requires confirmation for pattern ${inputHash.slice(0, 8)}`
}

async function analyzePermissionPatterns(
  scope: string,
  minCount: number,
): Promise<{ patterns: ToolCallPattern[]; totalScanned: number }> {
  // 模拟从工具调用历史中分析模式
  const mockToolCalls: { tool: string; input: unknown }[] = [
    { tool: 'FileReadTool', input: { filePath: 'src/index.ts' } },
    { tool: 'FileReadTool', input: { filePath: 'src/utils.ts' } },
    { tool: 'FileReadTool', input: { filePath: 'src/engine.ts' } },
    { tool: 'GrepTool', input: { pattern: 'function.*', path: 'src' } },
    { tool: 'GrepTool', input: { pattern: 'class.*', path: 'src' } },
    { tool: 'GrepTool', input: { pattern: 'import.*', path: 'src' } },
    { tool: 'BashTool', input: { command: 'git status' } },
    { tool: 'BashTool', input: { command: 'git log --oneline' } },
    { tool: 'BashTool', input: { command: 'npm run build' } },
    { tool: 'ThemeTool', input: { action: 'list' } },
    { tool: 'ThemeTool', input: { action: 'show' } },
    { tool: 'CacheTool', input: { action: 'list' } },
    { tool: 'CacheTool', input: { action: 'get', key: 'user_prefs' } },
    { tool: 'MonitorTool', input: { target: 'health', action: 'status' } },
    { tool: 'TaskListTool', input: {} },
    { tool: 'TaskListTool', input: {} },
  ]

  const patternMap = new Map<string, ToolCallPattern>()

  for (const call of mockToolCalls) {
    const inputHash = JSON.stringify(call.input)
    const key = `${call.tool}:${inputHash}`
    const existing = patternMap.get(key)
    if (existing) {
      existing.count++
      if (existing.examples.length < 3) {
        existing.examples.push(JSON.stringify(call.input).slice(0, 60))
      }
    } else {
      patternMap.set(key, {
        toolName: call.tool,
        inputHash,
        count: 1,
        examples: [JSON.stringify(call.input).slice(0, 60)],
        riskLevel: classifyRisk(call.tool, inputHash),
      })
    }
  }

  const patterns = Array.from(patternMap.values()).filter(p => p.count >= minCount)
  return { patterns, totalScanned: mockToolCalls.length }
}

export const LessPermissionPromptsTool = buildTool({
  name: 'less-permission-prompts',
  description: async () => '基于调用模式分析并生成权限白名单建议',
  callOn: 'manual',
  async prompt() {
    return '使用 less-permission-prompts 工具分析工具调用模式并生成权限白名单。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'less-permission-prompts'
  },
  isEnabled() {
    return true
  },
  toAutoClassifierInput() {
    return ''
  },
  async checkPermissions(input) {
    return { behavior: 'allow', updatedInput: input }
  },
  renderToolUseMessage(input) {
    const scope = (input as Record<string, unknown>)?.scope ?? 'session'
    return `Permission Whitelist: ${scope}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: (content as Record<string, unknown>).recommendations || 'No suggestions',
    }
  },
  async call({ scope = 'session', dryRun = false, minCount = 1 }) {
    const { patterns, totalScanned } = await analyzePermissionPatterns(scope, minCount)

    const safeRules: string[] = []
    const moderateRules: string[] = []
    const riskyRules: string[] = []

    for (const pattern of patterns) {
      const rule = generatePermissionRule(pattern.toolName, pattern.inputHash, pattern)
      if (pattern.riskLevel === 'safe') safeRules.push(rule)
      else if (pattern.riskLevel === 'moderate') moderateRules.push(rule)
      else riskyRules.push(rule)
    }

    const whitelist = [...safeRules, ...moderateRules]
    const totalRules = whitelist.length + riskyRules.length

    let recommendations = `分析了 ${totalScanned} 次工具调用，发现 ${patterns.length} 种调用模式。\n`
    recommendations += `生成了 ${totalRules} 条规则 (${safeRules.length} 安全, ${moderateRules.length} 中等, ${riskyRules.length} 高风险)\n\n`
    if (riskyRules.length > 0) {
      recommendations += '⚠️ 高风险操作建议保留确认提示:\n'
      for (const rule of riskyRules.slice(0, 5)) {
        recommendations += `  - ${rule}\n`
      }
    }
    if (safeRules.length > 0) {
      recommendations += '\n✅ 可安全自动化的操作:\n'
      for (const rule of safeRules.slice(0, 10)) {
        recommendations += `  - ${rule}\n`
      }
    }
    if (!dryRun) {
      recommendations += '\n提示: 使用 /whitelist 命令应用这些规则'
    }

    return {
      data: {
        whitelist,
        recommendations,
        totalScanned,
        rulesGenerated: totalRules,
      } as Output,
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
