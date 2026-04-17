import { isCompactLinePrefixEnabled } from '../../utils/file.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'

function getPreReadInstruction(): string {
  return `\n- You must use your \`${FILE_READ_TOOL_NAME}\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file. `
}

export function getEditToolDescription(): string {
  return getDefaultEditDescription()
}

function getDefaultEditDescription(): string {
  const prefixFormat = isCompactLinePrefixEnabled()
    ? 'line number + tab'
    : 'spaces + line number + arrow'
  const minimalUniquenessHint =
    process.env.USER_TYPE === 'ant'
      ? `\n- Use the smallest old_string that's clearly unique — usually 2-4 adjacent lines is sufficient. Avoid including 10+ lines of context when less uniquely identifies the target.`
      : ''
  return `Performs exact string replacements in files.

必须提供以下参数：
1. \`file_path\` 必须是绝对路径；否则将抛出错误。
2. \`old_string\` 必须是确切的字面文本要替换（包括所有空格、缩进、换行符和周围的代码等）。
3. \`new_string\` 必须是确切的字面文本替换 \`old_string\`（也包括所有空格、缩进、换行符和周围的代码等）。确保最终代码正确且符合习惯。
4. 永远不要转义 \`old_string\` 或 \`new_string\`，这会破坏确切的字面文本要求。
**重要**：如果上述任何一项未满足，该工具将失败。对于 \`old_string\`：必须唯一标识要更改的单个实例。包括至少3行前后文。
**全部替换**：设置 \`replace_all\` 为 true 当你想替换所有匹配 \`old_string\` 的实例。`;
}
