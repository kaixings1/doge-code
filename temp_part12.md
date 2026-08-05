---

# 附录 A：快捷键

| 快捷键 | 功能 |
|--------|------|
| Shift+Tab（两次） | 进入/退出计划模式 |
| ESC（两次） | 回滚上下文 |
| Ctrl+C | 中断当前操作 |
| Ctrl+D | 退出程序 |
| Tab | 自动补全（命令、Git 分支、文件路径） |
| ↑/↓ | 浏览历史消息 |
| Ctrl+L | 清屏 |
| Ctrl+U | 清空当前输入 |
| Ctrl+W | 删除前一个单词 |

---

# 附录 B：配置文件

| 文件 | 说明 |
|------|------|
| `~/.doge/.claude.json` | 全局配置文件（API Key、模型列表、默认设置） |
| `~/.doge/projects/<hash>/memory/` | 记忆系统存储 |
| `~/.doge/projects/<hash>/sessions/` | 会话历史存储 |
| `~/.doge/skills/` | 全局技能目录 |
| `.doge/` 目录 | 项目级配置（每项目独立） |
| `.doge/models.json` | 项目模型配置 |
| `.doge/settings.json` | 项目设置 |
| `.doge/plugins/` | 项目插件 |
| `.claudeskills/` | 项目技能 |
| `CLAUDE.md` | 项目上下文文件（AI 读取） |
| `biome.json` | 代码检查配置 |
| `tsconfig.json` | TypeScript 配置 |
| `package.json` | 包配置 |
| `bunfig.toml` | Bun 配置 |
| `electron-builder.yml` | 桌面端构建配置 |

---

# 附录 C：故障排除

| 问题 | 解决方案 |
|------|----------|
| AI 反复啰嗦不执行 | `/clear` 重新会话 |
| 上下文过长 | `/compact` 压缩 |
| 修改错误需要回退 | `/rewind` 或两次 ESC |
| 模型响应慢 | `/fast` 切换快速模式，或 `/model` 换模型 |
| 环境/配置问题 | `/diagnose` 诊断 |
| 编译失败 | 使用 debug-expert 代理 |
| Token 消耗过快 | 使用中文提示词，`/compact` 压缩，`/clear` 清理 |
| API Key 泄露风险 | 检查 `.gitignore` 排除 `.doge/` |
| 工具执行失败 | 检查权限设置 `/permissions` |
| 技能加载失败 | `/reload-plugins` 重新加载 |
| 远程连接失败 | `/remote-setup` 重新配置 |
| Hook 执行失败 | 检查 `/hooks` 配置 |
| 内存不足 | `/heapdump` 分析内存使用 |

---

# 附录 D：最佳实践

1. **提示词精准**：使用"必须"、"一定"、"务必"等限制词
2. **会话管理**：复杂任务分阶段，完成后 `/clear`
3. **技能利用**：任务完成后让 AI 总结为技能供复用
4. **权限管理**：合理配置工具权限，平衡效率和安全
5. **Git 规范**：及时提交，利用 AI 生成 commit message
6. **记忆维护**：定期清理过时记忆，保持记忆系统有效
7. **模型选择**：简单任务用轻量模型，复杂任务用强力模型
8. **子代理**：利用代理系统并行处理独立子任务
9. **Hooks 自动化**：配置 PostToolUse Hook 实现任务完成声音提醒
10. **插件管理**：定期清理不用的插件，保持系统轻量
11. **项目隔离**：每个项目使用独立的 `.doge/` 配置
12. **快照保护**：重要操作前先提交 git，利用文件快照双重保障

---

# 附录 E：完整命令速查表（按字母排序）

