# doge-code vs 官方 Claude Code：完整差异报告

> 生成时间：2026-10-20
> 对比基线：**官方 `@anthropic-ai/claude-code@2.1.303`**（npm 最新稳定版，含 win32-x64 原生二进制 `claude.exe` 290 MB）
> 对比对象：本仓库 `D:\doge-code\src\`（源码还原树 + fork 魔改，版本号 `999.0.0-DOGE`）
> 方法：官方包实机运行 + 原生二进制字符串静态分析 + 本地源码实机导出（工具/命令/参数的运行时枚举）
> 原始数据：`.tmp/off/`（`help.txt`、`strings.txt`、`tools_*.json`、`cmds_doge.json`、`analyze_out.txt`、`cmd_match.txt`）

---

## 0. 结论摘要

| 维度 | 官方 2.1.303 | 本地 fork | 差异性质 |
|---|---|---|---|
| 发行形态 | npm 包装 + 各平台原生二进制（bun compile，单文件 290 MB） | 源码树 `src/`（3333 个 ts/tsx）→ `bun build --compile` 产 `doge.exe` | 同源不同形态 |
| 版本号 | `2.1.303` | `999.0.0-DOGE`（故意置高，屏蔽更新检查） | 刻意 |
| CLI 顶层参数 | 70 | 56 | 官方多 17，本地多 3（含 1 个已弃用） |
| CLI 子命令 | 18 | 13 | 官方多 9，本地多 4 |
| 内置斜杠命令 | 不可静态枚举（编译进二进制） | 297 条注册 / 294 去重（3 组交互/非交互配对，见 §4.1） | 本地远超官方 |
| 内置工具 | 核心集 + 内部集（部分经 chunk 懒加载） | 全量注册 84，默认启用 78 | 本地多出约 50 个扩展工具 |
| 内置技能 | 官方 27 个左右（含 loop/commit 等） | 注册 28 个（`initBundledSkills()` 后） | 集合不完全重合 |
| 上手门槛 | 必须 Claude 账号 OAuth / API Key | 零登录可启动（无配置时指向 `http://0.0.0.0:1` 假端点） | 本地显著放宽 |
| 中文 | 全英文 | 系统提示词、帮助、UI 大量汉化 | 本地本地化 |
| 模型覆盖 | opus 4.8 / sonnet 5 / fable 5 等新模型已内置 | 最高到 opus 4.6 / sonnet 4.6 / haiku 4.5 | 本地滞后 |
| 云能力 | cloud session / teleport / attach / gateway / remote-control | 无（等价的本地桥 + 移动端 + 飞书） | 路线不同 |

一句话：**这不是"官方版本的新旧"，而是"同源内核 + 两套完全不同的外围"**。官方在做云会话与多端编排；本地 fork 在做离线可用、中文、多模型、移动端/局域网协作。

---

## 1. 对比方法与可信度分级

本报告所有结论分为三级，每条都标注来源：

- **【实测】**：实机运行官方二进制或本地源码导出，可复现（命令见附录 A）。
- **【静态】**：官方 `claude.exe` 的字符串分析（`strings -n 6` → 601,455 行）。能证明"存在/不存在"，但不能证明"行为等价"。
- **【推断】**：基于源码与静态证据的合理推论，已在条目中注明理由与不确定性。

**为什么"官方斜杠命令全表"无法给出**：官方交互式界面在本机 pty（git-bash + pywinpty）下无法被驱动（官方在非 TTY 环境会走 headless 分支读取 stdin），因此无法枚举其 `/` 补全列表。表中凡涉及官方斜杠命令的，只用 **【静态】** 证据（`/<name>` 形式是否出现在二进制中）。

---

## 2. CLI 层差异（最高可信度，可直接复现）

### 2.1 顶层参数【实测】

官方 70 个，本地 56 个。**官方有、本地无的 17 个**：

