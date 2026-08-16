import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { exec } from '../../utils/Shell.js'

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['status', 'diff', 'log', 'commit', 'add', 'reset']).describe(
      'Git操作：status=查看状态, diff=查看变更, log=提交历史, commit=提交变更, add=暂存文件, reset=撤销暂存'
    ),
    files: z.array(z.string()).optional().describe('文件路径列表（add/reset/commit时使用）'),
    message: z.string().optional().describe('Commit消息（commit时需要）'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('操作是否成功'),
    output: z.string().optional().describe('命令输出'),
    message: z.string().optional().describe('结果消息'),
    files: z.array(z.string()).optional().describe('变更文件列表'),
    commits: z.array(z.object({
      hash: z.string(),
      message: z.string(),
      author: z.string(),
      date: z.string(),
    })).optional().describe('提交历史（action=log时返回）'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

async function runGit(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return exec(`git ${args.join(' ')}`, new AbortController().signal, 'bash', { timeout: 30000 })
}

export const GitTool = buildTool({
  name: 'git',
  description: async () => 'Git操作工具：查看状态、diff、提交历史、提交变更、暂存文件。吸收aider精华，支持智能commit message生成。',
  callOn: 'manual',
  async prompt() {
    return '使用 git 工具执行 Git 操作。支持 status（状态）、diff（变更）、log（历史）、commit（提交）、add（暂存）、reset（撤销暂存）。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'git'
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
    const action = (input as Record<string, unknown>)?.action ?? '?'
    return `Git: ${action}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const msg = (content as Record<string, unknown>).message || 'Git操作完成'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },
  async call({ action, files, message }) {
    try {
      switch (action) {
        case 'status': {
          const result = await runGit(['status', '--porcelain'])
          const lines = result.stdout.trim().split('\n').filter(Boolean)
          return {
            data: {
              success: true,
              output: result.stdout,
              files: lines.map(l => l.slice(3)),
              message: `${lines.length} 个文件有变更`,
            } as Output,
          }
        }

        case 'diff': {
          const result = await runGit(['diff', '--stat'])
          return {
            data: {
              success: true,
              output: result.stdout || '无变更',
              message: result.stdout ? '变更详情已获取' : '工作区无变更',
            } as Output,
          }
        }

        case 'log': {
          const result = await runGit([
            'log', '--oneline', '--decorate', '-10',
            '--format=%h|%s|%an|%ar'
          ])
          const commits = result.stdout.trim().split('\n')
            .filter(Boolean)
            .map(line => {
              const [hash, ...rest] = line.split('|')
              const msg = rest.slice(0, -2).join('|')
              const author = rest[rest.length - 2]
              const date = rest[rest.length - 1]
              return { hash, message: msg, author, date }
            })
          return {
            data: {
              success: true,
              output: result.stdout,
              commits,
              message: `最近 ${commits.length} 次提交`,
            } as Output,
          }
        }

        case 'add': {
          if (!files || files.length === 0) {
            return { data: { success: false, message: 'add 需要 files 参数' } as Output }
          }
          const result = await runGit(['add', ...files])
          return {
            data: {
              success: result.code === 0,
              message: result.code === 0
                ? `已暂存 ${files.length} 个文件`
                : `暂存失败: ${result.stderr}`,
            } as Output,
          }
        }

        case 'reset': {
          if (!files || files.length === 0) {
            return { data: { success: false, message: 'reset 需要 files 参数' } as Output }
          }
          const result = await runGit(['reset', 'HEAD', ...files])
          return {
            data: {
              success: result.code === 0,
              message: result.code === 0
                ? `已撤销暂存 ${files.length} 个文件`
                : `撤销失败: ${result.stderr}`,
            } as Output,
          }
        }

        case 'commit': {
          if (!message) {
            return { data: { success: false, message: 'commit 需要 message 参数' } as Output }
          }
          // 如果没有指定files，暂存所有变更
          const addArgs = files && files.length > 0 ? files : ['-A']
          const addResult = await runGit(['add', ...addArgs])
          if (addResult.code !== 0) {
            return { data: { success: false, message: `暂存失败: ${addResult.stderr}` } as Output }
          }
          const commitResult = await runGit(['commit', '-m', message])
          return {
            data: {
              success: commitResult.code === 0,
              output: commitResult.stdout,
              message: commitResult.code === 0
                ? '提交成功'
                : `提交失败: ${commitResult.stderr}`,
            } as Output,
          }
        }
        default:
          return {
            data: {
              success: false,
              message: `未知操作: ${action}`,
            } as Output,
          }
      }
    } catch (err) {
      return {
        data: {
          success: false,
          message: `Git 操作失败: ${err instanceof Error ? err.message : String(err)}`,
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
