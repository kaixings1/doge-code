# 未实现 / 未集成功能清单

> 基于更新日志 2.1.128 → 2.1.220
> 状态: 2026-08-02

---

## 一、功能模块存在但**未集成**到主流程（15 个）

> 这些功能在 `src/features/` 中有独立模块，但**从未在运行时被调用**。
> 只是定义了类/函数，没有与 QueryEngine、PromptInput、MCPTool、BashTool 等核心组件连接。

| # | 功能 | 模块文件 | 缺失的集成 |
|---|------|---------|-----------|
| 1 | **Emoji 自动补全** | `features/emojiAutocomplete.ts` | 未集成到 PromptInput 组件 |
| 2 | **MCP 自动后台化** | `features/mcpAutoBackground.ts` | 未集成到 MCPTool.execute() |
| 3 | **网络沙箱白名单** | `features/featureFlags.ts` (配置) | DEFAULT_SETTINGS 中有但 DockerSandboxManager 未读取 |
| 4 | **文件系统沙箱禁用** | `features/featureFlags.ts` (配置) | DEFAULT_SETTINGS 中有但沙箱初始化未读取 |
| 5 | **工作流大小指南** | `features/featureFlags.ts` (配置) | DEFAULT_SETTINGS 中有但工作流创建未检查 |
| 6 | **子代理并发控制** | `features/featureFlags.ts` (SubAgentManager) | QueryEngine 导入了但未在 AgentTool 中调用 |
| 7 | **子代理嵌套深度** | `features/featureFlags.ts` (配置) | DEFAULT_SETTINGS 中有但未传递给 AgentTool |
| 8 | **子代理文本转发** | `features/additionalFeatures.ts` | 未集成到 stream-json 输出 |
| 9 | **父设置行为** | `features/additionalFeatures.ts` | 未集成到 settings 层级解析 |
| 10 | **worktree.baseRef** | `features/featureFlags.ts` (配置) | DEFAULT_SETTINGS 中有但 worktree 创建未使用 |
| 11 | **沙箱路径 bwrap/soc** | `features/featureFlags.ts` (配置) | DEFAULT_SETTINGS 中有但 Linux 沙箱初始化未读取 |
| 12 | **--plugin-url** | `features/additionalFeatures.ts` | 未集成到 CLI 参数解析 |
| 13 | **WebSearch 限制** | `features/featureFlags.ts` (配置) | DEFAULT_SETTINGS 中有但 WebSearchTool 未检查 |
| 14 | **后台代码审查** | `features/additionalFeatures.ts` | 未集成到 /code-review 命令 |
| 15 | **Fork 对话复制** | `features/additionalFeatures.ts` | 未集成到 /fork 命令 |
| 16 | **自动模式重置** | `features/additionalFeatures.ts` | 未集成到 /config 或 CLI |
| 17 | **MCP 错误报告** | `features/additionalFeatures.ts` | 未集成到 MCP 初始化流程 |
| 18 | **TURN 服务器** | RemotePanel 中有配置 | 仅有 UI，未集成到 WebRTC 连接 |

---

## 二、已集成到主流程（4 个）

| # | 功能 | 集成位置 | 实际效果 |
|---|------|---------|---------|
| 1 | **EndConversation** | `QueryEngine.query()` | 输入包含"越狱"/"忽略规则"等关键词时自动终止会话 ✅ |
| 2 | **自动模式管理** | `BashTool.checkPermissions()` | 危险命令（rm -rf, sudo）在权限检查前被拦截 ✅ |
| 3 | **DirectoryAdded Hook** | `/add-dir` 命令 | 注册新目录后触发 hook 事件 ✅ |
| 4 | **子代理并发控制** | `QueryEngine` 构造函数 | SubAgentManager 已初始化但未在 AgentTool 逻辑中使用 ⚠️ |

---

## 三、已实现 ✅（来自早期更新日志）

| 功能 | 版本 | 状态 |
|------|------|------|
| CLAUDE_CODE_SESSION_ID | 2.1.132 | ✅ 已实现 |
| CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN | 2.1.132 | ✅ 已实现 |
| --max-budget-usd | 2.1.217 | ✅ 已实现（QueryEngine.ts） |
| effort.level Hook | 2.1.133 | ✅ 已实现 |
| 桥接服务器 | 2.1.219 | ✅ 基础功能已实现 |
| CRDT 文档协作 | 2.1.218 | ✅ 已实现 |
| 批量处理引擎 | - | ✅ 已实现 |
| 插件沙箱安全 | - | ✅ 已实现 |

---

## 四、需要完成的工作

### 必须做（让功能真正生效）：

1. **Emoji 自动补全** → 修改 `PromptInput.tsx`，在输入时调用 `EmojiAutocompleter.getSuggestions()`
2. **MCP 自动后台化** → 修改 `MCPTool.call()`，调用 `MCPAutoBackgroundManager.trackCall()`
3. **子代理并发控制** → 修改 `AgentTool`，在生成子代理前调用 `SubAgentManager.canSpawn()` 和 `SubAgentManager.spawn()`
4. **网络沙箱白名单** → 修改 `DockerSandboxManager`，读取 `sandboxNetworkStrictAllowlist` 配置
5. **文件系统沙箱禁用** → 修改沙箱初始化代码，读取 `sandboxFilesystemDisabled` 配置
6. **工作流大小指南** → 修改工作流创建代码，读取 `workflowSizeGuideline` 配置
7. **WebSearch 限制** → 修改 `WebSearchTool`，检查 `maxWebSearchesPerSession`
8. **后台代码审查** → 修改 `/code-review` 命令，使用 `CodeReviewBackgroundManager.startReview()`
9. **TURN 服务器** → `RemoteControlPanel.tsx` 中的 ICE 配置需要连接到信令服务器
10. **自动模式重置** → 添加 `/auto-mode-reset` 命令或集成到 `/config`

### 可选做（增强功能）：

11. **子代理文本转发** → 修改 stream-json 输出逻辑
12. **父设置行为** → 修改 settings 层级合并逻辑
13. **worktree.baseRef** → 修改 worktree 创建逻辑
14. **--plugin-url** → 修改 CLI 启动参数解析
15. **Fork 对话复制** → 修改 `/fork` 命令使用 ForkManager
16. **MCP 错误报告** → 修改 MCP 初始化错误处理
