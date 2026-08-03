import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(onDone: LocalJSXCommandOnDone) {
  onDone(`## Claude Code 更新日志

最近的版本变更：

### 2.1.220 (2026年8月)
- 错误修复和可靠性改进
- 新增 EndConversation 工具：Claude 可以在用户滥用或尝试越狱时结束会话
- 新增子代理深度嵌套支持（默认深度 3）
- 新增 emoji 短代码自动补全（:heart: → ❤️）
- 新增并发子代理数量上限（默认 20）
- 新增工作流大小指南设置
- 新增嵌套子代理转发支持
- 改进自动模式：危险命令由分类器判断而非弹出权限对话框
- 修复 Windows 路径中的 \\u 前缀被错误解析为 CJK 字符的问题
- 修复 Windows 自动更新失败导致 claude.exe 丢失的问题
- 修复长会话中内存泄漏和性能退化问题
- 修复远程控制在模型切换后保持过期状态的问题
- 修复 Vim 模式、屏幕阅读器模式、剪贴板等多个问题

### 2.1.219 (2026年7月)
- 新增 Claude Opus 5（claude-opus-5），默认 Opus 模型，1M 上下文
- 新增 sandbox.network.strictAllowlist 设置
- 新增 DirectoryAdded hook
- 新增 mcp_server_errors 到 headless 初始化事件
- 新增 workflowSizeGuideline 设置
- 嵌套子代理转发到 stream-json
- 修复 claude -p 文本输出在中途 API 错误时丢失已生成的答案
- 修复 GNU screen 中复制选择打印 base64 的问题
- 修复 Windows CLAUDE_CODE_GIT_BASH_PATH 处理
- 修复 Vim 模式左箭头键行为
- 改进 claude --teleport 显示仓库信息
- 动态工作流默认中等规模指南
- 子代理可嵌套生成子代理（最多深度 3）

### 2.1.218 (2026年7月)
- /code-review 作为后台子代理运行
- 新增屏幕阅读器删除文本通知
- 修复 Windows 路径 \\u 前缀被错误解析的问题
- 修复左箭头键丢弃对话的问题
- 修复多行粘贴折叠成一行的问题
- 修复 /context 报告过期的 token 使用量
- 修复 /ultrareview 描述性参数失败的问题
- 修复 mojibake 和工具执行器错误被静默丢弃
- 修复引擎拆除竞态条件
- 修复 PR 事件偶尔丢失的问题
- 修复 Bedrock 设置向导配置文件验证失败
- 改进自动模式：自动判断危险命令
- 改进信任对话框显示仓库根目录

### 2.1.217 (2026年7月)
- 新增 emoji 短代码自动补全
- 新增转录写入失败警告
- 修复截断的 MCP 工具输出内存泄漏
- 修复 Windows 自动更新失败
- 修复后台会话隔离不规范化符号链接
- 修复屏幕阅读器模式启动公告被截断
- 修复 --resume/--continue 在转录中有畸形附件时失败
- 修复后台 shell 有时无法停止
- 修复 transcript 预览与输入区域齐平
- 子代理不再默认生成嵌套子代理
- 修复 --max-budget-usd 不停止后台子代理

### 2.1.216 (2026年7月)
- 新增 sandbox.filesystem.disabled 设置
- 修复长会话消息归一化性能二次增长
- 修复自动模式在 OAuth 令牌过期后拒绝命令
- 修复工作树隔离的子代理重定向 git 到共享检出
- 修复后台会话工作树无法删除
- 修复 Esc-Esc 在空闲提示时不再打开倒带选择器
- 修复 Bash 命令权限检查复合语句重定向
- 修复后台子代理在启动窗口到达高优先级消息时取消
- 修复全屏模式下对话框超出面板边缘
- 修复 Prometheus 指标端点发出无效 # UNIT 行
- 改进 /fork 确认信息
- 改进 PowerShell 工具 git/gh 命令参数验证

### 2.1.215 (2026年7月)
- Claude 不再自动运行 /verify 和 /code-review 技能

### 2.1.214 (2026年7月)
- 修复单段 dir/** 允许规则自动批准写入嵌套目录
- 修复 Windows PowerShell 5.1 权限检查绕过
- 修复 Bash 权限检查文件描述符重定向形式
- 修复 Bash 权限检查对超长命令（>10,000 字符）判断错误
- 修复 Bash 权限检查 zsh 变量下标和修饰符
- 修复远程会话权限提示在本地确认对话框之前继续
- 新增 EndConversation 工具
- 新增长时间运行工具调用的定期进度心跳
- 新增 ISO modified 时间戳到 memory 文件 frontmatter
- 新增 OpenTelemetry 消息级别关联属性
- 修复 GrowthBook feature 为 null 时崩溃
- 修复 Bash 工具 pkill -f 模式匹配 CLI 自身进程

### 2.1.212 (2026年6月)
- /fork 复制对话到新的后台会话
- 新增 claude auto-mode reset
- 新增每会话 WebSearch 工具调用限制（默认 200）
- 新增每会话子代理生成上限（默认 200）
- MCP 工具调用超过 2 分钟自动移到后台
- /resume 在代理视图中打开过去会话选择器
- 修复计划模式自动运行文件修改 Bash 命令
- 修复工作树创建遵循符号链接
- 修复继续:false hook 的 halt 在工具失败时被丢弃
- 修复后台会话完成无法通过 claude rm 删除
- 修复全屏模式按键提示脚注裁剪
- 改进冷附加后台代理会话显示格式化转录
- 减少代理间消息传递中的 token 使用

### 2.1.211 (2026年6月)
- 新增 --forward-subagent-text 标志
- 修复权限预览中的双向覆盖字符
- 修复并行会话同时注销
- 修复插件 MCP 服务器空闲后不重连
- 修复 Vertex/Bedrock 启动时尝试默认 Opus 模型
- 修复子代理显式模型覆盖恢复为父代理模型
- 修复文件上传验证
- 修复 Claude in Chrome 扩展未运行时启动挂起
- 修复 /loop 隐藏会话
- 修复后台任务在 LLM 网关认证恢复后显示未登录
- 修复 claude agents 作业永久无法删除
- 修复 /clear 不重置会话费用计数器
- 改进终端布局和渲染性能

### 2.1.210 (2026年6月)
- 新增折叠工具摘要行的实时经过时间计数器
- 新增 Write/NotebookEdit/Glob 权限规则启动警告
- 修复 isolation:worktree 子代理对主仓库运行 git 变更命令
- 修复 ultracode 关键字在非人类来源输入上触发
- 修复粘贴标记泄漏到外部编辑器
- 修复 claude attach 失败
- 修复工具结果渲染器返回非 UI 元素时崩溃
- 修复回调超时误报为用户拒绝
- 修复插件 MCP 服务器在重新同步时拆除
- 修复计划批准无编辑时标记为已编辑
- 修复 Grep 内容模式分页时显示无匹配

### 2.1.133 (2026年5月7日)
- 新增 worktree.baseRef 设置 (fresh | head)
- 新增 sandbox.bwrapPath 和 sandbox.socPath 设置 (Linux/WSL)
- 新增 parentSettingsBehavior 管理层级密钥
- Hook 现在接收 effort.level JSON 输入字段
- 改进 focus 模式行为
- 修复并行会话 401 错误问题

### 2.1.132 (2026年5月6日)
- 新增 CLAUDE_CODE_SESSION_ID 环境变量
- 新增 CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN 环境变量
- 修复外部 SIGINT 处理
- 修复 --resume 崩溃问题
- 修复滚动速度问题

### 2.1.131 (2026年5月6日)
- 修复 VSCode 扩展激活失败问题

### 2.1.129 (2026年5月6日)
- 新增 --plugin-url 标志
- 新增 CLAUDE_CODE_FORCE_SYNC_OUTPUT 环境变量
- 新增 Plugin manifests 支持
- 改进 /model 选择器
- 修复焦点模式问题

### 2.1.128 (2026年5月4日)
- 新增 bare /color 功能
- /mcp 显示连接服务器的工具数量
- --plugin-dir 接受 .zip 存档
- 改进 focus 模式行为
- 修复内存使用问题

更多更新请访问: https://docs.claude.com/zh-CN/changelog`, { display: 'system' })
}
