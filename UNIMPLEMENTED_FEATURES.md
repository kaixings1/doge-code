# 功能实现状态

> 基于更新日志 2.1.128 → 2.1.220
> 更新时间: 2026-08-02

---

## ✅ 已完全集成（9 个）

| # | 功能 | 集成位置 | 版本 | 状态 |
|---|------|---------|------|------|
| 1 | **EndConversation 工具** | `QueryEngine.query()` — 检测恶意输入自动终止会话 | 2.1.214 | ✅ 完成 |
| 2 | **自动模式管理** | `BashTool.checkPermissions()` — 危险命令自动拦截 | 2.1.217 | ✅ 完成 |
| 3 | **DirectoryAdded Hook** | `/add-dir` 命令 — 注册目录后触发 hook | 2.1.219 | ✅ 完成 |
| 4 | **子代理并发控制** | `AgentTool.call()` — `SubAgentManager.canSpawn()` 检查 | 2.1.217 | ✅ 完成 |
| 5 | **Emoji 短代码替换** | `PromptInput.onSubmit()` — 发送前替换 `:shortcode:` | 2.1.217 | ✅ 完成 |
| 6 | **MCP 自动后台化** | MCP 客户端 — 调用前后跟踪 | 2.1.212 | ✅ 完成 |
| 7 | **新增配置项** | `ProjectConfig` — 16 个新设置 | 多个版本 | ✅ 完成 |
| 8 | **/auto-mode-reset** | 新命令 `/auto-mode-reset` | 2.1.212 | ✅ 完成 |
| 9 | **/mcp-discovery** | 新命令 `/mcp-discovery` | 2.1.219 | ✅ 完成 |

## 🔄 模块已创建，需要深度集成（10 个）

| # | 功能 | 模块文件 | 当前状态 | 待完成 | 版本 |
|---|------|---------|---------|--------|------|
| 10 | **Emoji 自动补全 UI** | `features/emojiAutocomplete.ts` | 替换逻辑已集成 | PromptInput 建议下拉列表 | 2.1.217 |
| 11 | **子代理并发环境变量** | `features/featureFlags.ts` | AgentTool 已集成 | `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` 读取 | 2.1.217 |
| 12 | **网络沙箱白名单** | `features/featureFlags.ts` | 配置已定义 | DockerSandboxManager 读取配置 | 2.1.219 |
| 13 | **文件系统沙箱禁用** | `features/featureFlags.ts` | 配置已定义 | 沙箱初始化读取配置 | 2.1.216 |
| 14 | **工作流大小指南** | `features/featureFlags.ts` | 配置已定义 | 工作流创建检查 | 2.1.219 |
| 15 | **子代理文本转发** | `features/additionalFeatures.ts` | 模块已创建 | stream-json 输出集成 | 2.1.211 |
| 16 | **父设置行为** | `features/additionalFeatures.ts` | 模块已创建 | settings 层级合并 | 2.1.133 |
| 17 | **worktree.baseRef** | `features/featureFlags.ts` | 配置已定义 | worktree 创建使用 | 2.1.133 |
| 18 | **--plugin-url** | `features/additionalFeatures.ts` | 模块已创建 | CLI 参数解析 | 2.1.129 |
| 19 | **WebSearch 限制** | `features/featureFlags.ts` | 配置已定义 | WebSearchTool 检查 | 2.1.212 |

## ✅ 早期版本已实现（4 个）

| 功能 | 版本 | 状态 |
|------|------|------|
| CLAUDE_CODE_SESSION_ID | 2.1.132 | ✅ 已实现 |
| CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN | 2.1.132 | ✅ 已实现 |
| --max-budget-usd | 2.1.217 | ✅ 已实现 |
| effort.level Hook | 2.1.133 | ✅ 已实现 |

## 📊 统计

| 类别 | 数量 | 占比 |
|------|------|------|
| ✅ 已完全集成 | 9/19 | 47% |
| 🔄 模块已创建，待深度集成 | 10/19 | 53% |
| ✅ 早期版本已实现 | 4/4 | 100% |
| **总计功能模块** | **19/19** | **100%** |
| **深度集成** | **9/19** | **47%** |

## 🎯 下一步：将 🔄 全部变为 ✅

需要完成以下集成工作：

### 高优先级
1. **Emoji 自动补全 UI** — 在 PromptInput 中添加建议下拉列表
2. **子代理并发环境变量** — SubAgentManager 读取 `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`
3. **网络沙箱白名单** — DockerSandboxManager 读取 `sandboxNetworkStrictAllowlist`
4. **文件系统沙箱禁用** — 沙箱初始化读取 `sandboxFilesystemDisabled`
5. **工作流大小指南** — 工作流创建时检查 `workflowSizeGuideline`

### 中优先级
6. **子代理文本转发** — stream-json 输出集成
7. **父设置行为** — settings 层级合并逻辑
8. **worktree.baseRef** — worktree 创建使用配置
9. **--plugin-url** — CLI 参数解析
10. **WebSearch 限制** — WebSearchTool 检查搜索次数
