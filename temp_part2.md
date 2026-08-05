---

# 第十一部分：环境变量与配置

## 11.1 核心环境变量

| 变量名 | 说明 | 默认值 | 使用场景 |
|--------|------|--------|----------|
| `CLAUDE_CONFIG_DIR` | 配置目录 | `~/.doge` | 指定独立配置目录 |
| `CLAUDE_CODE_*` | 项目环境变量 | — | 项目级配置覆盖 |
| `LOG_LEVEL` | 日志级别 | `info` | 调试时设为 `debug` |
| `BUN_CONFIG_NO_CLEAR` | Bun 配置 | — | 控制 Bun 缓存行为 |
| `NODE_ENV` | 运行环境 | `production` | 开发时设为 `development` |
| `ANTHROPIC_API_KEY` | Anthropic API Key | — | 使用 Anthropic 接口时 |
| `ANTHROPIC_BASE_URL` | Anthropic Base URL | — | 自定义代理地址 |
| `OPENAI_API_KEY` | OpenAI API Key | — | 使用 OpenAI 兼容接口时 |
| `OPENAI_BASE_URL` | OpenAI Base URL | — | 自定义 OpenAI 代理地址 |

## 11.2 配置文件层级

```
~/.doge/
├── .claude.json          ← 全局配置（API Key、模型列表、默认设置）
├── projects/
│   └── <project-hash>/
│       ├── memory/       ← 记忆系统
│       └── sessions/     ← 会话历史
└── skills/               ← 全局技能

<项目根目录>/
├── .doge/                ← 项目级配置
│   ├── models.json       ← 项目模型配置
│   └── settings.json     ← 项目设置
├── .dogerules            ← 项目持久化规则
├── .dogerules.local      ← 本地持久化规则
├── .claudeskills/        ← 项目技能
└── CLAUDE.md             ← 项目上下文（AI 读取）
```

## 11.3 模型配置

每个项目可独立配置模型，实现"简单任务用轻量模型，关键步骤用云端强力模型"：

```json
// .doge/models.json 示例
{
  "models": [
    {
      "name": "本地模型",
      "provider": "openai-compatible",
      "baseUrl": "http://localhost:11434/v1",
      "apiKey": "ollama",
      "model": "qwen2.5-coder:32b",
      "maxTokens": 8192
    },
    {
      "name": "云端模型",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "sk-ant-xxx",
      "model": "claude-sonnet-4-6",
      "maxTokens": 200000
    }
  ],
  "defaultModel": "本地模型"
}
```

## 11.4 提交规范配置

```bash
# 提交消息自动追加时间戳（通过 .git/hooks/commit-msg）
# 格式：[yyyy-mm-dd HH:MM:SS]
# .gitignore 自动同步暂存
```

---

# 第十二部分：插件系统

## 12.1 插件类型

| 类型 | 位置 | 说明 |
|------|------|------|
| 内置插件 | `src/plugins/bundled/` | 系统自带，不可卸载 |
| 第三方插件 | `~/.doge/plugins/` | 用户安装 |
| 项目插件 | `.doge/plugins/` | 项目级插件 |

## 12.2 内置插件

| 插件 | 文件 | 功能 |
|------|------|------|
| 自动属性 | `auto-attributes.ts` | 自动为工具调用添加属性 |
| 增长追踪 | `growthbook-tracking.ts` | GrowthBook 功能标记追踪 |
| 第三方追踪 | `third-party-tracking.ts` | 第三方分析追踪 |
| 开发工具 | `devtools.ts` | 开发者工具集成 |

## 12.3 插件管理

```cmd
/plugins              ← 查看所有插件及其状态
/plugin               ← 管理单个插件（启用/禁用/配置）
/reload-plugins       ← 重新加载所有插件
```

## 12.4 插件 API

```typescript
// 插件接口定义
interface Plugin {
  name: string;
  version: string;
  description: string;
  hooks?: HookHandlers;
  tools?: ToolDefinition[];
  commands?: CommandDefinition[];
}
```

