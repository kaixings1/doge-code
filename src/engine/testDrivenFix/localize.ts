/**
 * engine/testDrivenFix/localize.ts — 三级定位 Prompt 生成
 *
 * 吸收自 Agentless (agentless/fl/FL.py)：
 *   1. 文件级定位：问题描述 + 仓库结构 → 需要编辑的文件列表
 *   2. 相关位置定位：问题描述 + 文件内容 → class/function/line 位置
 *   3. 编辑位置定位：问题描述 + 带行号代码 → 精确编辑行
 *
 * 所有函数为纯函数（只生成 prompt），LLM 交互由调用方负责。
 */

import type { RepoStructure, StrategyTemplate } from './types.js'
import { wrapContentWithLines } from './repoStructure.js'

// ============================================================================
// Strategy template helpers
// ============================================================================

function applyStrategy(
  base: string,
  strategy: StrategyTemplate | null,
  field: 'system_template' | 'instance_template' | 'next_step_template',
): string {
  if (strategy && strategy[field]) {
    return strategy[field]!
  }
  return base
}

// ============================================================================
// 仓库结构文本
// ============================================================================

/**
 * 生成仓库结构树文本（文件 + 符号列表，供定位 prompt 使用）。
 */
export function formatRepoStructure(structure: RepoStructure, maxFiles = 200): string {
  const files = Object.keys(structure.symbols)
  const shown = files.slice(0, maxFiles)
  const lines: string[] = []

  for (const file of shown) {
    const symbols = structure.symbols[file]
    lines.push(`${file}/`)
    for (const s of symbols.slice(0, 30)) {
      const kindLabel = s.kind === 'class' ? 'class' : s.kind === 'function' ? 'def' : 'method'
      lines.push(`  ${kindLabel} ${s.name}  [${s.startLine}-${s.endLine}]`)
    }
    if (symbols.length > 30) {
      lines.push(`  ... 共 ${symbols.length} 个符号`)
    }
  }

  if (files.length > maxFiles) {
    lines.push(`... 共 ${files.length} 个文件（仅显示前 ${maxFiles} 个）`)
  }

  return lines.join('\n')
}

// ============================================================================
// 第一级：文件定位 Prompt
// ============================================================================

/**
 * 生成文件级定位 prompt：
 * 问题描述 + 仓库结构 → 需要编辑的文件列表（按重要度排序，最多 5 个）
 */
export function buildFileLocalizePrompt(
  problemStatement: string,
  structure: RepoStructure,
  maxFiles = 200,
  strategyTemplate?: StrategyTemplate,
): string {
  const systemHint = strategyTemplate?.system_template
    ? `<!-- System hint (from strategy): ${strategyTemplate.system_template.slice(0, 120)}... -->\n\n`
    : ''
  return `${systemHint}Please look through the following GitHub problem description and Repository structure and provide a list of files that one would need to edit to fix the problem.

### GitHub Problem Description ###
${problemStatement}

###

### Repository Structure ###
${formatRepoStructure(structure, maxFiles)}

###

Please only provide the full path and return at most 5 files.
The returned files should be separated by new lines ordered by most to least important and wrapped with \`\`\`
For example:
\`\`\`
file1.py
file2.py
\`\`\`
`
}

/** 生成无关文件定位 prompt（可选优化） */
export function buildIrrelevantFilesPrompt(
  problemStatement: string,
  structure: RepoStructure,
  maxFiles = 200,
): string {
  return `Please look through the following GitHub problem description and Repository structure and provide a list of folders that are irrelevant to fixing the problem.
Note that irrelevant folders are those that do not need to be modified and are safe to ignored when trying to solve this problem.

### GitHub Problem Description ###
${problemStatement}

###

### Repository Structure ###
${formatRepoStructure(structure, maxFiles)}

###

Please only provide the full path.
Remember that any subfolders will be considered as irrelevant if you provide the parent folder.
Please ensure that the provided irrelevant folders do not include any important files needed to fix the problem
The returned folders should be separated by new lines and wrapped with \`\`\`
For example:
\`\`\`
folder1/
folder2/folder3/
folder4/folder5/
\`\`\`
`
}

// ============================================================================
// 第二级：相关位置定位 Prompt
// ============================================================================

/**
 * 生成位置定位 prompt：
 * 问题描述 + 相关文件内容 → class/function/line 位置（编辑点）
 */
