import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(onDone: LocalJSXCommandOnDone) {
  onDone(`
🚀 欢迎使用 Claude Code！

以下是你可能想要了解的东西：

## 快速开始

1. **基本对话**：直接输入问题或请求，Claude 会帮助你完成任务
2. **文件操作**：可以使用 /read、/edit、/write 等工具操作文件
3. **终端命令**：可以使用 /bash 运行终端命令
4. **技能 (Skills)**：可以通过 / 键调出内置技能，如 /commit、/review 等

## 常用命令

- /help - 显示所有可用命令
- /model - 切换模型
- /effort - 设置推理深度 (仅支持的模型)
- /theme - 更改终端主题
- /vim - 切换 vim 模式
- /config - 查看/修改设置
- /mcp - 配置 MCP 服务器
- /plugin - 管理插件

## 快速提示

- 按 Ctrl + L 清屏
- 按 Ctrl + C 取消当前操作
- 按 Esc 进入计划模式
- 使用 @ 引用文件或资源

有什么具体的问题或想要尝试的功能吗？
`, { display: 'system' })
}
