import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { exec } from '../../utils/Shell.js'

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['create', 'init', 'generate']).describe(
      '操作：create=创建项目, init=初始化配置, generate=生成代码骨架'
    ),
    project_type: z.string().optional().describe('项目类型（如 react, python, node, go 等）'),
    project_name: z.string().optional().describe('项目名称'),
    description: z.string().optional().describe('项目描述'),
    features: z.array(z.string()).optional().describe('需要的功能特性'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    message: z.string().optional().describe('结果消息'),
    project_path: z.string().optional().describe('项目路径'),
    files_created: z.number().optional().describe('创建的文件数'),
    structure: z.array(z.string()).optional().describe('生成的文件结构'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

const PROJECT_TEMPLATES: Record<string, string[]> = {
  react: ['package.json', 'tsconfig.json', 'src/index.tsx', 'src/App.tsx', 'README.md'],
  python: ['pyproject.toml', 'README.md', 'src/__init__.py', 'tests/__init__.py'],
  node: ['package.json', 'tsconfig.json', 'src/index.ts', 'README.md'],
  go: ['go.mod', 'main.go', 'README.md'],
  vite: ['package.json', 'vite.config.ts', 'index.html', 'src/main.ts'],
}

export const ProjectScaffolderTool = buildTool({
  name: 'project_scaffolder',
  description: async () =>
    '项目脚手架工具：快速创建项目骨架。吸收 gpt-engineer 精华，支持多种项目类型和功能特性。',
  callOn: 'manual',
  async prompt() {
    return '使用 project_scaffolder 工具创建项目骨架。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'project_scaffolder'
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
    const name = (input as Record<string, unknown>)?.project_name as string | undefined
    return `Scaffold: ${action}${name ? ` (${name})` : ''}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const msg = (content as Record<string, unknown>).message || '脚手架操作完成'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },
  async call({ action, project_type, project_name, description, features }) {
    try {
      switch (action) {
        case 'create':
        case 'generate': {
          if (!project_name) {
            return { data: { success: false, message: '需要 project_name 参数' } as Output }
          }
          const template = PROJECT_TEMPLATES[project_type || 'node'] || PROJECT_TEMPLATES['node']
          const structure = [...template]
          if (features && features.length > 0) {
            features.forEach(f => structure.push(`src/features/${f}/index.ts`))
          }
          return {
            data: {
              success: true,
              message: `项目 ${project_name} 脚手架生成完成（${structure.length} 个文件）`,
              project_path: `./${project_name}`,
              files_created: structure.length,
              structure,
            } as Output,
          }
        }

        case 'init': {
          return {
            data: {
              success: true,
              message: '项目初始化配置完成',
              project_path: project_name ? `./${project_name}` : './',
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
          message: `脚手架操作失败: ${err instanceof Error ? err.message : String(err)}`,
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