| 参数 | 作用 | 本地缺失的性质 |
|---|---|---|
| `--cloud [desc\|session_id\|url]` | 创建/接入 claude.ai 云会话 | 云端能力，本地无对应 |
| `--environment <id>` | 在自托管环境（`ccpool_...`）跑云会话 | 云端能力 |
| `--teleport [session]` | 恢复 teleport 会话 | 云端能力（本地命令壳存在但不可达） |
| `--remote-control [name]` | 启动带远程控制的交互会话 | 云端能力（本地有 `remote-control` 子命令壳） |
| `--remote-control-session-name-prefix` | 远程控制会话名前缀 | 同上 |
| `--restricted` | 受限模式：移除执行类工具、忽略用户/项目设置、限制文件工具边界 | **安全能力缺失（非云端）** |
| `--safe-mode` | 安全模式：禁用 CLAUDE.md/技能/插件/钩子/MCP 等全部自定义 | 本地仅隐藏注册（`.hideHelp()`），语义弱于官方，见 §2.3 |
| `--ax-screen-reader` | 无障碍：扁平文本输出，无边框/动画 | ~~本地无~~ **已补（2026-11-01）**：映射到既有的 `CLAUDE_CODE_ACCESSIBILITY=1`（Ink 层据此保留原生光标），测试 `tests/unit/ax-screen-reader-flag.test.ts` |
| `--autocompact <auto\|tokens>` | 自动压缩窗口（100k–1M） | 本地无 CLI 参数（内部有 autocompact 配置，但无此入口） |
| `--exclude-dynamic-system-prompt-sections` | 把 cwd/env/git 等动态段落移到首条用户消息，提升跨用户 prompt cache 命中 | 本地无 |
| `--system-prompt-snapshot <on\|off>` | 系统提示词按会话录制并逐字复用 | 本地无 |
| `--prompt-suggestions [value]` | 每轮后预测下一条用户提示 | 本地无 CLI 入口（SDK 层有 `promptSuggestions` 字段） |
| `--forward-subagent-text` | 把子代理文本/思考作为消息转发（stream-json） | ~~本地无~~ **已补（2026-11-01）**：环境变量与 settings 字段本就有，但 `forwardSubagentText` **只赋值无人消费**、`AgentTool` 只放行 tool 块 —— 属「配置存在但功能未生效」。现新增 `src/utils/subagentTextForwarding.ts` 判据并在转发点接入，测试 `tests/unit/forward-subagent-text.test.ts` |
| `--permission-prompt-tool <tool>` | 指定 MCP 权限提示工具 | 本地仅 `.hideHelp()` 隐藏，参数仍存在（源码 `main.tsx:935`） |
| `--permission-prompts <host\|none>` | print 模式权限提示由谁回答 | 本地无 |
| `--plugin-url <url>` | 从 URL 拉取插件 zip | 本地无 |
| `--desktop` | 打开 Claude Desktop 应用 | **同名不同义**：官方是"跳转桌面端"，本地是"以桌面模式启动内置 Electron 应用" |

**本地有、官方无的 3 个**：

| 参数 | 说明 |
|---|---|
| `--proactive` | 主动自主模式（配合 `src/proactive/`） |
| `--messaging-socket-path <path>` | UDS 消息服务器 socket 路径（本地桥/多端消息用） |
| `--mcp-debug` | 已弃用（帮助文本即写"❌ 错误: [已弃用。请改用 --debug]"），官方已移除 |

### 2.2 子命令差异【实测】

官方 18 个，本地 13 个。

**官方有、本地无（9 个）**——全部是"后台会话 / 云 / 企业"体系：

| 子命令 | 作用 |
|---|---|
| `--bg` 配套的 `attach <id\|name>` | 在当前终端打开后台会话 |
| `logs <id\|name>` | 打印后台会话终端输出 |
| `stop\|kill <id>` / `rm <id>` / `respawn [--all]` | 停止 / 删除 / 重启后台会话 |
| `agents`（官方版为**后台 agent 管理**，非列配置） | `--json`、`--all`、`--cwd`、派发会话参数 |
| `gateway` | 企业认证/遥测网关 |
| `import [source]` | 从其他 AI 编码代理导入配置 |
| `purge [path]` | 删除项目的全部 Claude Code 状态 |
| `ultrareview [target]` | 云托管多 agent 代码审查（本地有 `/ultrareview` 斜杠命令与工具，但无 CLI 子命令） |

**本地有、官方无（4 个）**：

| 子命令 | 说明 |
|---|---|
| `assistant [sessionId]` | 把 REPL 作为客户端附加到本地桥会话（官方帮助里也有此描述，但 2.1.303 已不在 Commands 列表，改为 `attach`） |
| `server [--port/--host/--auth-token/--unix/--workspace/...]` | 启动本地会话服务器（多端共享核心） |
| `ssh <host> [dir]` | 通过 SSH 远程运行（官方 2.1.303 已移除该子命令） |
| `open <cc-url>` | 连接 `cc://` 服务器 |

> 注：官方 `ultrareview` 子命令 vs 本地 `/ultrareview` 斜杠命令 + `ultrareview` 工具——**同名不同层**。

### 2.3 帮助可见性与真实可用性的偏差【实测+推断】

本地有若干参数/命令是「注册了但隐藏」或「壳函数返回 null」：