```
/add-dir          /add-model        /advisor          /agent-new
/agents           /agents-platform  /ant-trace        /api-debug
/api-doc          /assistant        /auto-commit      /autocomplete
/autofix-pr       /auto-mode-reset  /backfill-sessions/background
/backup           /batch-han        /benchmark        /bg
/blame            /block-mode       /bookmark         /branch
/break-cache      /bridge           /bridge-kick      /bridge-sessions
/brief            /browser          /btw              /buddy
/bughunter        /cache            /changelog        /chrome
/clear            /code-health      /code-review-assistant          /code-search
/color            /commit           /commit-push-pr   /compact
/compare          /complete         /conflict         /config
/context          /context-collapse /contributors     /copy
/copy-page        /cost             /cost-history     /cron
/ctx_viz          /custom-cmd       /dashboard        /database
/debug-tool-call  /dependency-analyzer             /deploy
/deps             /deps-viz         /desktop          /diagnose
/diagram          /diff             /diff-mode        /diff-review
/docker           /docker-sandbox   /doctor           /documentation-index
/effort           /env              /errors           /event-stream
/excel            /exit             /export           /extra-usage
/fast             /feedback         /file-history     /file-watcher
/files            /fmt              /focus            /force-snip
/fork             /format           /fuck             /game
/getting-started  /git-graph        /good-claude      /graphql
/health-score     /heapdump         /help             /hooks
/http             /i18n-extract     /ide              /image
/imports          /init             /init-verifiers   /insights
/install          /install-github-app             /install-slack-app
/issue            /k8s              /keybindings      /keys
/less-permission-prompts         /logger           /login
/logout           /logs             /loop             /mcp
/mcp-discovery    /mcp-tool-search  /memory           /memory-bank
/memory-monitor   /memory-search    /metrics          /mobile
/mock-limits      /model            /monitor          /nginx
/notebook         /notify           /oauth-refresh    /onboarding
/output-style     /pair             /passes           /pdf
/peers            /perf-issue       /performance      /performance-profiler
/permissions      /plan             /plancppwin       /plan-mode
/plugin           /plugin-market    /plugins          /ports
/powerup          /pr_comments      /privacy-settings /proactive
/project-purge    /prompt-diff      /pr-review        /queue
/rag              /rate-limit-options             /redis
/refactor         /release          /release-notes    /reload-plugins
/remoteControlServer             /remote-env       /remote-setup
/remove-model     /rename           /repo-map         /reset-limits
/resume           /review           /rewind           /rules
/rstk             /sandbox-toggle   /scaffold         /schedule
/security         /security-audit   /security-review  /session
/session-search   /session-tag      /sessions         /share
/shell            /shortcuts        /skills           /skills-i18n
/snippet          /snippets         /stash            /stats
/status           /statusline       /stickers         /stock
/subscribe-pr     /summary          /symbol           /tag
/task             /task-create      /tasks            /tc
/team             /team-onboarding  /teleport         /templates
/terminalSetup    /test-gen         /test-run         /test-runner
/theme            /thinkback        /thinkback-play   /todo
/torch            /translate        /tui              /ultraplan
/updateapikey     /updateskills     /upgrade          /usage
/vector-search    /version          /vim              /voice
/websocket        /wiki             /workflows        /workspace
```

---

# 附录 F：完整目录结构

