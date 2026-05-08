import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(onDone: LocalJSXCommandOnDone) {
  onDone(`## Claude Code 文档索引

以下是 Claude Code 文档的完整索引，你可以从中找到感兴趣的主题：

### 核心功能
- **安装与设置** - 如何安装和初始配置
- **基本用法** - 日常使用的基础知识
- **技能 (Skills)** - 内置和自定义技能
- **MCP 服务器** - 扩展 Claude 的能力
- **插件** - 安装和管理插件

### 高级功能
- **工作区管理** - 项目、文件和目录处理
- **终端集成** - 在不同终端中的表现
- **IDE 集成** - VS Code、JetBrains 等 IDE 支持
- **自定义命令** - 创建专属命令
- **钩子系统** - 在关键时点执行自定义代码

### 参考
- **命令参考** - 所有斜杠命令的说明
- **设置参考** - 所有配置选项
- **工具参考** - 可用的工具列表
- **API 参考** - Claude Code SDK 和 API

要获取具体文档，请访问: https://code.claude.com/docs/`, { display: 'system' })
}
