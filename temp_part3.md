---

# 第二十一部分：模型系统

## 21.1 支持的 API 提供方

| 提供方 | 标识 | 说明 | 环境变量 |
|--------|------|------|----------|
| 第一方 | `firstParty` | Anthropic 官方 API | 默认 |
| AWS Bedrock | `bedrock` | AWS 托管 | `CLAUDE_CODE_USE_BEDROCK=1` |
| Google Vertex | `vertex` | Google Cloud | `CLAUDE_CODE_USE_VERTEX=1` |
| Foundry | `foundry` | 第三方 Foundry | `CLAUDE_CODE_USE_FOUNDRY=1` |

## 21.2 模型配置（所有 Claude 版本）

| 模型 | 第一方 ID | Bedrock ID | Vertex ID |
|------|-----------|------------|-----------|
| Claude 3.7 Sonnet | `claude-3-7-sonnet-20250219` | `us.anthropic.claude-3-7-sonnet-20250219-v1:0` | `claude-3-7-sonnet@20250219` |
| Claude 3.5 Sonnet v2 | `claude-3-5-sonnet-20241022` | `anthropic.claude-3-5-sonnet-20241022-v2:0` | `claude-3-5-sonnet-v2@20241022` |
| Claude 3.5 Haiku | `claude-3-5-haiku-20241022` | `us.anthropic.claude-3-5-haiku-20241022-v1:0` | `claude-3-5-haiku@20241022` |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | `claude-haiku-4-5@20251001` |
| Claude Sonnet 4 | `claude-sonnet-4-20250514` | `us.anthropic.claude-sonnet-4-20250514-v1:0` | `claude-sonnet-4@20250514` |
| Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | `claude-sonnet-4-5@20250929` |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | — | — |
| Claude Opus 4 | `claude-opus-4-20250514` | `us.anthropic.claude-opus-4-20250514-v1:0` | `claude-opus-4@20250514` |
| Claude Opus 4.1 | `claude-opus-4-1-20250805` | `us.anthropic.claude-opus-4-1-20250805-v1:0` | `claude-opus-4-1@20250805` |
| Claude Opus 4.5 | `claude-opus-4-5-20251101` | `us.anthropic.claude-opus-4-5-20251101-v1:0` | `claude-opus-4-5@20251101` |
| Claude Opus 4.6 | `claude-opus-4-6` | — | — |

## 21.3 模型别名

| 别名 | 说明 |
|------|------|
| `sonnet` | 当前最新 Sonnet 模型 |
| `opus` | 当前最新 Opus 模型 |
| `haiku` | 当前最新 Haiku 模型 |
| `best` | 最强模型（Opus） |
| `sonnet[1m]` | 1M 上下文 Sonnet |
| `opus[1m]` | 1M 上下文 Opus |
| `opusplan` | Opus 计划模式 |

## 21.4 模型切换优先级

```
1. /model 命令覆盖（最高优先级）
2. --model 命令行参数
3. ANTHROPIC_MODEL 环境变量
4. 设置文件中的 model 配置
5. 默认模型（最低优先级）
```

## 21.5 自定义模型配置

通过 `/login` 可配置任意 OpenAI/Anthropic 兼容接口：

```
BaseURL:  http://localhost:11434/v1    ← Ollama 本地部署
API Key:  ollama                        ← 本地模型 Key 可为任意值
Model:    qwen2.5-coder:32b             ← 自定义模型名称
```

---

# 第二十二部分：权限系统详解

## 22.1 权限模式

| 模式 | 说明 | 安全性 |
|------|------|--------|
| `default` | 默认模式，危险操作需确认 | 高 |
| `bypassPermissions` | 绕过所有权限检查 | 低（谨慎使用） |
| `autoRun` | 自动运行模式，部分操作需确认 | 中 |

## 22.2 Bash 命令分类器

| 分类器 | 功能 |
|--------|------|
| `bashClassifier` | 基础 Bash 命令安全分类 |
| `yoloClassifier` | YOLO 模式分类器（更宽松） |
| `dangerousPatterns` | 危险模式检测（rm -rf、curl 管道等） |
| `shellRuleMatching` | Shell 规则匹配 |
| `classifierApprovals` | 分类器审批规则 |

## 22.3 权限规则

```typescript
// 权限规则类型
interface PermissionRule {
  tool: string           // 工具名称
  pattern?: string       // 匹配模式
  action: 'allow' | 'deny' | 'ask'
  reason?: string        // 规则原因
}

// 示例规则
{ tool: 'Bash', pattern: 'git push --force', action: 'deny' }
{ tool: 'Bash', pattern: 'npm install *', action: 'allow' }
{ tool: 'FileWrite', pattern: '.env', action: 'ask' }
```