```
Doge Code/
├── src/
│   ├── api/               ← API 层（注册表、会话管理）
│   ├── assistant/         ← 助手会话管理
│   ├── bridge/            ← 桌面/远程桥接
│   ├── buddy/             ← 伙伴系统
│   ├── commands/          ← 180+ CLI 命令
│   ├── components/        ← UI 组件库
│   ├── constants/         ← 系统常量
│   ├── context/           ← React 上下文
│   ├── coordinator/       ← 多代理协调器
│   ├── daemon/            ← 守护进程
│   ├── engine/            ← 核心 AI 引擎
│   │   ├── coders/        ← 代码生成器
│   │   ├── errors/        ← 错误处理
│   │   ├── streaming/     ← 流式处理
│   │   └── subagent/      ← 子代理引擎
│   ├── entrypoints/       ← CLI/开发模式入口
│   ├── features/          ← 功能标志系统
│   ├── hooks/             ← 80+ React Hooks
│   ├── jobs/              ← 任务分类器
│   ├── memory/            ← 记忆系统
│   ├── migrations/        ← 数据迁移脚本
│   ├── plugins/           ← 插件系统
│   ├── proactive/         ← 主动建议
│   ├── remote/            ← 远程会话
│   ├── screens/           ← 终端 UI 屏幕
│   ├── security/          ← 安全模块
│   ├── self-hosted-runner/← 自托管运行器
│   ├── server/            ← 服务器模式
│   ├── services/          ← 30+ 后台服务
│   ├── skills/            ← 技能系统
│   ├── ssh/               ← SSH 会话
│   ├── state/             ← 全局状态管理
│   ├── stubs/             ← 桩文件
│   ├── tools/             ← 70+ 内置工具
│   ├── types/             ← TypeScript 类型定义
│   ├── utils/             ← 300+ 工具函数
│   ├── vim/               ← Vim 模式
│   └── voice/             ← 语音功能
├── scripts/               ← 构建/发布脚本
├── desktop-electron/      ← Electron 桌面端
├── shims/                 ← 兼容性填充
└── vendor/                ← 第三方依赖
```

---

# 附录 G：桌面端命令速查

```
/desktop              ← 启动桌面端
/desktop              ← 桌面端模式管理
```

---

# 附录 H：桌面端构建速查表

```cmd
:: 开发模式
cd desktop
node scripts/dev.mjs

:: 构建（当前平台）
node scripts/build-vite.mjs

:: 构建 Windows
node scripts/build-vite.mjs --platform win

:: 打包（当前平台）
node scripts/pack.mjs

:: 完整发布（构建+打包）
node scripts/build-vite.mjs && node scripts/pack.mjs

:: 清理
node -e "require('fs').rmSync('dist',{recursive:true,force:true});require('fs').rmSync('release',{recursive:true,force:true})"

:: E2E 测试
npx playwright test

:: 类型检查
tsc --noEmit
```

---

