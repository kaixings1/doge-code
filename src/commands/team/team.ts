import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(onDone: LocalJSXCommandOnDone, args: string) {
  onDone(`## 团队管理

团队相关命令：

- \`/team-onboarding\` - 为新成员生成入门指南
- \`/team-members\` - 列出团队成员信息
- \`/team-settings\` - 管理团队共享设置

### 用法

\`/team <子命令> [选项]\`

例如：
- \`/team onboarding\` - 生成团队 onboarding 指南
- \`/team members\` - 查看团队成员
- \`/team settings\` - 管理团队设置`, { display: 'system' })
}
