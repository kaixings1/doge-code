import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(onDone: LocalJSXCommandOnDone) {
  onDone(`## Claude Code 更新日志

最近的版本变更：

### 2.1.133 (May 7, 2026)
- 新增 worktree.baseRef 设置 (fresh | head)
- 新增 sandbox.bwrapPath 和 sandbox.socPath 设置 (Linux/WSL)
- 新增 parentSettingsBehavior 管理层级密钥
- Hook 现在接收 effort.level JSON 输入字段
- 改进 focus 模式行为
- 修复并行会话 401 错误问题

### 2.1.132 (May 6, 2026)
- 新增 CLAUDE_CODE_SESSION_ID 环境变量
- 新增 CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN 环境变量
- 修复外部 SIGINT 处理
- 修复 --resume 崩溃问题
- 修复滚动速度问题

### 2.1.131 (May 6, 2026)
- 修复 VSCode 扩展激活失败问题

### 2.1.129 (May 6, 2026)
- 新增 --plugin-url 标志
- 新增 CLAUDE_CODE_FORCE_SYNC_OUTPUT 环境变量
- 新增 Plugin manifests 支持
- 改进 /model 选择器
- 修复焦点模式问题

### 2.1.128 (May 4, 2026)
- 新增 bare /color 功能
- /mcp 显示连接服务器的工具数量
- --plugin-dir 接受 .zip 存档
- 改进 focus 模式行为
- 修复内存使用问题

更多更新请访问: https://docs.claude.com/zh-CN/changelog`, { display: 'system' })
}
