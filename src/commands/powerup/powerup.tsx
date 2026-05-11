import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(onDone: LocalJSXCommandOnDone) {
  onDone(`## 欢迎参加 Claude Code 训练营！

Claude Code 刚发布了许多新功能，让我们一起来探索吧：

### 本期课程内容

1. **新的终端界面**
   - 闪烁免模式 (/tui)
   - 全屏体验
   - 鼠标支持

2. **增强的技能系统**
   - /skills 命令
   - 自定义技能
   - 插件集成

3. **全新的工具**
   - WebBrowser 工具
   - Database 工具
   - GraphQL 工具
   - WebSocket 工具

4. **工作流程优化**
   - 自动补全
   - 上下文感知
   - 更智能的权限提示

### 学习方式

输入你想要尝试的功能名称，或直接开始探索。

例如："试一下 /tui 模式" 或 "告诉我新功能"

准备好了吗？开始吧！`, { display: 'system' })
}