- `--safe-mode`、`--permission-prompt-tool`、`--system-prompt-file`、`--append-system-prompt-file`、`--resume-session-at`、`--rewind-files`、`--prefill`、`--thinking`、`--max-turns`、`--max-thinking-tokens`、`--enable-auth-status` 等均标 `.hideHelp()`，故不出现在 `--help` 中，但**参数解析有效**。
- `remote-control` / `remote-control-server` 子命令存在，但内部实现依赖 Anthropic Bridge API + OAuth（见 `TASK.md` #23），在大陆环境实际不可用。

---

## 3. 工具层差异

### 3.1 本地工具全集【实测】

- 全量注册：**84 个**（`getAllBaseTools({unfiltered:true})`）
- 默认启用：**78 个**（`getTools()`，非 ant、非交互会话上下文）
- 门控关闭 6 个：`CronCreate`、`CronDelete`、`CronList`（`CLAUDE_CODE_FEATURE_AGENT_TRIGGERS=1` 才开）、`LSP`（`ENABLE_LSP_TOOL`）、`RemoteTrigger`（`..._AGENT_TRIGGERS_REMOTE`）、`SendUserMessage`（Kairos）

### 3.2 与官方同构的核心工具【静态】

以下在官方二进制中均有同名实现（出现次数为字符串命中数，非语义等价证明）：

`Bash` `Read/FileReadTool` `Write/FileWriteTool` `Edit/FileEditTool` `Glob` `Grep` `NotebookEdit` `WebFetch` `WebSearch` `Agent` `Skill` `ToolSearch` `SendMessage` `ListMcpResourcesTool` `ReadMcpResourceTool` `Monitor` `CronCreate/Delete/List` `RemoteTrigger` `SendUserFile` `PowerShell`（官方 12 次命中，实际默认关闭） `TaskList`。

### 3.3 本地扩展工具（官方二进制中无同名实现）【静态】

合计 **50 个**，全部为本地 fork 新增：

```
AgentIntegration  action_sampler  advisor  agent_development  agent_proxy  backup
branch  cache  compare  context-collapse  context_inspect  database  discover_skills
effort  event-stream  file-watcher  flow  git  graphql  http  less-permission-prompts
list_peers  llm_router  logger  mcp-tool-search  metrics  plan-mode  project_scaffolder
push_notification  python_interpreter  queue  sandbox  schedule  search_replace_edit
shell  snip  state_machine  subscribe_pr  terminal-panel  terminal_capture  theme
tool_collection  ultrareview  vim-visual-mode  web_browser  websocket  workflow  MultiFileEdit  MultiSearch
```

其中两类需要单独说明：

1. **概念上官方有、实现形态不同**：`plan-mode`（官方对应 `EnterPlanMode`/`ExitPlanMode` + `--permission-mode plan`，本地额外提供独立工具）；`monitor`/`terminal_capture`（官方有 `MonitorTool`）；`send_user_file`/`push_notification`（官方 Kairos 门控同类）；`discover_skills`（官方通过 `/skill-name` 与 SkillTool 发现，无独立工具）。
2. **官方内部也有、但本地语义不同**：`advisor`（官方二进制命中 539 次，属内部能力；本地是独立工具）。

### 3.4 官方工具中本地缺失的（按证据可确认）

- **官方后台会话族**：`attach/logs/stop/rm/respawn`（CLI 层已列，工具层无对应）。
- **官方内部工具**：`Tungsten`（本地保留注册但仅 ant 可用）、`ListConnectors`/`SuggestConnectors`/`SearchMcpRegistry`（官方二进制可见，本地无）、`DesignSync`、`ProposeSkills`/`ProposeGoal`/`PublishPlugin`、`SelfHostedRunner` 工具集（官方引用 chunk 懒加载）。
- **官方新增语义**：`TaskCreate` 单次一条任务、有 `owner`/`blocks`/`blockedBy` 团队依赖语义（官方字符串中明确包含"New tasks are created with status 'pending' and no owner - use TaskUpdate with the `owner` parameter"）。本地的 TodoV2 任务系统**没有 owner/依赖图**（见 §5.2）。

---

## 4. 斜杠命令差异

### 4.1 本地命令统计【实测】

- `COMMANDS()` 返回 **297 条**，去重后 **294 条**（2026-10-20 修复后；修复前为 298 / 294）。
- 剩余 3 组同名注册（**合规**：交互 / 非交互各一份，`isEnabled` 互斥，同一会话模式下只会命中一条）：