---

# 第十三部分：Hooks 钩子系统

Hooks 是在特定事件发生时自动执行的 shell 命令，用于自动化工作流。

## 13.1 Hook 类型

| Hook 名称 | 触发时机 | 典型用途 |
|-----------|----------|----------|
| `PreToolUse` | 工具执行前 | 验证输入、记录日志、阻止危险操作 |
| `PostToolUse` | 工具执行后 | 格式化输出、触发后续操作 |
| `UserPromptSubmit` | 用户提交消息前 | 注入上下文、验证提示词 |
| `Notification` | 系统通知时 | 声音提醒、桌面通知 |
| `Stop` | AI 停止生成时 | 任务完成提醒、状态更新 |
| `SubagentStop` | 子代理停止时 | 汇总子代理结果 |
| `PreCompact` | 上下文压缩前 | 保存关键信息 |

## 13.2 Hook 配置

Hook 在 `settings.json` 中配置：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Tool executed' >> ~/.doge/tool-log.txt"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell -c (New-Object.Media.SoundPlayer 'C:\\notify.wav').PlaySync()"
          }
        ]
      }
    ]
  }
}
```

## 13.3 Hook 管理命令

```cmd
/hooks                ← 管理 Hook 配置
```

## 13.4 Hook 执行规则

- Hook 在工具调用等事件发生时由 harness 执行（不是 Claude 执行）
- Hook 失败会阻止工具执行
- Hook 输出视为用户输入
- 可通过 `/hooks` 查看和管理所有 Hook

---

# 第十四部分：远程与分布式

## 14.1 远程会话

Doge Code 支持远程会话，可在服务器上运行 CLI 本地连接：

| 组件 | 文件 | 功能 |
|------|------|------|
| 远程会话管理器 | `src/remote/RemoteSessionManager.ts` | 管理远程会话生命周期 |
| WebSocket 桥接 | `src/remote/SessionsWebSocket.ts` | WebSocket 实时通信 |
| 权限桥接 | `src/remote/remotePermissionBridge.ts` | 远程权限验证 |
| SDK 消息适配 | `src/remote/sdkMessageAdapter.ts` | 消息格式转换 |

```cmd
/remote-setup         ← 配置远程连接
/remote-env           ← 远程环境管理
/remoteControlServer  ← 远程控制服务器
/ssh                  ← SSH 会话管理
/teleport             ← 会话迁移
```

## 14.2 SSH 会话

| 组件 | 文件 | 功能 |
|------|------|------|
| SSH 会话管理器 | `src/ssh/SSHSessionManager.ts` | 管理 SSH 连接 |
| SSH 创建 | `src/ssh/createSSHSession.ts` | 创建新的 SSH 会话 |

```cmd
/ssh                  ← 管理 SSH 会话
```

## 14.3 协调器模式（多代理协作）

| 组件 | 文件 | 功能 |
|------|------|------|
| 协调器 | `src/coordinator/coordinatorMode.ts` | 多代理协调模式 |
| 工作代理 | `src/coordinator/workerAgent.ts` | 工作代理执行 |

```cmd
/team                 ← 团队管理
/peers                ← 查看对等节点
/swarm               ← Swarm 初始化（多代理协作）
```

## 14.4 直接连接

```cmd
/ide                  ← IDE 集成模式
/desktop              ← 桌面端模式
/bridge               ← 桥接模式
```

---

# 第十五部分：语音与 Vim 模式

## 15.1 语音功能

| 组件 | 文件 | 功能 |
|------|------|------|
| 语音模式 | `src/voice/voiceModeEnabled.ts` | 语音输入/输出 |
| 语音服务 | `src/services/voice.ts` | 语音处理服务 |
| 流式 STT | `src/services/voiceStreamSTT.ts` | 实时语音转文字 |
| 语音关键词 | `src/services/voiceKeyterms.ts` | 语音关键词检测 |

```cmd
/voice                ← 语音功能管理
```

**使用场景**：
- 语音输入代码需求（解放双手）
- 语音转文字生成文档
- 语音命令控制（需配置关键词）

## 15.2 Vim 模式

| 组件 | 文件 | 功能 |
|------|------|------|
| 动作 | `src/vim/motions.ts` | Vim 光标动作 |
| 操作符 | `src/vim/operators.ts` | Vim 操作符（d/c/y 等） |
| 文本对象 | `src/vim/textObjects.ts` | Vim 文本对象（w/s/p 等） |
| 状态转换 | `src/vim/transitions.ts` | 模式切换逻辑 |

```cmd
/vim                  ← Vim 模式管理
```

**使用场景**：
- 终端内高效文本编辑
- 熟悉的 Vim 键绑定
- 可视化模式文本选择

---

# 第十六部分：伙伴系统

伙伴系统（Buddy System）是 Doge Code 的特色功能，提供 AI 伴侣体验。

| 组件 | 文件 | 功能 |
|------|------|------|
| 伙伴核心 | `src/buddy/companion.ts` | 伙伴核心逻辑 |
| 伙伴 React | `src/buddy/companionReact.ts` | 伙伴 React 组件 |
| 伙伴卡片 | `src/buddy/CompanionCard.tsx` | 伙伴信息卡片 |
| 伙伴精灵 | `src/buddy/CompanionSprite.tsx` | 伙伴动画精灵 |
| 伙伴提示 | `src/buddy/prompt.ts` | 伙伴提示词 |
| 精灵动画 | `src/buddy/sprites.ts` | 精灵动画帧 |
| 通知 Hook | `src/buddy/useBuddyNotification.tsx` | 伙伴通知 |

```cmd
/buddy                ← 伙伴系统管理
```

**功能说明**：
- 满级、满属性、稀有伙伴
- 伙伴会在任务完成时通知
- 可自定义伙伴外观和行为

---

# 第十七部分：守护进程与自托管

## 17.1 守护进程（Daemon）

| 组件 | 文件 | 功能 |
|------|------|------|
| 守护进程主程序 | `src/daemon/main.ts` | 后台服务主循环 |
| 工作器注册 | `src/daemon/workerRegistry.ts` | 后台任务工作器管理 |

**使用场景**：
- 后台任务执行
- 定时任务调度
- 长时运行服务

## 17.2 自托管运行器

| 组件 | 文件 | 功能 |
|------|------|------|
| 运行器主程序 | `src/self-hosted-runner/main.ts` | CI/CD 自托管运行器 |

**使用场景**：
- 自托管 CI/CD 流水线
- 自动化构建和部署
- 自定义运行环境

## 17.3 环境运行器

| 组件 | 文件 | 功能 |
|------|------|------|
| 环境运行器 | `src/environment-runner/main.ts` | 隔离环境执行 |

---

# 第十八部分：关键 Hooks 列表

以下是系统中注册的主要 React Hooks（`src/hooks/`），用于终端 UI 交互：

## 18.1 输入与交互

| Hook | 功能 | 使用场景 |
|------|------|----------|
| `useTextInput` | 文本输入处理 | 用户输入消息时 |
| `useInputBuffer` | 输入缓冲 | 多行输入、粘贴处理 |
| `useArrowKeyHistory` | 方向键历史 | 上下键浏览历史消息 |
| `usePasteHandler` | 粘贴处理 | 粘贴多行文本时 |
| `useVimInput` | Vim 输入模式 | Vim 模式下输入 |
| `useSearchInput` | 搜索输入 | 搜索过滤时 |
| `useTypeahead` | 类型ahead 补全 | 自动补全建议 |

## 18.2 会话与状态

| Hook | 功能 | 使用场景 |
|------|------|----------|
| `useSessionBackgrounding` | 会话后台化 | 会话切换到后台时 |
| `useRemoteSession` | 远程会话 | 远程连接时 |
| `useSSHSession` | SSH 会话 | SSH 连接时 |
| `useIDEIntegration` | IDE 集成 | IDE 模式时 |
| `useIdeSelection` | IDE 选择同步 | IDE 中选择代码时 |
| `useIdeConnectionStatus` | IDE 连接状态 | 监控 IDE 连接时 |

## 18.3 工具与权限

| Hook | 功能 | 使用场景 |
|------|------|----------|
| `useCanUseTool` | 工具权限检查 | 工具执行前权限验证 |
| `useCancelRequest` | 取消请求 | 中断 AI 生成时 |
| `useCommandQueue` | 命令队列 | 批量命令排队执行 |
| `useQueueProcessor` | 队列处理 | 处理排队中的命令 |

## 18.4 通知与提醒

| Hook | 功能 | 使用场景 |
|------|------|----------|
| `useNotifyAfterTimeout` | 超时提醒 | 任务超时提醒 |
| `useAwaySummary` | 离开摘要 | 返回时显示离开期间摘要 |
| `useUpdateNotification` | 更新通知 | 有新版本时提醒 |
| `useSkillImprovementSurvey` | 技能改进调查 | 技能使用后收集反馈 |
| `useBuddyNotification` | 伙伴通知 | 伙伴系统通知 |

## 18.5 性能与渲染

| Hook | 功能 | 使用场景 |
|------|------|----------|
| `useVirtualScroll` | 虚拟滚动 | 长列表渲染优化 |
| `useBlink` | 闪烁效果 | UI 闪烁动画 |
| `useElapsedTime` | 耗时显示 | 显示操作耗时 |
| `useMinDisplayTime` | 最小显示时间 | 防止闪烁 |
| `useDeferredHookMessages` | 延迟消息 | 延迟加载消息 |
| `useDynamicConfig` | 动态配置 | 远程配置更新 |

## 18.6 功能特性

| Hook | 功能 | 使用场景 |
|------|------|----------|
| `useProactive` | 主动建议 | AI 主动提供建议 |
| `usePromptSuggestion` | 提示建议 | 输入时 AI 建议 |
| `useHistorySearch` | 历史搜索 | 搜索历史消息 |
| `useDiffData` | 差异数据 | 获取 diff 数据 |
| `useTurnDiffs` | 轮次差异 | 每轮对话的 diff |
| `useFileHistorySnapshotInit` | 文件快照初始化 | 初始化文件历史快照 |
| `useMemoryUsage` | 内存使用 | 监控内存占用 |
| `usePackageUpdateNotice` | 包更新通知 | 依赖包更新提醒 |

---

# 第十九部分：新功能标志系统

功能标志系统（`src/features/`）集中管理所有新特性的开关和配置。

## 19.1 功能标志总览

| 功能 | 标志/配置 | 默认值 | 说明 |
|------|-----------|--------|------|
| 文件系统沙箱禁用 | `sandboxFilesystemDisabled` | `false` | 跳过文件系统隔离，保留网络出口控制 |
| Emoji 自动补全 | `emojiCompletionEnabled` | `true` | 输入 `:heart:` 自动转换为 ❤️ |
| 工作流大小指南 | `workflowSizeGuideline` | `15` | 动态工作流大小限制（1-100） |
| 网络沙箱严格白名单 | `sandboxNetworkStrictAllowlist` | `[]` | 仅允许指定主机的网络访问 |
| 并发子代理上限 | `maxConcurrentSubAgents` | `20` | 最大并发子代理数量（1-100） |
| 子代理嵌套深度 | `maxSubAgentSpawnDepth` | `3` | 子代理嵌套最大深度（0-10） |
| 每会话 WebSearch 限制 | `maxWebSearchesPerSession` | `200` | 每会话最大搜索次数（1-10000） |
| MCP 自动后台化 | `mcpAutoBackgroundMs` | `120000` | MCP 工具超时自动后台化（毫秒） |
| 子代理文本转发 | `forwardSubagentText` | `false` | 转发子代理输出到 stream-json |
| Worktree 基础引用 | `worktreeBaseRef` | `fresh` | worktree 基础引用模式 |
| 父设置行为 | `parentSettingsBehavior` | `inherit` | 管理层级密钥继承行为 |
| OTEL 内容最大长度 | `otelContentMaxLength` | `60000` | OpenTelemetry 内容属性最大长度 |
| 强制终端超链接 | `forceHyperlink` | `true` | 强制终端超链接 |
| 实时经过时间 | `liveElapsedTime` | `true` | 显示实时经过时间 |

## 19.2 环境变量映射

| 环境变量 | 对应设置 | 值格式 |
|----------|----------|--------|
| `CLAUDE_CODE_SANDBOX_FILESYSTEM_DISABLED` | sandboxFilesystemDisabled | `1` = 启用 |
| `EMOJI_COMPLETION_ENABLED` | emojiCompletionEnabled | `0` = 禁用 |
| `CLAUDE_CODE_WORKFLOW_SIZE` | workflowSizeGuideline | 数字 |
| `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` | maxConcurrentSubAgents | 数字 |
| `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` | maxSubAgentSpawnDepth | 数字 |
| `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` | maxWebSearchesPerSession | 数字 |
| `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` | mcpAutoBackgroundMs | 毫秒数 |
| `CLAUDE_CODE_FORWARD_SUBAGENT_TEXT` | forwardSubagentText | `1` = 启用 |
| `CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH` | otelContentMaxLength | 数字 |
| `FORCE_HYPERLINK` | forceHyperlink | `0` = 禁用 |

## 19.3 子代理管理器（SubAgentManager）

```typescript
// 获取全局子代理管理器
const manager = getSubAgentManager()

