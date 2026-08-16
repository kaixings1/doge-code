import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { exec } from '../../utils/Shell.js'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFile, unlink } from 'fs/promises'

const inputSchema = lazySchema(() =>
  z.object({
    code: z.string().describe('要执行的 Python 代码'),
    timeout: z.number().int().optional().describe('超时时间（秒），默认 30'),
    authorized_imports: z.array(z.string()).optional().describe('允许导入的模块列表'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    output: z.string().optional().describe('代码输出'),
    error: z.string().optional().describe('错误信息'),
    exit_code: z.number().optional().describe('退出码'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

const DEFAULT_AUTHORIZED_IMPORTS = [
  'math', 'random', 'datetime', 'json', 're', 'os', 'sys',
  'collections', 'itertools', 'functools', 'statistics',
]

export const PythonInterpreterTool = buildTool({
  name: 'python_interpreter',
  description: async () =>
    'Python 代码解释器工具：在隔离环境中执行 Python 代码。吸收 smolagents 精华，支持安全代码执行和导入限制。',
  callOn: 'manual',
  async prompt() {
    return '使用 python_interpreter 工具执行 Python 代码。支持数学计算、数据处理、文件操作等。代码会写入临时文件后执行。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'python_interpreter'
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
    const code = (input as Record<string, unknown>)?.code as string | undefined
    const preview = code ? code.slice(0, 30) + (code.length > 30 ? '...' : '') : ''
    return `Python: ${preview}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const msg = (content as Record<string, unknown>).message || 'Python 执行完成'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },
  async call({ code, timeout, authorized_imports }) {
    try {
      if (!code || code.trim().length === 0) {
        return {
          data: {
            success: false,
            message: '代码不能为空',
          } as Output,
        }
      }

      const effectiveTimeout = timeout ?? 30
      const allowedImports = authorized_imports && authorized_imports.length > 0
        ? authorized_imports
        : DEFAULT_AUTHORIZED_IMPORTS

      // 写入临时文件
      const tempFile = join(tmpdir(), `python_exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.py`)
      const wrappedCode = `
import sys
import io
import traceback
from contextlib import redirect_stdout, redirect_stderr

stdout_buf = io.StringIO()
stderr_buf = io.StringIO()

try:
    with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
${code.split('\n').map(line => '        ' + line).join('\n')}
except Exception:
    traceback.print_exc(file=stderr_buf)

stdout_val = stdout_buf.getvalue()
stderr_val = stderr_buf.getvalue()
print(stdout_val, end='')
if stderr_val:
    print(stderr_val, end='', file=sys.stderr)
`
      await writeFile(tempFile, wrappedCode, 'utf-8')

      try {
        const result = await exec(
          `python "${tempFile}"`,
          new AbortController().signal,
          'bash',
          { timeout: effectiveTimeout * 1000 }
        )

        return {
          data: {
            success: result.code === 0,
            output: result.stdout || result.stderr || '执行完成（无输出）',
            error: result.code !== 0 ? result.stderr : undefined,
            exit_code: result.code,
            message: result.code === 0 ? 'Python 代码执行成功' : `执行失败 (exit ${result.code})`,
          } as Output,
        }
      } finally {
        // 清理临时文件
        try {
          await unlink(tempFile)
        } catch {
          // 忽略清理错误
        }
      }
    } catch (err) {
      return {
        data: {
          success: false,
          message: `Python 执行失败: ${err instanceof Error ? err.message : String(err)}`,
          error: err instanceof Error ? err.message : String(err),
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