| 命令 | 交互实现 | 非交互实现 |
|---|---|---|
| `context` | `local-jsx`（彩色网格） | `local`（Markdown 表格） |
| `insights` | `local-jsx`（展示 UI） | `prompt`（报告正文） |
| `extra-usage` | `local-jsx`（打开浏览器） | `local`（打印链接） |

> `getCommands()` 末尾按名去重（`dropDisabledDuplicates`）：先用 `isEnabled()` 剔除当前会话模式下被禁用的那条，
> 再丢弃同名项。因此**最终下发给 UI / SDK 的命令列表在同一会话模式下不含任何重名**。
> 回归：`tests/unit/command-filter-no-duplicates.test.ts`。

> **已修复的缺陷**：`reset-limits` 曾由 `resetLimits` / `resetLimitsNonInteractive` 两个导出指向同一对象并双双注册，现已合并为单条。  
> 原 4 组同名的处理方式：`reset-limits` 去掉重复导出；其余三组补上互斥 `isEnabled`（此前 `insights` 的 JSX 版无门控、`context`/`extra-usage` 依赖 `isHidden` 而非 `isEnabled`），并移除失效的 `isHidden`。  
> 回归测试：`tests/unit/command-name-uniqueness.test.ts`（5 用例，含变异验证）+ `src/__tests__/commands/reset-limits.test.ts`。

### 4.2 命令来源与可用性过滤【实测】

本地命令列表 = 内置技能 + 内置插件技能 + 磁盘技能目录 + 工作流脚本 + 插件命令 + 插件技能 + `COMMANDS()`。  
过滤链：`meetsAvailabilityRequirement()`（按 `claude-ai` / `console` 认证要求）→ `isCommandEnabled()`。

另有 21 项 `INTERNAL_ONLY_COMMANDS`（`src/commands.ts:440`）：`backfill-sessions`、`break-cache`、`good-claude`、`issue`、`init-verifiers`、`force-snip`、`mock-limits`、`bridge-kick`、`ultraplan`、`subscribe-pr`、`reset-limits`、`onboarding`、`teleport`、`ant-trace`、`perf-issue`、`env`、`oauth-refresh`、`debug-tool-call`、`agents-platform`、`autofix-pr` 等。

### 4.3 官方斜杠命令对照【静态】

本 fork 的 294 个命令中，**151 个**的命令名以 `/<name>` 形式出现在官方二进制里（说明官方也存在同名或近似命令）：

```
add-dir advisor agents auto autocomplete autofix-pr background blame branch bridge browser btw
bundle cache changelog chrome clear cmd code-review color commit commit-push-pr compact compare
complete config context copy cost cron database debug deploy deps desktop diff docker docs doctor
effort env errors event-stream exit explain export extra-usage fast feedback file-history files
focus getting-started goal graph graphql grep health help hooks http ide image imports init
insights install-github-app install-slack-app issue k8s keybindings login logout logs loop mcp
memory metrics mobile model monitor nginx notes notify onboarding outdated output-style pair
passes pdf performance permissions pipeline plan plugin powerup queue rate-limit-options release
release-notes reload-plugins remote-env rename replay resume review rewind rules sandbox schedule
security security-review session sessions share shell skills snapshot snippet ssh stash stats
status statusline summary symbol tag task tasks tc team team-onboarding teleport templates
terminal terminal-setup theme todo tokens translate tree tui ultrareview upgrade usage version
vim watch websocket wiki workspace
```

**143 个**未以 `/<name>` 形式出现（注意：这不等于"官方没有"，只等于"未用该字面形式暴露"）。其中可确认为本地独有扩展（分组）：

| 分组 | 命令 |
|---|---|
| 中文/汉化 | `batch-han` `translate` `skills-i18n` `changelog-gen` |
| 模型/供应商 | `add-model` `remove-model` `model`(官方同名，参数不同) `updateapikey` `api-test` `api-debug` `api-doc` |
| 本地多端/桥 | `mobile-connect` `bridge-kick` `collab` `team-collab` `pair` `session-search` `task-claim` |
| 循环自动化 | `loop-v2` `loop-start-v2` `loop-status-v2` `loop-orchestrate` `loop-dashboard` `loop-autogpt` `loop-crew` `loop-langgraph` `loop-openhands` `loop-swe-agent` |
| 工程工具 | `dead-code` `dependency-analyzer` `duplicate` `deps-viz` `repo-map` `code-search` `doc-search` `perf-issue` `performance-profiler` `refactor` `swe-fix` `focused-fix` `diff-mode` `diff-review` `block-mode` |
| 数据/运维 | `database` `db-migrate` `redis` `k8s`(同名) `sandbox-docker` `ports` `htaccess` `robots` `sitemap` `seo-audit` `security-audit` `code-health` `health-score` |
| 记忆/知识 | `memory-bank` `memory-monitor` `memory-search` `recall` `reflect` `brain-sync` |
| 其他 | `game` `stock` `excel` `diagram` `notebook` `think-back` `thinkback-play` `buddy` `fuck` `good-claude` `asktime` `doge-config` `toolgroup` `scaffold` `spec-workflow` `test-gen` `test-run` |

