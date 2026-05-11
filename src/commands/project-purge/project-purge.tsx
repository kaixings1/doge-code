import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(onDone: LocalJSXCommandOnDone, args: string) {
  onDone(`## 项目清理

此命令将删除当前项目的所有 Claude Code 状态，包括：

- 所有会话转录
- 任务状态
- 文件历史
- 配置条目

### 用法

\`claude project-purge [路径]\`

### 选项

- \`--dry-run\` - 显示将要删除的内容但不实际删除
- \`--yes\` 或 \`--y\` - 无确认直接删除
- \`--interactive\` 或 \`--i\` - 交互式确认

⚠️ 此操作不可撤销！

确定要继续吗？请输入 \`--yes\` 确认。`, { display: 'system' })
}
