import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'

export const FILE_WRITE_TOOL_NAME = 'Write'
export const DESCRIPTION = '将文件写入本地文件系统。'

function getPreReadInstruction(): string {
  return `\n- 如果这是一个已存在的文件，你必须首先使用 ${FILE_READ_TOOL_NAME} 工具读取该文件的内容。若未事先读取，本工具将执行失败。`
}

export function getWriteToolDescription(): string {
  return `将文件写入本地文件系统。

用法说明：
- 如果提供的路径上已存在文件，本工具将覆盖该文件。${getPreReadInstruction()}
- 对于修改现有文件，建议优先使用 Edit 工具——它仅发送差异内容。本工具仅用于创建新文件或进行完整重写。
- 除非用户明确要求，否则绝不要创建文档文件（*.md）或 README 文件。
- 仅当用户明确请求时才使用表情符号。除非要求，否则避免在文件中写入表情符号。`
}