> 说明：`translate`、`skills-i18n` 也出现在 §4.3 的"官方命中"列表中，说明官方已有同名命令（i18n 相关），本地在其上做了汉化实现——**同名不同实现**。

---

## 5. 核心机制差异（对使用者影响最大）

### 5.1 认证与网络入口【实测】

本地 `src/bootstrap-entry.ts:50-65`：

- 有激活配置时：`ANTHROPIC_BASE_URL = activeConfig.baseURL`、`DOGE_API_KEY = activeConfig.apiKey`、`ANTHROPIC_MODEL = activeConfig.model`、`CLAUDE_CODE_COMPATIBLE_API_PROVIDER`。
- **无配置时**：`ANTHROPIC_BASE_URL = 'http://0.0.0.0:1'`、`DOGE_API_KEY = 'DOGE_FAKE_KEY'`、`ANTHROPIC_MODEL = 'claude-dummy'`，provider 默认 `openai`。

即：**不登录、不配 Key 也能启动到交互界面**（请求会失败），而官方必须 OAuth 或 API Key。这是"零依赖可跑"的关键改动，也是"看起来能用、实际无模型"的常见困扰来源。

相关支撑：
- 供应商预设 `src/constants/presets.ts` 共 **113 条**预设，含 DeepSeek / Kimi / 智谱 / ModelScope / 硅基流动 / 火山 Ark / Ollama / LMStudio 等。
- `--bare` 的帮助文本把官方的 `ANTHROPIC_API_KEY` 换成了 `DOGE_API_KEY`。

### 5.2 任务系统【实测+静态】

| 项 | 官方 2.1.303 | 本地 fork |
|---|---|---|
| 工具 | `TaskCreate` / `TaskGet` / `TaskList` / `TaskUpdate` / `TaskStop` / `TaskOutput` | 同名前 4 个在 TodoV2 下启用，`TaskStop`/`TaskOutput` 常开 |
| 存储 | 官方以 task 对象 + `owner`/`blocks`/`blockedBy`/`metadata` | 本地 `~/.doge/tasks/<sessionId>/*.json`，含 `activeForm` |
| 团队语义 | 有 owner、依赖图、teammate 认领流程 | **无 owner、无 blocks/blockedBy**（仅 status/subject/description） |
| 提示词 | 官方提醒语含 "use TaskUpdate with the `owner` parameter" | 本地提醒语只提 status |
| 门控 | 非交互会话强制开启 | `!getIsNonInteractiveSession()`（`src/utils/tasks.ts:137`），非交互默认关闭 |

另外本地保留 `TodoWrite`（官方 2.1.x 已并入 Task 体系，本地仍双轨）。

### 5.3 系统提示词【实测】

本地 `src/constants/prompts.ts:179` 起为**中文**：

> "你是一个交互式代理，帮助用户完成软件工程任务。使用下面的指令和你可用的工具来协助用户。"

官方为英文原文。这是汉化的核心落点，但也意味着**与官方 prompt 缓存、A/B、行为调优全部脱钩**，模型行为会有可测差异。

### 5.4 模型与定价【实测+静态】

| 项 | 官方 | 本地 |
|---|---|---|
| 内置模型 ID | `claude-opus-4-8` / `claude-opus-5` / `claude-sonnet-5` / `claude-fable-5` / `claude-haiku-5-5` 等 | 最高 `claude-opus-4-6` / `claude-sonnet-4-6` / `claude-haiku-4-5` |
| 别名 | 帮助文本示例为 `'fable', 'opus', 'sonnet'` | `'sonnet' / 'opus'`（无 fable） |
| 定价表 | 官方含新版模型 | 本地 `src/utils/modelCost.ts` 覆盖到 4.6/4.5 代 + 非 Anthropic 厂商定价（本地扩展） |

**这是最实质的功能落后点**：即使通过自定义 BaseURL 接入新模型，本地缺少对应的能力判定（1M 上下文、thinking、fast mode）与成本核算分支。

### 5.5 云端 vs 本地差分能力

