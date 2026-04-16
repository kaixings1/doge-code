import { isPDFSupported } from '../../utils/pdfUtils.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'

// 使用字符串常量表示工具名称，以避免循环依赖
export const FILE_READ_TOOL_NAME = 'Read'

export const FILE_UNCHANGED_STUB =
  '自上次读取以来文件未发生更改。会话中先前的 Read tool_result 中的内容仍然有效——请参考该结果，无需重复读取。'

export const MAX_LINES_TO_READ = 2000

export const DESCRIPTION = '从本地文件系统读取文件。'

export const LINE_FORMAT_INSTRUCTION =
  '- 返回结果采用 cat -n 格式，行号从 1 开始编号'

export const OFFSET_INSTRUCTION_DEFAULT =
  '- 您可以选择指定行偏移量和读取行数限制（对于大文件尤其有用），但建议不提供这些参数以读取整个文件'

export const OFFSET_INSTRUCTION_TARGETED =
  '- 当您已经明确需要文件的哪一部分时，请只读取那一部分。这在处理大文件时尤为重要。'

/**
 * 渲染 Read 工具的提示模板。调用方（FileReadTool）负责提供运行时计算得出的各部分内容。
 */
export function renderPromptTemplate(
  lineFormat: string,
  maxSizeInstruction: string,
  offsetInstruction: string,
): string {
  return `从本地文件系统读取文件。您可以使用此工具直接访问任何文件。
请假定此工具能够读取本机上的所有文件。如果用户提供了一个文件路径，请假定该路径是有效的。尝试读取一个不存在的文件也是允许的；此时会返回错误信息。

用法说明：
- file_path 参数必须为绝对路径，而非相对路径
- 默认情况下，从文件开头读取最多 ${MAX_LINES_TO_READ} 行内容${maxSizeInstruction}
${offsetInstruction}
${lineFormat}
- 此工具允许 Claude Code 读取图像（例如 PNG、JPG 等）。读取图像文件时，内容会以视觉形式呈现，因为 Claude Code 是一个多模态大语言模型。${
    isPDFSupported()
      ? '\n- 此工具支持读取 PDF 文件（.pdf）。对于超过 10 页的大型 PDF，您必须提供 pages 参数来指定页码范围（例如 pages: "1-5"）。读取大型 PDF 时不提供 pages 参数将会失败。每次请求最多支持 20 页。'
      : ''
  }
- 此工具可以读取 Jupyter notebook（.ipynb 文件），并返回所有单元格及其输出，包括代码、文本和可视化内容的组合。
- 此工具只能读取文件，不能读取目录。若要读取目录内容，请通过 ${BASH_TOOL_NAME} 工具执行 ls 命令。
- 您会经常被要求读取屏幕截图。如果用户提供了屏幕截图的路径，请务必使用此工具查看该路径下的文件。此工具适用于所有临时文件路径。
- 如果您读取了一个存在但内容为空的文件，系统将在原本应显示文件内容的位置返回一条提醒警告。`
}