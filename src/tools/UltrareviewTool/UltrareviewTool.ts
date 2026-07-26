import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { exec } from '../../utils/Shell.js'

const inputSchema = lazySchema(() =>
  z.object({
    target: z.string().optional().describe('审查目标：分支名、PR URL 或提交 SHA'),
    depth: z.enum(['quick', 'standard', 'deep']).optional().describe('审查深度'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    findings: z.array(z.string()).describe('代码审查发现'),
    summary: z.string().describe('审查摘要'),
    score: z.number().optional().describe('总体评分（0-100）'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

async function getGitDiff(target?: string): Promise<string> {
  const args = target ? [`diff`, target] : ['diff', 'HEAD~1']
  const result = await exec(`git ${args.join(' ')}`, new AbortController().signal, 'bash', { timeout: 30000 })
  return result.stdout
}

async function getChangedFiles(target?: string): Promise<string[]> {
  const args = target ? [`diff`, '--name-only', target] : ['diff', '--name-only', 'HEAD~1']
  const result = await exec(`git ${args.join(' ')}`, new AbortController().signal, 'bash', { timeout: 30000 })
  return result.stdout.split('\n').filter(Boolean)
}

function analyzeCode(findings: string[]): { summary: string; score: number } {
  const criticalCount = findings.filter(f => f.startsWith('[CRITICAL]')).length
  const warningCount = findings.filter(f => f.startsWith('[WARNING]')).length
  const infoCount = findings.filter(f => f.startsWith('[INFO]')).length

  let score = 100
  score -= criticalCount * 15
  score -= warningCount * 5
  score -= infoCount * 1
  score = Math.max(0, Math.min(100, score))

  const parts: string[] = []
  if (criticalCount) parts.push(`${criticalCount} 个严重问题`)
  if (warningCount) parts.push(`${warningCount} 个警告`)
  if (infoCount) parts.push(`${infoCount} 个建议`)
  if (findings.length === 0) parts.push('未发现问题')

  return {
    summary: `审查完成。${parts.join('，')}。总体评分: ${score}/100`,
    score,
  }
}

export const UltrareviewTool = buildTool({
  name: 'ultrareview',
  description: async () => '运行全面的代码审查（支持 quick/standard/deep 模式）',
  callOn: 'always',
  async prompt() {
    return '使用 ultrareview 工具进行代码审查。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'ultrareview'
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
    const target = (input as any)?.target || 'current state'
    return `Ultrareview: ${target.substring(0, 50)}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const summary = (content as any).summary || 'Ultrareview completed'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: summary,
    }
  },
  async call({ target, depth = 'standard' }) {
    try {
      const findings: string[] = []
      const diff = await getGitDiff(target)
      const changedFiles = await getChangedFiles(target)

      // 根据深度执行不同级别的检查
      const checks: { pattern: RegExp; level: string; message: string }[] = []

      if (depth === 'quick' || depth === 'standard' || depth === 'deep') {
        checks.push(
          { pattern: /console\.log\s*\(/g, level: 'WARNING', message: '发现 console.log，应使用结构化日志' },
          { pattern: /TODO[:\s]/gi, level: 'INFO', message: '包含 TODO 注释' },
          { pattern: /FIXME[:\s]/gi, level: 'WARNING', message: '包含 FIXME 注释' },
        )
      }

      if (depth === 'standard' || depth === 'deep') {
        checks.push(
          { pattern: /==\s*null/gi, level: 'WARNING', message: '使用 == 而非 === 进行 null 比较' },
          { pattern: /var\s+\w+/g, level: 'INFO', message: '使用 var 声明变量，建议使用 let/const' },
          { pattern: /\.then\s*\(/g, level: 'INFO', message: '使用 .then() 链，建议使用 async/await' },
          { pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g, level: 'WARNING', message: '空的 catch 块会静默失败' },
        )
      }

      if (depth === 'deep') {
        checks.push(
          { pattern: /eval\s*\(/g, level: 'CRITICAL', message: '使用 eval()，存在安全风险' },
          { pattern: /innerHTML\s*=/gi, level: 'CRITICAL', message: '使用 innerHTML，存在 XSS 风险' },
          { pattern: /password\s*[:=]/gi, level: 'CRITICAL', message: '代码中可能包含密码明文' },
          { pattern: /secret\s*[:=]/gi, level: 'WARNING', message: '代码中可能包含密钥明文' },
        )
      }

      const filesToCheck = depth === 'quick' ? changedFiles.slice(0, 5) : changedFiles
      const filesContent = new Map<string, string>()
      for (const file of filesToCheck) {
        try {
          const { readFile } = await import('fs/promises')
          const content = await readFile(file, { encoding: 'utf8' })
          filesContent.set(file, content)
        } catch {
          // 无法读取的文件跳过
        }
      }

      for (const [file, content] of filesContent) {
        for (const check of checks) {
          const matches = content.match(check.pattern)
          if (matches) {
            for (const match of matches.slice(0, 5)) {
              findings.push(`[${check.level}] ${file}: ${check.message} (${match})`)
            }
          }
        }
      }

      if (findings.length === 0 && changedFiles.length > 0) {
        findings.push('[INFO] 审查完成，未发现问题')
      }

      const { summary, score } = analyzeCode(findings)

      return {
        data: {
          findings,
          summary,
          score,
        } as Output,
      }
    } catch (err) {
      return {
        data: {
          findings: [`审查失败: ${err instanceof Error ? err.message : String(err)}`],
          summary: '审查过程中出现错误',
          score: 0,
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
