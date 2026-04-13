import { isCompactLinePrefixEnabled } from '../../../utils/file.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'

function getPreReadInstruction(): string {
  return `\n- 在编辑文件之前，你必须至少在对话中使用一）\`${FILE_READ_TOOL_NAME}\` 工具。如果你尝试在未读取文件的情况下进行编辑，此工具会报错。`
}

export function getEditToolDescription(): string {
  return getDefaultEditDescription()
}

function getDefaultEditDescription(): string {
  const prefixFormat = isCompactLinePrefixEnabled()
    ? '行号 + 制表。
    : '空格 + 行号 + 箭头'
  const minimalUniquenessHint =
    process.env.USER_TYPE === 'ant'
      ? `\n- 使用最小的 old_string 以确保唯一））通常 2-4 行相邻内容就足够了。避免包含过多上下文，除非少量内容无法唯一标识目标。`
      : ''
  return `在文件中执行精确的字符串替换。

使用说明）{getPreReadInstruction()}
- 当编）Read 工具输出的文本时，确保保留行号前缀后的实际缩进（制表符/空格）。行号前缀格式为：${prefixFormat}。前缀之后的内容才是要匹配的实际文件内容。永远不要在 old_string ）new_string 中包含行号前缀的任何部分。
- 始终优先编辑代码库中的现有文件，除非绝对必要，否则不要写入新文件。
- 仅在用户明确要求时使）emoji。避免在文件中添）emoji。
- 如果 \`old_string\` 在文件中不唯一，编辑将失败。请提供更大的字符串以包含更多周围内容使其唯一，或使用 \`replace_all\` 更改每个匹配）\`old_string\`）{minimalUniquenessHint}
- 使用 \`replace_all\` 在文件中替换和重命名字符串。此参数在例如想要重命名变量时很有用。`
}