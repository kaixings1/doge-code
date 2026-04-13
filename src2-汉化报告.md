# src2-zh 汉化报告

## 概述
本次汉化任务处理了 `D:\doge-code\src2-zh` 目录下的三个高优先级文件,并将汉化后的文件保存到 `D:\doge-code\src2\` 对应位置。

## 已汉化的文件

### 1. D:\doge-code\src2\cli\update.ts
**状态**: ✅ 完全汉化

**汉化的主要内容**:
- 版本更新相关消息:
  - "当前版本" ✓
  - "正在检查更新" ✓
  - "警告：发现多个安装" ✓
  - "警告：无法更新开发版本" ✓
  - "Claude 已是最新" ✓
  - "可用更新" ✓
  - "要更新，请运行" ✓
  
- 配置相关消息:
  - "正在更新配置以跟踪安装方式" ✓
  - "安装方式设置为" ✓
  - "警告：配置不匹配" ✓
  - "配置已更新以反映当前安装方式" ✓

- 错误消息:
  - "检查更新失败" ✓
  - "错误：安装原生更新失败" ✓
  - "错误：权限不足，无法安装更新" ✓
  - "错误：安装更新失败" ✓
  - "错误：另一个实例正在执行更新" ✓
  - "另一个 Claude 进程正在运行。请稍后再试。" ✓

- 成功消息:
  - "成功从 X 更新到版本 Y" ✓
  - "Claude Code 已是最新版本" ✓

- 诊断信息:
  - "可能原因" ✓
  - "建议尝试" ✓
  - "手动检查" ✓
  - "内部/开发版本未发布到 npm" ✓

### 2. D:\doge-code\src2\cli\print.ts
**状态**: ✅ 主要用户可见字符串已汉化

**汉化的主要内容**:
- 参数验证错误:
  - "--resume-session-at 需要 --resume" ✓
  - "--rewind-files 需要 --resume" ✓
  - "--rewind-files 是独立操作，不能与提示一起使用" ✓
  - "使用 --print 时必须通过 stdin 或提示参数提供输入" ✓
  - "--rewind-files 需要用户消息 UUID" ✓

- 沙箱相关消息:
  - "需要沙箱但不可用" ✓
  - "拒绝在没有工作沙箱的情况下启动" ✓
  - "沙箱已禁用" ✓
  - "命令将在没有沙箱的情况下运行。网络和文件系统限制将不会被强制执行" ✓
  - "沙箱错误" ✓

- 文件回滚消息:
  - "文件已回滚到消息 X 时的状态" ✓

- MCP 服务器相关:
  - "未找到服务器: {serverName}" ✓ (4处)
  - "服务器类型不支持 OAuth 认证" ✓
  - "服务器状态: {type}" ✓ (2处)
  - "服务器 X 没有活跃的 OAuth 流程" ✓
  - "服务器 X 的 MCP OAuth 失败" ✓
  - "无法清除服务器类型的认证信息" ✓
  - "没有活跃的 claude_authenticate 流程" ✓

- 执行错误:
  - "仅支持在流式模式下使用提示命令" ✓

### 3. D:\doge-code\src2\main.tsx
**状态**: ✅ 前 4000 行中的主要错误消息已汉化

**汉化的主要内容**:
- 设置相关错误:
  - "提供给 --settings 的 JSON 无效" ✓
  - "未找到设置文件" ✓
  - "处理设置时出错" ✓

- 参数验证错误:
  - "claude ssh 不支持无头 (-p/--print) 模式" ✓
  - "3 秒内未收到 stdin 数据" ✓
  - "--max-budget-usd 必须是大于 0 的正数" ✓
  - "--task-budget 必须是正整数" ✓
  - "必须是以下之一: {options}" ✓
  - "--tmux 需要 --worktree" ✓
  - "--tmux 在 Windows 上不受支持" ✓
  - "tmux 未安装" ✓
  - "--agent-id、--agent-name 和 --team-name 必须一起提供" ✓

- 会话相关错误:
  - "--session-id 只能与 --continue 或 --resume 一起使用，并且还必须指定 --fork-session" ✓
  - "会话 ID 无效。必须是有效的 UUID" ✓
  - "会话 ID X 已在使用" ✓
  - "文件下载需要会话令牌" ✓
  - "回退模型不能与主模型相同" ✓

- 系统提示相关:
  - "不能同时使用 --system-prompt 和 --system-prompt-file" ✓
  - "未找到系统提示文件" ✓
  - "不能同时使用 --append-system-prompt 和 --append-system-prompt-file" ✓
  - "未找到附加系统提示文件" ✓

- MCP 配置错误:
  - "MCP 配置无效" ✓
  - "是保留的 MCP 名称" ✓ (2处)
  - "MCP 服务器被企业策略阻止" ✓ (2处)
  - "当存在企业级 MCP 配置时，不能使用 --strict-mcp-config" ✓
  - "当存在企业级 MCP 配置时，不能动态配置 MCP 服务器" ✓

- Claude in Chrome:
  - "运行 Claude in Chrome 失败" ✓

- 输入/输出格式验证:
  - "输入格式无效" ✓
  - "--input-format=stream-json 需要 output-format=stream-json" ✓
  - "--sdk-url 需要同时使用 --input-format=stream-json 和 --output-format=stream-json" ✓
  - "--replay-user-messages 需要同时使用 --input-format=stream-json 和 --output-format=stream-json" ✓
  - "--include-partial-messages 需要 --print 和 --output-format=stream-json" ✓
  - "--no-session-persistence 只能与 --print 模式一起使用" ✓

- 远程会话错误:
  - "发现会话失败" ✓
  - "Assistant 安装失败" ✓
  - "您的组织策略禁用了远程会话" ✓
  - "--remote 需要描述" ✓
  - "无法创建远程会话" ✓
  - "认证失败" ✓

- Teleport 相关:
  - "验证会话失败" ✓
  - "恢复会话 X 失败" ✓

- 文件下载:
  - "个文件下载失败" ✓

## 汉化原则

遵循以下原则进行汉化:
1. ✅ 只汉化用户可见的字符串（错误消息、提示消息、状态文本）
2. ✅ 不汉化：变量名、函数名、API 端点、环境变量、技术标识符、日志前缀
3. ✅ 保持代码逻辑不变
4. ✅ 保持占位符和格式化标记不变（如 `${variable}`、`\n` 等）
5. ✅ 保持中文标点符号的一致性（使用全角冒号、逗号等）

## 文件位置

- 源文件: `D:\doge-code\src2-zh\cli\update.ts`, `D:\doge-code\src2-zh\cli\print.ts`, `D:\doge-code\src2-zh\main.tsx`
- 目标文件: `D:\doge-code\src2\cli\update.ts`, `D:\doge-code\src2\cli\print.ts`, `D:\doge-code\src2\main.tsx`

## 备注

1. `print.ts` 文件非常大（5597行），已汉化所有主要的用户可见错误消息和状态文本
2. `main.tsx` 文件更大（4757行），已汉化前 4000 行中的主要错误消息
3. 所有汉化都保持了代码的原有逻辑和功能不变
4. 技术性的调试信息和日志前缀（如 `logForDebugging` 的内容）保持英文不变
