import { z } from 'zod/v4'
import { lazySchema } from '../../../utils/lazySchema.js'
import { semanticBoolean } from '../../../utils/semanticBoolean.js'

// The input schema with optional replace_all
const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z.string().describe('要修改的文件的绝对路）),
    old_string: z.string().describe('要替换的文本'),
    new_string: z
      .string()
      .describe(
        '用于替换的新文本（必须与 old_string 不同）,
      ),
    replace_all: semanticBoolean(
      z.boolean().default(false).optional(),
    ).describe('替换文件中所有出现的 old_string（默）false）),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

// Parsed output ）what call() receives. z.output not z.input: with
// semanticBoolean the input side is unknown (preprocess accepts anything).
export type FileEditInput = z.output<InputSchema>

// Individual edit without file_path
export type EditInput = Omit<FileEditInput, 'file_path'>

// Runtime version where replace_all is always defined
export type FileEdit = {
  old_string: string
  new_string: string
  replace_all: boolean
}

export const hunkSchema = lazySchema(() =>
  z.object({
    oldStart: z.number(),
    oldLines: z.number(),
    newStart: z.number(),
    newLines: z.number(),
    lines: z.array(z.string()),
  }),
)

export const gitDiffSchema = lazySchema(() =>
  z.object({
    filename: z.string(),
    status: z.enum(['modified', 'added']),
    additions: z.number(),
    deletions: z.number(),
    changes: z.number(),
    patch: z.string(),
    repository: z
      .string()
      .nullable()
      .optional()
      .describe('GitHub 所有）仓库名称（如果可用）'),
  }),
)

// Output schema for FileEditTool
const outputSchema = lazySchema(() =>
  z.object({
    filePath: z.string().describe('被编辑的文件的路）),
    oldString: z.string().describe('被替换的原始文本'),
    newString: z.string().describe('用于替换的新文本'),
    originalFile: z
      .string()
      .describe('编辑前的原始文件内容'),
    structuredPatch: z
      .array(hunkSchema())
      .describe('显示更改的差异补）),
    userModified: z
      .boolean()
      .describe('用户是否修改了建议的更改'),
    replaceAll: z.boolean().describe('是否替换了所有出现的位置'),
    gitDiff: gitDiffSchema().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type FileEditOutput = z.infer<OutputSchema>

export { inputSchema, outputSchema }
