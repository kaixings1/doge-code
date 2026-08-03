import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { exec } from '../../utils/Shell.js'

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['create', 'switch', 'list', 'delete']).describe('分支操作'),
    name: z.string().optional().describe('分支名称'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('操作是否成功'),
    branch: z.string().optional().describe('当前分支'),
    branches: z.array(z.string()).optional().describe('分支列表'),
    message: z.string().optional().describe('结果消息'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

async function runGit(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return exec(`git ${args.join(' ')}`, new AbortController().signal, 'bash', { timeout: 30000 })
}

export const BranchTool = buildTool({
  name: 'branch',
  description: async () => '创建和管理 Git 分支',
  callOn: 'manual',
  async prompt() {
    return '使用 branch 工具管理 Git 分支。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'branch'
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
    const name = (input as Record<string, unknown>)?.name
    return `Branch: ${action}${name ? ` (${name})` : ''}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const msg = (content as Record<string, unknown>).message || '分支操作完成'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },
  async call({ action, name }) {
    try {
      switch (action) {
        case 'list': {
          const result = await runGit(['branch', '--list', '--format=%(refname:short)'])
          const branches = result.stdout.split('\n').filter(Boolean)
          return {
            data: {
              success: true,
              branches,
              message: `找到 ${branches.length} 个分支`,
            } as Output,
          }
        }
        case 'create': {
          if (!name) {
            return { data: { success: false, message: 'create 操作需要 name 参数' } as Output }
          }
          const result = await runGit(['branch', name])
          return {
            data: {
              success: result.code === 0,
              branch: name,
              message: result.code === 0 ? `分支 ${name} 已创建` : `创建失败: ${result.stderr}`,
            } as Output,
          }
        }
        case 'switch': {
          if (!name) {
            return { data: { success: false, message: 'switch 操作需要 name 参数' } as Output }
          }
          const result = await runGit(['checkout', name])
          return {
            data: {
              success: result.code === 0,
              branch: name,
              message: result.code === 0 ? `已切换到分支 ${name}` : `切换失败: ${result.stderr}`,
            } as Output,
          }
        }
        case 'delete': {
          if (!name) {
            return { data: { success: false, message: 'delete 操作需要 name 参数' } as Output }
          }
          const result = await runGit(['branch', '-d', name])
          return {
            data: {
              success: result.code === 0,
              message: result.code === 0 ? `分支 ${name} 已删除` : `删除失败: ${result.stderr}`,
            } as Output,
          }
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
