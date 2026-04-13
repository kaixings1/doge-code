import { isPDFSupported } from '../../../utils/pdfUtils.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'

// 使用字符串常量作为工具名称，避免循环依赖
export const FILE_READ_TOOL_NAME = 'Read'

export const FILE_UNCHANGED_STUB =
  '文件自上次读取后未更改。本次对话中早些时候的读取结果仍然有效 —）请参考之前的内容而非重新读取。

export const MAX_LINES_TO_READ = 2000

export const DESCRIPTION = '从本地文件系统读取文件。

export const LINE_FORMAT_INSTRUCTION =
  '- 结果使用 cat -n 格式返回，行号从 1 开。

export const OFFSET_INSTRUCTION_DEFAULT =
  "- 你可以选择指定行偏移量和限制数量（对于长文件特别方便），但建议不提供这些参数以读取整个文件"

export const OFFSET_INSTRUCTION_TARGETED =
  '- 当你已经知道需要文件的哪个部分时，只读取那部分。这对于较大的文件很重要。

/**
 * 渲染 Read 工具的提示模板。调用者（FileReadTool）提供运行时计算的部分。
 */
export function renderPromptTemplate(
  lineFormat: string,
  maxSizeInstruction: string,
  offsetInstruction: string,
): string {
  return `从本地文件系统读取文件。你可以直接通过此工具访问机器上的任何文件。
假设此工具能够读取机器上的所有文件。如果用户提供了文件路径，假设该路径是有效的。读取不存在的文件也可以，会返回错误。

用法。
- file_path 参数必须是绝对路径，不能是相对路。
- 默认情况下，最多读）${MAX_LINES_TO_READ} 行，从文件开头开）{maxSizeInstruction}
${offsetInstruction}
${lineFormat}
- 此工具可以让 Claude Code 读取图像（如 PNG、JPG 等）。读取图像文件时，内容会以视觉方式呈现，因为 Claude Code 是多模）LLM）{
    isPDFSupported()
      ? '\n- 此工具可以读）PDF 文件）pdf）。对于大）PDF（超）10 页），你必须提供 pages 参数来读取特定页面范围（例如，pages: "1-5"）。没）pages 参数读取大型 PDF 会失败。每次请求最）20 页。
      : ''
  }
- 此工具可以读）Jupyter 笔记本（.ipynb 文件），返回所有单元格及其输出，包括代码、文本和可视化内容。
- 此工具只能读取文件，不能读取目录。要读取目录，请使用 ${BASH_TOOL_NAME} 工具）ls 命令。
- 你会经常被要求读取截图。如果用户提供了截图路径，请始终使用此工具查看该路径的文件。此工具适用于所有临时文件路径。
- 如果你读取了一个存在但内容为空的文件，你会收到系统提醒警告，而不是文件内容。`
}