# 附录 I：完整环境变量参考

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CLAUDE_CONFIG_DIR` | 配置目录 | `~/.doge` |
| `CLAUDE_CODE_*` | 项目环境变量前缀 | — |
| `LOG_LEVEL` | 日志级别 | `info` |
| `NODE_ENV` | 运行环境 | `production` |
| `ANTHROPIC_API_KEY` | Anthropic API Key | — |
| `ANTHROPIC_BASE_URL` | Anthropic Base URL | — |
| `ANTHROPIC_MODEL` | 默认模型 | — |
| `ANTHROPIC_SMALL_FAST_MODEL` | 轻量快速模型 | — |
| `OPENAI_API_KEY` | OpenAI API Key | — |
| `OPENAI_BASE_URL` | OpenAI Base URL | — |
| `CLAUDE_CODE_USE_BEDROCK` | 使用 AWS Bedrock | `0` |
| `CLAUDE_CODE_USE_VERTEX` | 使用 Google Vertex | `0` |
| `CLAUDE_CODE_USE_FOUNDRY` | 使用 Foundry | `0` |
| `CLAUDE_CODE_SANDBOX_FILESYSTEM_DISABLED` | 禁用文件系统沙箱 | `0` |
| `CLAUDE_CODE_WORKFLOW_SIZE` | 工作流大小限制 | `15` |
| `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` | 并发子代理上限 | `20` |
| `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` | 子代理嵌套深度 | `3` |
| `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` | 每会话搜索上限 | `200` |
| `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` | MCP 自动后台化超时 | `120000` |
| `CLAUDE_CODE_FORWARD_SUBAGENT_TEXT` | 转发子代理文本 | `0` |
| `CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH` | OTEL 内容最大长度 | `60000` |
| `CLAUDE_CODE_PLUGIN_URL` | 插件 URL | — |
| `EMOJI_COMPLETION_ENABLED` | Emoji 自动补全 | `1` |
| `FORCE_HYPERLINK` | 强制终端超链接 | `1` |
| `DOGE_API_JSON` | 桌面端配置文件路径 | — |
| `BUN_CONFIG_NO_CLEAR` | Bun 配置 | — |
| `UPSTREAM_URL` | 上游仓库 URL | — |
| `UPSTREAM_BRANCH` | 上游分支 | `main` |
| `TARGET_BRANCH` | 目标分支 | `main` |
| `NPM_PACKAGE_NAME` | npm 包名 | — |
| `NPM_BIN_NAME` | npm 命令名 | — |
| `PUBLISH_REPOSITORY_URL` | npm 发布仓库 | — |
| `NPM_TOKEN` | npm 发布 Token | — |

---

# 附录 J：桌面端 IPC 通信

## J.1 IPC 通道

| 通道 | 方向 | 功能 |
|------|------|------|
| `engine:query` | 渲染→主 | 发送 AI 查询 |
| `engine:response` | 主→渲染 | AI 响应流 |
| `engine:error` | 主→渲染 | AI 错误 |
| `terminal:spawn` | 渲染→主 | 创建终端 |
| `terminal:write` | 渲染→主 | 写入终端 |
| `terminal:data` | 主→渲染 | 终端输出 |
| `terminal:exit` | 主→渲染 | 终端退出 |
| `session:save` | 渲染→主 | 保存会话 |
| `session:load` | 渲染→主 | 加载会话 |
| `session:list` | 渲染→主 | 列出会话 |
| `plugin:scan` | 渲染→主 | 扫描插件 |
| `plugin:install` | 渲染→主 | 安装插件 |
| `plugin:uninstall` | 渲染→主 | 卸载插件 |
| `batch:create` | 渲染→主 | 创建批量任务 |
| `batch:start` | 渲染→主 | 启动批量任务 |
| `batch:cancel` | 渲染→主 | 取消批量任务 |
| `batch:progress` | 主→渲染 | 批量任务进度 |
| `lsp:start` | 渲染→主 | 启动 LSP 服务器 |
| `lsp:stop` | 渲染→主 | 停止 LSP 服务器 |
| `lsp:diagnostics` | 主→渲染 | LSP 诊断 |
| `remote:start` | 渲染→主 | 启动远程控制 |
| `remote:stop` | 渲染→主 | 停止远程控制 |

---

# 附录 K：桌面端开发辅助脚本

| 脚本 | 功能 |
|------|------|
| `fix_api_client.js` | API 客户端修复 |
| `repair_apiClient.js` | API 客户端修复（另一版本） |
| `rebuild_apiclient.py` | API 客户端重建（Python） |
| `fix_apiclient.py` | API 客户端修复（Python） |
| `fix_block.py` | 阻塞代码修复（Python） |
| `fix_context.py` | 上下文修复（Python） |
| `fix_index_imports.py` | 导入修复（Python） |
| `patch_aps.py` | API 补丁（Python） |
| `surgical_fix.py` | 精准修复（Python） |
| `analyze_no_default.py` | 无默认值分析（Python） |
| `analyze_shims.py` | Shim 分析（Python） |
| `check_bytes.py` | 字节检查（Python） |
| `check_encoding2.py` | 编码检查（Python） |
| `check_js_refs.py` | JS 引用检查（Python） |
| `check_jsx.py` | JSX 检查（Python） |
| `check_jsx2.py` | JSX 检查 v2（Python） |
| `check_jsx3.py` | JSX 检查 v3（Python） |
| `check_line.py` | 行检查（Python） |
| `check_no_default.py` | 无默认值检查（Python） |
| `check_shims.py` | Shim 检查（Python） |
| `find_problems.py` | 问题查找（Python） |
| `find_stale.py` | 过期代码查找（Python） |
| `fix-tests.js` | 测试修复 |
| `fix-vml-t7.js` | VML 测试修复 |
| `debug-t8.js` | 调试工具 |
| `debug-tests.js` | 测试调试 |
| `test-real-impl.js` | 真实实现测试 |
| `test-t3.js` | T3 测试 |
| `test-t3-debug.js` | T3 调试测试 |
| `test_bundle_check.js` | 包检查测试 |
| `test-parse.js` | 解析测试 |
| `diagnostic-flow.mjs` | 诊断流程 |
| `tmp_electron_path_test.mjs` | Electron 路径测试 |

> 注意：这些脚本主要用于开发和调试，普通用户无需使用。

---

# 附录 L：GitHub 克隆仓库

`.github/` 目录包含大量克隆的开源技能和工具仓库（非 GitHub Actions 工作流），用于参考和集成：

| 类别 | 示例 |
|------|------|
| AI 代理框架 | `langchain/`, `autogen/`, `crewAI/`, `semantic-kernel/` |
| 编程代理 | `aider/`, `gpt-engineer/`, `SWE-agent/`, `Cline/` |
| MCP 相关 | `mcp_excalidraw/`, `BeehiveInnovations-pal-mcp-server/` |
| 技能集合 | `awesome-claude-skills/`, `awesome-claude-agents/`, `awesome-claude-code-subagents/` |
| 教育材料 | `biology-notes-page1.json`, `chemistry-notes-page1.json`, `gaokao-*.json` |
| 开发工具 | `continue/`, `CherryHQ-cherry-studio/`, `avante-nvim/` |
| 模型推理 | `ollama/`, `vllm/`, `sglang/` |

---

# 附录 M：术语表（Glossary）

| 术语 | 说明 |
|------|------|
| **Agent** | 专用子代理，可独立执行特定任务（如代码审查、数据分析） |
| **ASAR** | Electron 应用打包格式，将多个文件合并为单个归档 |
| **Bun** | JavaScript/TypeScript 运行时和打包工具，Doge Code 的构建基础 |
| **CLAUDE.md** | 项目上下文文件，AI 读取以了解项目结构和约定 |
| **Compact** | 上下文压缩，将历史对话压缩为摘要以释放 token 空间 |
| **CRDT** | 无冲突复制数据类型，用于桌面端文档协作 |
| **Dogerules** | 持久化规则文件，跨会话生效的指令（类似 .cursorrules） |
| **Feature Flag** | 功能标志，通过环境变量控制功能的启用/禁用 |
| **Hook** | 钩子，在特定事件发生时自动执行的 shell 命令 |
| **IPC** | 进程间通信，桌面端主进程与渲染进程之间的消息传递 |
| **LSP** | 语言服务器协议，提供代码智能功能（补全、诊断等） |
| **MCP** | Model Context Protocol，连接外部工具和数据的标准协议 |
| **MSYS2** | Windows 下的 Unix 环境，Doge Code 的 Git Bash 运行基础 |
| **node-pty** | 伪终端库，用于桌面端终端模拟器 |
| **REPL** | 读取-求值-输出循环，交互式命令行界面 |
| **Repo Map** | 代码库映射，生成目录结构 + 符号分组摘要 |
| **Rewind** | 上下文回滚，恢复到指定轮次的对话状态 |
| **Sandbox** | 沙箱隔离，在受限环境中执行危险操作 |
| **Skill** | 可加载的专业技能模块，扩展 AI 能力 |
| **SSE** | 服务器推送事件，用于流式 API 响应 |
| **Subagent** | 子代理，由主代理启动的独立 AI 进程 |
| **Token** | AI 模型处理文本的最小单位，影响费用和上下文窗口 |
| **TUI** | 终端用户界面，基于 Ink 框架的 React 终端渲染 |
| **Vite** | 前端构建工具，桌面端 Electron 应用使用 |
| **Webview** | Web 视图，VS Code 扩展中用于构建富 UI 的面板 |
| **xterm.js** | 终端模拟器库，桌面端终端面板使用 |
| **Lamport 时钟** | 分布式系统中用于事件排序的逻辑时钟 |

---

# 附录 N：常见问题（FAQ）

## N.1 安装与启动

**Q: Bun 安装失败怎么办？**
```cmd
# 确保使用最新版本的 Bun
curl -fsSL https://bun.sh/install | bash
# 或 Windows 下
powershell -c "irm bun.sh/install.ps1 | iex"
```

**Q: 启动时提示 "command not found: bun"？**
```cmd
# 将 Bun 添加到 PATH
set PATH=%USERPROFILE%\.bun\bin;%PATH%
```

**Q: 如何更新到最新版本？**
```cmd
git pull
bun install
bun link
```

## N.2 模型配置

**Q: 支持哪些模型？**
- Anthropic Claude 系列（3.5/4/4.5/Opus 4/4.1/4.5/4.6）
- OpenAI 兼容接口（GPT-4o、DeepSeek、Qwen 等）
- 本地模型（Ollama、vLLM 等）

**Q: 如何切换模型？**
```
/model                    # 交互式切换
/model claude-sonnet-4-6  # 直接指定
```

**Q: 如何配置多个模型？**
创建 `.doge/models.json`，为不同项目配置不同模型。

## N.3 使用技巧

**Q: 如何减少 token 消耗？**
- 使用中文提示词（单 token 信息密度更高）
- 复杂任务分阶段完成，每阶段 `/clear`
- 使用 `/compact` 压缩上下文
- 简单任务用轻量模型，复杂任务用强力模型

**Q: AI 反复啰嗦不执行怎么办？**
- `/clear` 重新会话
- 使用"必须"、"一定"、"务必"等限制词
- 减少上下文，只保留关键信息

**Q: 如何保存重要对话？**
- 使用 `/rename` 命名会话
- 使用 `/resume` 恢复历史会话
- 桌面端会话自动保存到 `.doge/sessions/`

## N.4 故障排除

**Q: 编译失败怎么办？**
```cmd
# 清理缓存
bun pm cache rm
bun install
compile.bat
```

**Q: 桌面端无法启动？**
```cmd
# 清理并重新构建
cd desktop
npm install
node scripts/dev.mjs
```

**Q: API Key 泄露风险？**
- 确保 `.gitignore` 包含 `.doge/`
- 不要将 API Key 提交到代码库
- 使用环境变量或 `.doge/` 目录存储

---

# 附录 O：最佳实践

## O.1 提示词工程

1. **精准明确**：使用"必须"、"一定"、"务必"等限制词
2. **分而治之**：复杂任务拆分为多个小步骤
3. **提供上下文**：告诉 AI 你的项目背景和技术栈
4. **示例驱动**：提供输入输出示例，让 AI 理解你的期望
5. **约束边界**：明确告诉 AI 不要做什么

## O.2 会话管理

1. **及时清理**：任务完成后 `/clear`，减少 token 消耗
2. **阶段划分**：不同任务使用不同会话
3. **命名规范**：使用 `/rename` 给会话起有意义的名字
4. **定期保存**：重要会话及时保存到磁盘

## O.3 模型选择

| 任务类型 | 推荐模型 | 原因 |
|----------|----------|------|
| 简单代码修改 | Haiku / 本地模型 | 速度快、费用低 |
| 复杂架构设计 | Opus / Sonnet 4.6 | 理解力强 |
| 代码审查 | Sonnet 4.5+ | 准确度高 |
| 文档生成 | Haiku / 本地模型 | 信息密度高 |

## O.4 项目规范

1. **维护 CLAUDE.md**：让 AI 了解项目约定
2. **使用 .dogerules**：设置跨会话的团队规范
3. **及时更新 .gitignore**：排除敏感文件和构建产物
4. **定期清理技能**：删除不用的技能，保持系统轻量

## O.5 安全实践

1. **API Key 管理**：使用环境变量或 `.doge/` 目录，不要硬编码
2. **权限控制**：合理配置工具权限，平衡效率和安全
3. **代码审查**：使用 `/review` 和 `/security-audit` 检查代码
4. **Git 规范**：及时提交，利用 AI 生成 commit message

---

# 附录 P：贡献指南

## P.1 开发环境搭建

```cmd
git clone https://github.com/kaixings1/doge-code.git
cd doge-code
bun install
bun run dev
```

## P.2 代码规范

1. **类型安全**：使用严格 TypeScript，避免 any 类型
2. **文件 I/O**：使用 FileReadTool/FileWriteTool 而非原生 fs
3. **系统命令**：通过 BashTool 执行，输入输出为字符串
4. **状态更新**：通过 state store 的 set() 方法更新
5. **日志**：通过 LoggerTool 或 process.env.LOG_LEVEL 控制

## P.3 提交规范

```bash
# 提交消息格式
git commit -m "$(cat <<'EOF'
   简述变更内容

   Co-Authored-By: kaixings <30445355@qq.com>
   EOF
   )"