## 22.4 文件系统权限

| 检查项 | 说明 |
|--------|------|
| `filesystem.ts` | 文件系统操作权限 |
| `pathValidation.ts` | 路径验证（防止目录穿越） |
| `PathGuard` | 路径守卫 |
| `sandbox/` | 沙箱隔离（bubblewrap/socat） |

## 22.5 权限管理命令

```cmd
/permissions          ← 管理工具的权限级别
/sandbox-toggle       ← 切换沙箱模式
/less-permission-prompts  ← 减少权限确认频率
/bypass-permissions   ← 进入绕过权限模式
/auto-mode-reset      ← 重置自动模式
```

---

# 第二十三部分：设置系统

## 23.1 设置文件结构

```
~/.doge/.claude.json          ← 全局设置
<项目>/.doge/settings.json    ← 项目设置（覆盖全局）
```

## 23.2 设置验证

| 组件 | 功能 |
|------|------|
| `settings/schemaOutput.ts` | 设置 JSON Schema 输出 |
| `settings/validation.ts` | 设置值验证 |
| `settings/validateEditTool.ts` | 编辑工具设置验证 |
| `settings/repairSettings.ts` | 设置自动修复 |
| `settings/changeDetector.ts` | 设置变更检测 |
| `settings/settingsCache.ts` | 设置缓存 |
| `settings/permissionValidation.ts` | 权限设置验证 |

## 23.3 受管设置（MDM）

企业环境可通过 MDM（移动设备管理）强制配置：

```json
{
  "mdm": {
    "enforcedSettings": {
      "model": "claude-sonnet-4-6",
      "theme": "dark"
    },
    "readOnly": ["model", "permissions"]
  }
}
```

## 23.4 设置管理命令

```cmd
/config               ← 配置管理
/output-style         ← 输出样式设置
/theme                ← 主题设置
/keybindings          ← 快捷键绑定
/permissions          ← 权限设置
/fast                 ← 快速模式切换
/effort               ← 推理努力程度
```

---

# 第二十四部分：常量与消息系统

## 24.1 核心常量

| 文件 | 说明 |
|------|------|
| `constants/apiLimits.ts` | API 限流常量（每会话最大请求数等） |
| `constants/betas.ts` | Beta 功能标记 |
| `constants/errorIds.ts` | 错误 ID 映射 |
| `constants/figures.ts` | 图标/符号常量 |
| `constants/files.ts` | 文件类型常量 |
| `constants/keys.ts` | 键名常量 |
| `constants/messages.ts` | 系统消息常量 |
| `constants/oauth.ts` | OAuth 常量 |
| `constants/outputStyles.ts` | 输出样式常量 |
| `constants/presets.ts` | 预设配置 |
| `constants/product.ts` | 产品信息常量 |
| `constants/prompts.ts` | 系统提示词常量 |
| `constants/system.ts` | 系统级常量 |
| `constants/systemPromptSections.ts` | 系统提示词分段 |
| `constants/toolLimits.ts` | 工具限制常量 |
| `constants/tools.ts` | 工具相关常量 |
| `constants/xml.ts` | XML 解析常量 |

## 24.2 系统提示词分段

系统提示词按功能分段管理，可按需启用/禁用：

```
systemPromptSections
├── role          ← AI 角色定义
├── capabilities  ← 能力说明
├── tools         ← 工具使用说明
├── memory        ← 记忆系统说明
├── safety        ← 安全规则
└── style         ← 输出风格要求
```

---

# 第二十五部分：服务层

## 25.1 核心服务

