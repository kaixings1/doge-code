import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(onDone: LocalJSXCommandOnDone) {
  onDone(`## 全屏终端界面 (TUI)

你目前正在使用的是标准终端界面。以下是切换到全屏模式的好处：

### 闪烁免模式 (Flicker-Free)
- **更低的内存使用** - 虚拟滚动回收
- **鼠标支持** - 可以选择和复制文本
- **自动复制** - 选择文本时自动复制
- **更平滑的滚动** - 流畅的滚动体验

### 使用方法
1. 在终端中输入 \`export CLAUDE_CODE_NO_FLICKER=1\` 设置环境变量
2. 重启 Claude Code
3. 或在设置中启用对应的选项

### 快捷键
- \`Ctrl+L\` - 强制刷新屏幕
- \`Ctrl+O\` - 切换详细视图
- \`F9\` - 打开菜单

### 注意
某些旧版终端不支持此功能。在那种终端中，Claude Code 会自动回退到标准模式。

要禁用此功能，可以设置 \`export CLAUDE_CODE_NO_FLICKER=0\`。`, { display: 'system' })
}