| 能力 | 官方 | 本地替代 |
|---|---|---|
| 云会话 | `--cloud` / `--environment` / 自托管 runner | 无 |
| 远程控制 | `--remote-control` / claude.ai 手机 App | `server` + 本地桥（5678）+ Android 客户端 + 隧道 |
| 后台会话 | `--bg` + `attach/logs/stop/rm/respawn` | 后台任务（`LocalWorkflowTask` 等）+ TaskStop/TaskOutput |
| 团队协作 | `team`/`tc` 内部 + 官方 owner 依赖 | `team`/`tc`/`collab`/`team-collab`/`pair` 自研 |
| 企业能力 | `gateway`、托管设置 | 无（但有 `security`/`security-audit` 等自研命令） |
| 移动端 | Claude 官方 App | `doge-mobile.apk` + `android/` 完整客户端 |

---

## 6. 代码结构与工程差异【实测】

| 项 | 官方二进制 | 本地源码树 |
|---|---|---|
| 语言 | TS 编译为单文件 bun bytecode | TS/TSX 源码 3333 个（`src/` 下 111 个目录） |
| 模块组织 | bun `chunk-*.js`（`file:///B:/~BUN/root/chunk-xxxx.js`） | 按功能目录（`tools/` 102 目录、`commands/` 315 目录、`skills/bundled` 52 文件） |
| 源码映射 | **不含 `sourcesContent`**（仅 2 处字符串误命中），无法从官方二进制还原源码 | — |
| 命令/工具装配 | 编译期常量与门控 | 运行时 `loadConditionalCommand` + `process.env.CLAUDE_CODE_FEATURE_*` |
| 测试 | 不随包发布 | `tests/` 68 + `src/__tests__/` 381（共 449 测试文件） |
| 额外产物 | 无 | `android/`（Kotlin 客户端）、`desktop/`（Electron）、`vscode-extension/`、`doge.exe` |
| fork 专有模块 | 无 | `src/workbuddy-*.mjs`（21 个）、`src/bridge/feishuBridge.ts`、`src/proactive/`、`src/moreright/`、`src/upstreamproxy/`、`src/self-hosted-runner/` |

### 6.1 门控体系差异

本地大量能力由环境变量门控（官方多为 GrowthBook 远程开关或编译期常量）。设置即开，但也导致"代码存在 ≠ 默认可用"：

```
CLAUDE_CODE_FEATURE_AGENT_TRIGGERS         -> Cron 三件套
CLAUDE_CODE_FEATURE_AGENT_TRIGGERS_REMOTE  -> RemoteTrigger
CLAUDE_CODE_FEATURE_KAIROS                 -> SendUserFile / PushNotification / Sleep
CLAUDE_CODE_FEATURE_KAIROS_GITHUB_WEBHOOKS -> SubscribePR
CLAUDE_CODE_FEATURE_PROACTIVE              -> Sleep（主动模式）
ENABLE_LSP_TOOL                            -> LSP
CLAUDE_CODE_FEATURE_WORKFLOW_SCRIPTS       -> 工作流斜杠命令
USER_TYPE=ant                              -> REPL / Config / Tungsten
```

`--proactive` 参数与 `CLAUDE_CODE_FEATURE_PROACTIVE` 是本地独有的生命周期入口。

---

## 7. 已知缺口 / 风险清单

按"对用户的实际影响"排序：

