import { isCompactLinePrefixEnabled } from '../../utils/file.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'

function getPreReadInstruction(): string {
  return `\n- 编辑前必须至少调用一次 \`${FILE_READ_TOOL_NAME}\` 工具读取文件，否则编辑操作将报错。`
}

export function getEditToolDescription(): string {
  return getDefaultEditDescription()
}

function getDefaultEditDescription(): string {
  const prefixFormat = isCompactLinePrefixEnabled()
    ? '行号 + Tab'
    : '空格 + 行号 + 箭头'
  const minimalUniquenessHint =
    process.env.USER_TYPE === 'ant'
      ? `\n- 使用能唯一标识目标的最短 \`old_string\`，通常 2-4 行相邻代码即可，无需提供 10 行以上的冗余上下文。`
      : ''
  return `对文件执行精确的字符串替换。

必须提供以下参数：
1. \`file_path\`：文件的绝对路径。
2. \`old_string\`：待替换的精确文本（包含所有空格、缩进、换行及周围代码）。
3. \`new_string\`：用于替换的精确文本（同样包含所有空格、缩进、换行及周围代码）。请确保替换后代码正确且风格一致。
4. 切勿对 \`old_string\` 或 \`new_string\` 进行转义，否则将破坏精确匹配要求。

**重要**：任一条件未满足工具将执行失败。
- \`old_string\` 必须能唯一标识单处修改目标，建议包含至少 3 行上下文。
- **全部替换**：若需替换文件中所有匹配项，请设置 \`replace_all: true\`。`
}