| 服务 | 文件 | 功能 |
|------|------|------|
| 分析 | `services/analytics/` | 使用分析和追踪 |
| API | `services/api/` | API 调用封装 |
| AutoDream | `services/autoDream/` | 自动梦境/预测 |
| AwaySummary | `services/awaySummary.ts` | 离开期间摘要 |
| BridgeSessions | `services/bridgeSessions/` | 桥接会话 |
| ClaudeAILimits | `services/claudeAiLimits.ts` | Claude AI 限流 |
| Compact | `services/compact/` | 压缩服务 |
| ContextCollapse | `services/contextCollapse/` | 上下文折叠 |
| DiagnosticTracking | `services/diagnosticTracking.ts` | 诊断追踪 |
| ExtractMemories | `services/extractMemories/` | 记忆提取 |
| InternalLogging | `services/internalLogging.ts` | 内部日志 |
| LSP | `services/lsp/` | 语言服务器协议 |
| MagicDocs | `services/MagicDocs/` | 魔法文档 |
| MCP Discovery | `services/mcpDiscovery.ts` | MCP 服务器发现 |
| MCP Server Approval | `services/mcpServerApproval.tsx` | MCP 服务器审批 |
| MockRateLimits | `services/mockRateLimits.ts` | 模拟限流（测试用） |
| Notebook | `services/notebook/` | Notebook 支持 |
| Notifier | `services/notifier.ts` | 通知服务 |
| OAuth | `services/oauth/` | OAuth 认证 |
| PolicyLimits | `services/policyLimits/` | 策略限制 |
| PreventSleep | `services/preventSleep.ts` | 防止休眠 |
| PromptSuggestion | `services/PromptSuggestion/` | 提示建议 |
| RateLimitMessages | `services/rateLimitMessages.ts` | 限流消息 |
| SessionMemory | `services/SessionMemory/` | 会话记忆 |
| SessionTranscript | `services/sessionTranscript/` | 会话记录 |
| SettingsSync | `services/settingsSync/` | 设置同步 |
| SkillSearch | `services/skillSearch/` | 技能搜索 |
| TeamMemorySync | `services/teamMemorySync/` | 团队记忆同步 |
| Tips | `services/tips/` | 使用提示 |
| TokenEstimation | `services/tokenEstimation.ts` | Token 估算 |
| ToolUseSummary | `services/toolUseSummary/` | 工具使用摘要 |
| VCR | `services/vcr.ts` | 录制/回放（测试用） |
| Voice | `services/voice.ts` | 语音服务 |

---

# 第二十六部分：成本追踪系统

## 26.1 成本追踪组件

| 组件 | 文件 | 功能 |
|------|------|------|
| 成本追踪器 | `src/cost-tracker.ts` | 实时 token 消耗追踪 |
| 成本 Hook | `src/costHook.ts` | 成本变更钩子 |
| 成本数据库 | `src/utils/cost-database.ts` | 成本持久化存储 |
| 计费模块 | `src/utils/billing.ts` | 计费计算 |
| 模型定价 | `src/utils/model/modelCost.ts` | 模型定价数据 |

## 26.2 成本查看命令

```cmd
/cost                  ← 查看当前会话费用
/cost-history          ← 查看历史费用趋势
/usage                 ← 使用量统计
/stats                 ← 综合统计数据
```

## 26.3 状态栏成本显示

状态栏实时显示：
- 输入 token 数
- 输出 token 数
- 会话总费用（USD）
- 上下文使用率

---

# 第二十七部分：服务器与直接连接

## 27.1 服务器模式

| 组件 | 文件 | 功能 |
|------|------|------|
| 服务器主程序 | `src/server/server.ts` | HTTP/WebSocket 服务器 |
| 后端 | `src/server/backends/` | 后端适配器 |
| 无头连接 | `src/server/connectHeadless.ts` | 无头模式连接 |
| 直接连接管理 | `src/server/directConnectManager.ts` | 直接连接管理 |
| 锁文件 | `src/server/lockfile.ts` | 服务器锁文件 |
| URL 解析 | `src/server/parseConnectUrl.ts` | 连接 URL 解析 |
| 会话管理 | `src/server/sessionManager.ts` | 服务器端会话管理 |
| Web 终端 | `src/server/web-term.ts` | Web 终端界面 |

## 27.2 直接连接

```cmd
/ide                  ← IDE 集成模式（JetBrains/VS Code）
/desktop              ← 桌面端模式（Electron）
/bridge               ← 桥接模式（Web 终端）
```

## 27.3 IDE 集成

支持 JetBrains 和 VS Code：
- 代码选择同步到 CLI
- 编辑器内直接触发 AI 操作
- 自动上下文感知

---

# 第二十八部分：组件系统

## 28.1 核心 UI 组件