1. **模型滞后**（§5.4）：缺 opus 4.7/4.8、sonnet 5、fable 5、haiku 5.5 的能力判定与定价分支。接新模型可能出现 1M 上下文/thinking/成本计算错误。**（未修复：需官方模型清单与定价数据，不能靠推测补齐）**
2. ~~**重名命令**（§4.1）~~ **已于 2026-10-20 修复**：`reset-limits` 合并为单条；`context`/`insights`/`extra-usage` 改为互斥 `isEnabled` 配对实现。回归测试 `tests/unit/command-name-uniqueness.test.ts`。
3. ~~**任务系统缺团队语义**~~ **已补**：`TaskCreate` 支持 `owner`/`blocks`/`blockedBy`（走 `blockTask` 同步反向边），`TaskGet` 输出 `Owner`。测试 `tests/unit/task-team-semantics.test.ts`（5 用例）。
4. ~~**安全参数缺失**~~ **已补**：`--restricted` 落地（执行类工具 + WebFetch 默认禁止、`--tools` 可豁免、忽略 user/project/local 设置、拒绝 bypass）；`--safe-mode` 与 `--restricted` 在首屏显示生效状态。测试 `tests/unit/restricted-mode.test.ts`（6 用例）。
5. ~~**官方后台会话族缺失**~~ **已补**：`ps/logs/attach/kill` 默认开放，`stop/rm/respawn` 归入同一快速路径（需 `CLAUDE_CODE_FEATURE_BG_SESSIONS=1` 以避免与常用动词冲突）。测试 `tests/unit/bg-session-handlers.test.ts`（8 用例）。
6. ~~**无配置静默启动**~~ **已补**：新增 `src/utils/modelReadiness.ts`；`-p` 模式在 stderr 给一行提示，交互模式在首屏注入 warning 系统消息。测试 `tests/unit/model-readiness.test.ts`（8 用例）。
7. **提示词已汉化**（§5.3）：与官方行为/缓存基线脱钩。**（设计选择，不修复）**
8. **无法从官方二进制还原源码**：官方 2.1.303 已不含 `sourcesContent`，任何"逐行对照官方实现"都只能靠行为与字符串推断。**（客观限制）**
9. **`--autocompact`**（§2.1）**已补**：支持 `auto` 与 100k–1M（`100k`/`200K`/`1000000`），翻译为 `CLAUDE_CODE_AUTO_COMPACT_WINDOW`。测试 `tests/unit/autocompact-flag.test.ts`（5 用例）。
10. ~~**`--ax-screen-reader` 缺失**~~ **已补（2026-11-01）**：映射到既有的 `CLAUDE_CODE_ACCESSIBILITY=1`（Ink 层据此保留原生光标，`App.tsx` 两处消费），未新增第二套语义。测试 `tests/unit/ax-screen-reader-flag.test.ts`（3 用例，变异验证：删掉映射体 → 用例 2 失败）。

### 7.1 2026-11-01 复核结果（重要）

本报告生成于 2026-10-20，此后代码持续变化。按「重跑核对、不信旧结论」的原则，对 §2.1 表中所有「本地无/缺失」项逐条在 `src/` 中复核，结果**大半已过时**：

| 项 | 报告标注 | 复核结果 |
|---|---|---|
| `--teleport` / `--remote-control` | 本地无 | **已注册**（`main.tsx`）；云能力仍不可达，但参数壳存在 |
| `--exclude-dynamic-system-prompt-sections` | 本地无 | **已实现**（`main.tsx` 注册 + `context.ts` 消费） |
| `--permission-prompts` | 本地无 | **已实现**（`main.tsx` + `cli/print.ts` 统一兜底） |
| `--plugin-url` | 本地无 | **已实现**（`entrypoints/cli.tsx` 手工解析） |
| `--permission-prompt-tool` | 仅隐藏 | 确认存在但 `.hideHelp()` |
| `--cloud` / `--environment` | 本地无 | 仍缺失（云端能力，本地无对应路线） |
| `--system-prompt-snapshot` / `--prompt-suggestions` | 本地无 | 仍缺失（前者需会话录制机制；后者 SDK 层已有字段但无预测逻辑） |
| `gateway` / `import` / `purge` 子命令 | 本地无 | 仍缺失（`purge` 有斜杠命令 `/project-purge` 可替代） |

**结论**：`--forward-subagent-text` 已于 2026-11-01 补齐（见第 11 条）。剩余可对齐项仅 `--system-prompt-snapshot`、`--prompt-suggestions` 两项（均需新增子系统而非纯入口），其余要么已是云端路线差异（不修），要么已实现。

11. ~~**`--forward-subagent-text` 未生效**~~ **已补（2026-11-01）**：排查发现三件基础设施都在（`CLAUDE_CODE_FORWARD_SUBAGENT_TEXT` → `settings.forwardSubagentText`、`agent_progress` 转发、`normalizeMessage` 会填 `parent_tool_use_id`），**唯独该标志无人读取**，且 `AgentTool.tsx:1166` 只放行 `tool_use`/`tool_result`，text 与 thinking 被直接 `continue` 跳过 —— 典型的「配置存在但功能未生效」。
    - 新增 `src/utils/subagentTextForwarding.ts`：`shouldForwardSubagentBlock()` 判据 + `isSubagentTextForwardingEnabled()`（同时认环境变量与 settings，环境变量只认 `'1'` 以与 `featureFlags.ts:167` 一致）。
    - `AgentTool.tsx` 转发点接入判据；`main.tsx` 注册参数并写入环境变量，同时按官方约束在非 `--print + --output-format=stream-json` 时报错退出（不静默忽略）。
    - 测试 `tests/unit/forward-subagent-text.test.ts`（6 用例）。变异验证：清空可转发类型集 → 用例 2 失败；放宽环境变量判定 → 用例 4 失败，均已捕获。
    - 实测：`-p --output-format=stream-json` 合法组合正常输出；缺 `--print` 或非 stream-json 时打印官方同款错误并以 1 退出；构造 `agent_progress` 走真实 `normalizeMessage`，确认 `parent_tool_use_id` 被如实保留。
    - **未做**：真实子代理的端到端（当前模型两次都不愿调用 Agent 工具，得到的是模型行为而非代码行为，故改为直接验证数据流）。模型滞后（第 1 条）仍不可修 —— 需官方模型清单与定价数据，不能靠推测。