export function buildCodeLocalizePrompt(
  problemStatement: string,
  fileContents: Record<string, string>,
  maxContentPerFile = 300,
  strategyTemplate?: StrategyTemplate,
): string {
  const fileParts: string[] = []
  for (const [file, content] of Object.entries(fileContents)) {
    const lines = content.split('\n')
    const shown = lines.slice(0, maxContentPerFile).join('\n')
    const truncated = lines.length > maxContentPerFile
      ? `\n... 共 ${lines.length} 行（仅显示前 ${maxContentPerFile} 行）`
      : ''
    fileParts.push(`### File: ${file} ###\n\`\`\`\n${shown}${truncated}\n\`\`\``)
  }

  return `Please review the following GitHub problem description and relevant files, and provide a set of locations that need to be edited to fix the issue.
The locations can be specified as class names, function or method names, or exact line numbers that require modification.

### GitHub Problem Description ###
${problemStatement}

###
${fileParts.join('\n\n')}
###

Please provide the class name, function or method name, or the exact line numbers that need to be edited.
The possible location outputs should be either "class", "function" or "line".

### Examples:
\`\`\`
full_path1/file1.py
line: 10
class: MyClass1
line: 51

full_path2/file2.py
function: MyClass2.my_method
line: 12

full_path3/file3.py
function: my_function
line: 24
line: 156
\`\`\`

Return just the location(s) wrapped with \`\`\`.
`
}

// ============================================================================
// 第三级：修复 Prompt（生成 edit_file 命令）
// ============================================================================

/**
 * 生成修复 prompt（含定位上下文）：
 * 问题描述 + 带行号的代码片段 → edit_file 命令
 */
export function buildRepairPrompt(
  problemStatement: string,
  fileContents: Record<string, string>,
  contextIntervals: Map<string, Array<[number, number]>> = new Map(),
  useCoT = false,
  strategyTemplate?: StrategyTemplate,
): string {
  const fileParts: string[] = []
  for (const [file, content] of Object.entries(fileContents)) {
    const intervals = contextIntervals.get(file)
    const wrapped = intervals
      ? wrapContentWithLines(content, intervals)
      : wrapContentWithLines(content)
    fileParts.push(`--- BEGIN FILE ---
\`\`\`
${wrapped}
\`\`\`
--- END FILE ---`)
  }

  const cotInstruction = useCoT
    ? '\nPlease first localize the bug based on the issue statement, and then generate `edit_file` commands to fix the issue.'
    : ''

  return `We are currently solving the following issue within our repository. Here is the issue text:
--- BEGIN ISSUE ---
${problemStatement}
--- END ISSUE ---

Below are some code segments, each from a relevant file. One or more of these files may contain bugs.
${fileParts.join('\n\n')}

Please generate \`edit_file\` commands to fix the issue.${cotInstruction}

The \`edit_file\` command takes four arguments:

edit_file(filename: str, start: int, end: int, content: str) -> None:
    Edit a file. It replaces lines \`start\` through \`end\` (inclusive) with the given text \`content\` in the open file.
    Args:
    filename: str: The full file name to edit.
    start: int: The start line number. Must satisfy start >= 1.
    end: int: The end line number. Must satisfy start <= end <= number of lines in the file.
    content: str: The content to replace the lines with.

Please note that THE \`edit_file\` FUNCTION REQUIRES PROPER INDENTATION. If you would like to add the line '        print(x)', you must fully write that out, with all those spaces before the code!
Wrap the \`edit_file\` command in blocks \`\`\`python...\`\`\`.
`
}

// ============================================================================
// 测试失败信息 Prompt（用于无 issue 描述时）
// ============================================================================

/**
 * 从测试失败输出生成问题描述。
 * 提取失败测试名、断言消息、堆栈中首次出现的源码文件。
 */
export function buildProblemFromTestFailure(
  testOutput: string,
  maxLines = 80,
): string {
  const lines = testOutput.split('\n')
  const relevant: string[] = []

  for (let i = 0; i < lines.length && relevant.length < maxLines; i++) {
    const line = lines[i]
    if (
      /FAIL|✗|✖|AssertionError|Error:|at |Error\b|expected|expected.*to.*be|Received/i.test(line) ||
      line.trim().startsWith('1)') ||
      line.trim().startsWith('2)')
    ) {
      relevant.push(line)
    }
  }

  return `The following test is failing:

${relevant.join('\n')}

Please fix the bug that causes this test to fail.
`
}