// 检查是否可以启动新子代理
manager.canSpawn(depth)           // depth: 当前嵌套深度

// 启动子代理（自动排队）
await manager.spawn(async () => { /* 任务逻辑 */ })

// 检查/记录 WebSearch
manager.canSearch()               // 是否还可以搜索
manager.recordSearch()            // 记录一次搜索

// 获取统计信息
manager.getStats()                // { activeSubAgents, maxConcurrent, waitingQueue, searchesUsed, maxSearches }
```

## 19.4 Emoji 自动补全

在提示输入框中输入 `:shortcode:` 自动转换为对应 emoji。

```typescript
// 常用 emoji 映射（部分）
':heart:' → '❤️'    ':smile:' → '😊'    ':fire:' → '🔥'
':star:'  → '⭐'    ':thumbsup:' → '👍' ':ok:' → '👌'
':wave:'  → '👋'    ':clap:' → '👏'     ':thinking:' → '🤔'
```

## 19.5 MCP 自动后台化

MCP 工具调用超过指定时间（默认 2 分钟）自动移到后台执行：

```typescript
const manager = getMCPAutoBackgroundManager()
manager.trackCall(callId, toolName, sessionId)  // 开始跟踪
manager.completeCall(callId)                     // 完成调用
manager.getActiveCallCount()                     // 获取活跃调用数
```

## 19.6 对话终止保护（EndConversation）

当检测到越狱尝试、滥用行为时，AI 可以主动终止会话：

```typescript
const manager = getEndConversationManager()
const result = manager.checkInput(userInput)
// result: { shouldEnd: boolean, shouldWarn: boolean, reason?: string }
// 触发关键词示例："忽略之前的指令"、"jailbreak"、"DAN mode" 等
// 最多警告 2 次后自动终止会话
```

## 19.7 代码审查后台代理

```typescript
const manager = getCodeReviewBackgroundManager()
// 启动后台审查（最多并行 3 个，超出自动排队）
const result = await manager.startReview('owner/repo', 'main', 123)
manager.getQueueLength()    // 获取排队数量
manager.getRunningCount()  // 获取正在运行数量
```

## 19.8 对话 Fork

复制当前会话为独立分支，用于探索不同方案：

```typescript
const manager = getForkManager()
// Fork 配置：可选择是否复制工具历史、文件上下文、会话设置
```

## 19.9 目录注册 Hook

当 `/add-dir` 注册新工作目录后触发：

```typescript
const hook = getDirectoryAddedHook()
hook.on((event) => {
  // event: { path, sessionId, source, timestamp }
  // source: 'add-dir' | 'sdk' | 'auto'
})
```

## 19.10 插件 URL 管理

```typescript
const manager = getPluginUrlManager()
manager.loadFromEnv()                    // 从 CLAUDE_CODE_PLUGIN_URL 环境变量加载
manager.addUrl('https://example.com')    // 添加插件 URL
manager.getUrls()                        // 获取所有插件 URL
```

---

# 第二十部分：引擎核心系统

## 20.1 引擎架构

QueryEngine（`src/engine/index.ts`）是核心引擎装配入口，聚合以下子系统：

```
QueryEngine
├── QueryStateMachine       ← 状态机（对话状态管理）
├── MessageLoop             ← 消息循环（AI 交互循环）
├── MessageNormalizer       ← 消息规范化（格式统一）
├── RequestBuilder          ← 请求构建（API 请求组装）
├── ResponseHandler         ← 响应处理（AI 响应解析）
├── ToolScheduler           ← 工具调度（工具执行调度）
├── TokenBudgetManager      ← Token 预算（用量监控/压缩触发）
├── AutoCompactor           ← 自动压缩（上下文压缩策略）
├── ErrorClassifier         ← 错误分类
├── RetryHandler            ← 重试处理
├── ErrorRecovery           ← 错误恢复
├── SubAgentManager         ← 子代理管理
├── AutoFixLoop             ← 自动修复循环（lint→test→fix）
├── GitContextInjector      ← Git 上下文注入
└── StreamProcessor         ← 流式处理
```

## 20.2 Token 预算管理器

监控 Token 使用量、触发压缩、防止超限：

```typescript
type BudgetStatus = "safe" | "warning" | "danger" | "limit"