```

## P.4 测试

```cmd
# 运行所有测试
bun test

# 运行集成测试
bun test src/__tests__/integration

# 运行 E2E 测试
bun test src/__tests__/e2e

# 运行性能测试
bun test src/__tests__/performance
```

## P.5 构建

```cmd
# 编译 CLI
compile.bat

# 编译桌面端
cd desktop
node scripts/build-vite.mjs
node scripts/pack.mjs
```

---

# 附录 Q：安全政策

## Q.1 密钥管理

- API Key 存储在 `~/.doge/` 目录或环境变量中
- 不要将 API Key 提交到代码库
- 使用 `.gitignore` 排除 `.doge/` 目录
- 定期轮换 API Key

## Q.2 工具执行安全

- 危险操作（删除文件、push 代码）需要用户确认
- 工具执行在沙箱中隔离
- 可通过 `/permissions` 管理工具的权限级别
- 可通过 `/sandbox-toggle` 切换沙箱模式

## Q.3 安全扫描

- `/security-audit` — 全面安全扫描
- `/audit` — 快捷安全扫描（别名）
- `/sast` — 静态分析（别名）

## Q.4 报告安全问题

如果发现安全漏洞，请在 GitHub 仓库提交 Issue。

---

# 附录 R：许可证

本仓库基于 Claude Code 的 Fork 开发，包含恢复期代码与后续 Fork 改动，不代表官方立场。

- 本仓库是 Claude Code 的 Fork 的再次分叉
- 它包含恢复期代码与后续 Fork 改动
- 不代表官方立场
- 如果某些行为看起来"很像官方，但又不完全像"，那通常不是你看错了，而是这确实是恢复版 + 魔改版的叠加态

---

# 附录 S：文档修订历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.0 | 2026-08-03 | 初版：系统概述、CLI 命令、工具系统、技能、代理 |
| v2.0 | 2026-08-03 | 新增：环境变量、插件系统、Hooks、远程/分布式、语音/Vim、伙伴系统 |
| v3.0 | 2026-08-03 | 新增：功能标志、引擎核心、模型系统、权限系统、设置系统、常量、服务层 |
| v4.0 | 2026-08-03 | 新增：桌面端完整参考、测试框架、根目录配置 |
| v5.0 | 2026-08-03 | 新增：本地桥接服务器、示例配置、桌面端辅助脚本 |
| v6.0 | 2026-08-03 | 新增：桌面端主进程/渲染进程深度参考、构建配置、IPC 通信 |
| v7.0 | 2026-08-03 | 新增：/rules、/dashboard、IDE 扩展、Agent 开发指南 |
| v8.0 | 2026-08-03 | 新增：未文档化工具、后台服务完整列表 |
| v9.0 | 2026-08-03 | 新增：完整命令注册参考（180+ 命令）、功能标志环境变量 |
| v10.0 | 2026-08-03 | 新增：专用代理完整列表（182 个代理） |
| v11.0 | 2026-08-03 | 新增：快速开始、安装配置、术语表、FAQ、最佳实践、贡献指南、安全政策、许可证 |
| v12.0 | 2026-08-03 | 新增：软件开发全流程、智能体使用、环境变量与宏定义、完整目录结构 |
| v13.0 | 2026-08-03 | 新增：项目目录结构详解、宏定义深度、开发全流程整合、智能体全方位整合、综合实战案例 |
| v14.0 | 2026-08-03 | 新增：性能优化、备份恢复、多项目工作流、CI/CD、API 参考、迁移指南、隐私、故障排除、索引 |
| v15.0 | 2026-08-03 | 新增：实战操作手册、工具真实输入输出、代理真实对话、宏定义真实代码、环境变量真实效果 |
| v16.0 | 2026-08-03 | 新增：自定义技能开发、MCP 配置实战、Hook 编排、多代理协作、性能基准、完整项目案例 |
| v17.0 | 2026-08-03 | 新增：.github 目录、桌面端脚本、自动化脚本、API 令牌、高级调试、高级工作流、团队协作、安全合规 |
| v18.0 | 2026-08-03 | 新增：命令深度使用、工具链整合、高级代理模式、高级 Hook 模式、MCP 高级配置、性能高级技巧、安全高级技巧、团队协作高级技巧、综合实战案例 |
| v19.0 | 2026-08-04 | 重建版：从对话历史完整恢复全部章节 |

---

# 附录 T：索引

## 按功能查找

| 功能 | 命令/工具 | 章节 |
|------|-----------|------|
| 代码审查 | `/review` + `AgentTool(critic)` | 52.4 |
| 代码生成 | `FileWriteTool` + `AgentTool` | 52.2 |
| 测试生成 | `/test-gen` | 52.3 |
| 智能提交 | `/commit` | 52.5 |
| 安全扫描 | `/security-audit` | 52.4 |
| 调试 | `/diagnose` + `AgentTool(debug-expert)` | 52.6 |
| 部署 | `AgentTool(deployer)` | 52.7 |
| 监控 | `/monitor` + `/dashboard` | 52.8 |
| 记忆管理 | `/memory` + `/memory-search` | 第七部分 |
| 规则管理 | `/rules` | 44 |
| 模型切换 | `/model` | 52.1 |
| 会话管理 | `/clear` + `/resume` + `/sessions` | 52.2 |
| 技能管理 | `/skills` + `/updateskills` | 第四部分 |
| 代理管理 | `/agents` + `/agent-new` | 第五部分 |
| 插件管理 | `/plugins` + `/plugin` | 第十二部分 |
| Hook 管理 | `/hooks` | 第十三部分 |
| 环境变量 | `CLAUDE_CODE_*` | 54 |
| 宏定义 | `feature()` | 54 |

## 按问题查找

| 问题 | 解决方案 | 章节 |
|------|----------|------|
| Token 超限 | `/compact` + `/clear` | 61.1 |
| 响应慢 | 使用本地模型 + 并发代理 | 61.2 |
| 启动失败 | `/diagnose` + `/doctor` | 68.1 |
| 工具失败 | `/permissions` + `/debug-tool-call` | 68.2 |
| 会话卡住 | `Ctrl+C` + `/clear` | 68.2 |
| 配置丢失 | `/backup` + `/restore` | 62 |
| 多项目切换 | `/sessions` + `/resume` | 63 |
| 迁移数据 | 迁移指南 | 66 |

---

> **文档版本**：v19.0（重建版）
> **最后更新**：2026-08-04
> **总行数**：约 12000+ 行
> **覆盖范围**：代码库全部命令（180+）、工具（70+）、服务（30+）、代理（182）、组件（60+）、Hooks（80+）、项目结构详解、环境变量、宏定义、软件开发全流程、智能体/子代理/工作流全方位整合、综合实战案例、性能优化、备份恢复、CI/CD集成、API参考、迁移指南、隐私保护、故障排除、最佳实践、索引