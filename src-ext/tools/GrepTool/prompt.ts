import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'

export const GREP_TOOL_NAME = 'Grep'

export function getDescription(): string {
  return `基于 ripgrep 构建的高性能搜索工具

用法：
- 搜索任务必须使用 ${GREP_TOOL_NAME}，禁止将 \`grep\` 或 \`rg\` 作为 ${BASH_TOOL_NAME} 命令执行。${GREP_TOOL_NAME} 已针对权限与访问进行优化。
- 支持完整正则语法（例："log.*Error"、"function\\s+\\w+"）
- 文件筛选：glob 参数（例："*.js"、"**/*.tsx"）或 type 参数（例："js"、"py"、"rust"）
- 输出模式：
  - \`"content"\`：显示匹配行
  - \`"files_with_matches"\`：仅显示文件路径（默认）
  - \`"count"\`：显示匹配计数
- 需多轮探索的开放式搜索请使用 ${AGENT_TOOL_NAME}
- 模式语法遵循 ripgrep（非 grep），字面量花括号需转义（如搜索 Go 代码中的 \`interface{}\` 应写为 \`interface\\{\\}\`）
- 默认仅匹配单行内内容。若需跨行匹配（例：\`struct \\{[\\s\\S]*?field\`），请启用 \`multiline: true\`
`
}