// 默认阈值
const config = {
  maxContextTokens: 128000,   // 最大上下文 token
  maxOutputTokens: 40000,     // 最大输出 token
  warningThreshold: 0.75,     // 75% 触发警告
  dangerThreshold: 0.85,      // 85% 触发危险警告
  limitThreshold: 0.95,       // 95% 触发限制
  compactTriggerRatio: 0.8,   // 80% 触发压缩
}

// Token 使用报告
interface TokenUsageReport {
  totalInputTokens: number
  totalOutputTokens: number
  estimatedCostUSD: number    // 估算美元费用
  costPer1MIn: number
  costPer1MOut: number
}
```

## 20.3 自动压缩策略（3 种）

| 策略 | 类名 | 说明 |
|------|------|------|
| 摘要策略 | `SummaryStrategy` | LLM 生成会话摘要，保留最近 N 条消息 |
| 截断策略 | `TruncateStrategy` | 直接截断旧消息，保留最近 N 条 |
| 选择性策略 | `SelectiveStrategy` | 根据重要性选择保留的消息 |

```typescript
interface CompactOptions {
  preserveRecentCount: number       // 保留最近 N 条消息
  preserveSystemMessages: boolean   // 是否保留系统消息
  preserveToolResults?: boolean     // 是否保留工具结果
}
```

## 20.4 Git 上下文注入

编辑文件时自动获取 git blame + 近期 commit 信息，帮助 AI 理解代码意图：

```typescript
interface GitContextConfig {
  enabled: boolean
  includeBlame: boolean             // 是否获取 blame
  includeLog: boolean               // 是否获取 log
  logLines: number                  // log 行数
  getBlame?: (filePath, cwd) => Promise<string>
  getLog?: (filePath, cwd, lines) => Promise<string>
}
```

## 20.5 自动修复循环

编辑工具后自动执行 lint → test → fix 循环（最多 N 轮）：

```typescript
interface AutoFixLoopConfig {
  enabled?: boolean
  maxIterations?: number    // 最大修复轮数
}
```