| 组件 | 文件 | 功能 |
|------|------|------|
| 应用主组件 | `components/App.tsx` | 应用根组件 |
| 状态行 | `components/StatusLine.tsx` | 底部状态行 |
| 消息列表 | `components/Messages.tsx` | 消息列表渲染 |
| 消息行 | `components/MessageRow.tsx` | 单条消息渲染 |
| 文本输入 | `components/TextInput.tsx` | 用户文本输入 |
| Vim 文本输入 | `components/VimTextInput.tsx` | Vim 模式输入 |
| 提示输入 | `components/PromptInput/` | 提示输入框 |
| 模型选择器 | `components/ModelPicker.tsx` | 模型切换下拉 |
| 主题选择器 | `components/ThemePicker.tsx` | 主题切换下拉 |
| 输出样式选择 | `components/OutputStylePicker.tsx` | 输出格式选择 |
| 加载动画 | `components/Spinner/` | 加载状态动画 |
| 图片显示 | `components/ImageDisplay.tsx` | 多模态图片显示 |
| 结构化差异 | `components/StructuredDiff/` | 结构化 diff 视图 |
| 并排差异 | `components/SideBySideDiff.tsx` | 左右对照 diff |
| 文件编辑差异 | `components/FileEditToolDiff.tsx` | 文件编辑预览 |

## 28.2 对话框组件

| 组件 | 功能 |
|------|------|
| `BridgeDialog` | 桥接连接对话框 |
| `BypassPermissionsModeDialog` | 绕过权限模式对话框 |
| `CostThresholdDialog` | 成本阈值对话框 |
| `ThemePicker` | 主题选择对话框 |
| `ModelPicker` | 模型选择对话框 |
| `ExportDialog` | 导出对话框 |
| `GlobalSearchDialog` | 全局搜索对话框 |
| `HistorySearchDialog` | 历史搜索对话框 |
| `ResumeTask` | 恢复任务对话框 |
| `TrustDialog` | 信任确认对话框 |

## 28.3 状态指示器

| 组件 | 功能 |
|------|------|
| `MemoryUsageIndicator` | 内存使用率显示 |
| `IdeStatusIndicator` | IDE 连接状态 |
| `PrBadge` | PR 状态标记 |
| `StatusNotices` | 状态通知 |
| `TokenWarning` | Token 警告 |

---

# 第二十九部分：MCP 集成

## 29.1 MCP 组件

| 组件 | 文件 | 功能 |
|------|------|------|
| MCP 工具 | `src/tools/MCPTool/` | MCP 工具执行 |
| MCP 认证 | `src/tools/McpAuthTool/` | MCP 认证管理 |
| MCP 发现 | `src/services/mcpDiscovery.ts` | 自动发现 MCP 服务器 |
| MCP 审批 | `src/services/mcpServerApproval.tsx` | MCP 服务器审批 |
| MCP 指令增量 | `src/utils/mcp/mcpInstructionsDelta.ts` | MCP 指令更新 |
| MCP 输出存储 | `src/utils/mcp/mcpOutputStorage.ts` | MCP 输出持久化 |
| MCP 验证 | `src/utils/mcp/mcpValidation.ts` | MCP 配置验证 |
| MCP WebSocket | `src/utils/mcp/mcpWebSocketTransport.ts` | MCP WebSocket 传输 |

## 29.2 MCP 管理命令

```cmd
/mcp                  ← MCP 服务器管理
/mcp-discovery        ← 自动发现 MCP 服务器
/mcp-tool-search      ← 搜索 MCP 工具
```

## 29.3 MCP 环境变量

| 变量 | 说明 |
|------|------|
| `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` | MCP 超时自动后台化（默认 120000ms） |
| `CLAUDE_CODE_PLUGIN_URL` | 插件 URL（逗号分隔） |

---

# 第三十部分：数据迁移

## 30.1 自动迁移

系统内置 10 个数据迁移脚本，自动升级时执行：

| 迁移 | 说明 |
|------|------|
| `migrateAutoUpdatesToSettings.ts` | 自动更新设置迁移 |
| `migrateBypassPermissionsAcceptedToSettings.ts` | 绕过权限设置迁移 |
| `migrateEnableAllProjectMcpServersToSettings.ts` | MCP 服务器设置迁移 |
| `migrateFennecToOpus.ts` | Fennec → Opus 模型迁移 |
| `migrateLegacyOpusToCurrent.ts` | Legacy Opus → 当前 Opus 迁移 |
| `migrateOpusToOpus1m.ts` | Opus → Opus 1M 迁移 |
| `migrateReplBridgeEnabledToRemoteControlAtStartup.ts` | REPL 桥接迁移 |
| `migrateSonnet1mToSonnet45.ts` | Sonnet 1M → Sonnet 4.5 迁移 |
| `migrateSonnet45ToSonnet46.ts` | Sonnet 4.5 → Sonnet 4.6 迁移 |
| `resetAutoModeOptInForDefaultOffer.ts` | 自动模式重置 |
| `resetProToOpusDefault.ts` | Pro → Opus 默认重置 |