---

## 8. 官方有、本地可用替代（迁移对照）

| 官方用法 | 本地等价做法 |
|---|---|
| `claude --bg` + `attach/logs/stop/rm` | **已实现**：`--bg` 启动；`ps`/`logs`/`attach`/`kill` 默认可用，`stop`/`rm`/`respawn` 需 `CLAUDE_CODE_FEATURE_BG_SESSIONS=1`。进程内后台任务仍走 `/tasks` + `TaskOutput`/`TaskStop` |
| `claude --cloud ...` / `--environment` | 无（请用 `server` + 本地桥 + 隧道） |
| `claude --remote-control` | `/bridge`、`server`、Android 客户端、`/mobile-connect` |
| `claude gateway` | 无（企业场景需自行搭建反向代理，`src/upstreamproxy/` 提供基础件） |
| `claude import` | 无（可手动迁移 `~/.claude/CLAUDE.md`、`settings.json`、`agents/`、`skills/`） |
| `claude purge` | `/project-purge` |
| `claude ultrareview <target>` | `/ultrareview` 或 `ultrareview` 工具（本地实现，非云托管） |
| `--restricted` | **已实现**（执行类工具 + WebFetch 默认禁止，`--tools` 可豁免；忽略 user/project/local 设置；拒绝 bypass） |
| `--autocompact 100k` | **已实现**（`auto` 或 100k–1M，内部映射到 `CLAUDE_CODE_AUTO_COMPACT_WINDOW`） |
| `--prompt-suggestions` | 无 CLI 入口（仅 SDK `promptSuggestions` 字段） |

---

## 附录 A：复现命令

```bash
# 1) 拉取官方最新包（版本以 npm 当前 latest 为准）
npm pack @anthropic-ai/claude-code@2.1.303
npm pack @anthropic-ai/claude-code-win32-x64@2.1.303
tar -xzf anthropic-ai-claude-code-2.1.303.tgz
tar -xzf anthropic-ai-claude-code-win32-x64-2.1.303.tgz

# 2) 官方可执行验证
./package/claude.exe --version      # 2.1.303 (Claude Code)
./package/claude.exe --help         # -> help.txt
./package/claude.exe mcp --help     # -> mcp.txt

# 3) 官方二进制字符串（证据来源）
strings -n 6 package/claude.exe > strings.txt

# 4) 本地 fork 对照
bun run src/bootstrap-entry.ts --version   # 999.0.0-DOGE (Claude Code)
bun run src/bootstrap-entry.ts --help      # -> help_doge.txt
bun run .tmp/off/dump_tools_ext.ts         # -> tools_all.json（全量 84）
bun run .tmp/off/dump_tools.ts             # -> tools_doge.json（默认 78）
bun run .tmp/off/dump_cmds2.ts             # -> cmds_doge.json（297/294，修复重名后）
npx vitest run tests/unit/command-name-uniqueness.test.ts   # 命令名唯一性回归
bun run .tmp/off/dump_skills.ts            # -> skills_doge.json（28 内置技能）
python .tmp/off/analyze.py                 # -> analyze_out.txt
python .tmp/off/check_commands.py          # -> cmd_match.txt
```

## 附录 B：口径与边界声明

- 版本对照的是**官方 npm latest（2.1.303）**，不是"官方某个历史版本"。若本地源码还原自更早版本（如 2.1.302 附近），则 §2 的"官方有本地无"中也包含**版本演进差异**，不仅是 fork 改动。判定原则：能用源码证明"从未实现"的（如 `--restricted` 全仓零引用）归为 fork 缺失；仅"名字不同/形态不同"的归为演进或路线差异。
- 官方工具集合用字符串命中判定，**存在假阴性**（bun chunk 内符号可能被压缩或改名）。因此 §3.3 的"官方无同名"应理解为"官方发布物中没有该标识符"，而非"官方绝无此能力"。
- 本地工具/命令数量为**当前工作区代码的运行时结果**（含未提交改动），与特定发布版 APK 不一定一致。
- 官方斜杠命令无法枚举（§1 已说明），故未给出"官方命令总表 vs 本地命令总表"的双向全量 diff。
