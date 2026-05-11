import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(onDone: LocalJSXCommandOnDone, args: string) {
  const teamName = args?.trim() || '你的团队'
  
  onDone(`## 团队成员快速上手指南 - ${teamName}

生成一份适合团队成员的 Claude Code 使用指南：

### 如何使用这份指南

1. 将这份文档分享给新的团队成员
2. 他们可以按照顺序完成每个部分
3. 或根据需要跳到相应章节

### 指南内容

#### 1. 环境准备
- 安装 Claude Code: \`curl -fsSL https://install.claude.ai | sh\`
- 第一次运行时完成登录
- 配置基本设置: \`claude /config\`

#### 2. 基本操作
- 如何提问: 直接输入问题或需求
- 文件读写: /read, /edit, /write
- 终端命令: /bash

#### 3. 团队规范
- 共享设置: 将 .claude/settings.json 纳入版本控制
- 技能约定: 团队 agreed 的技能列表
- 代码审查: 使用 /review 进行代码审查

#### 4. 高效工作
- 快捷键大全
- 自定义命令
- 插件推荐

需要我帮忙定制这份指南吗？请告诉我你的团队名称和具体需求。`, { display: 'system' })
}
