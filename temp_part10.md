---

# 第七十八部分：.github/ 目录详解

## 78.1 目录概述

`.github/` 目录包含大量克隆的开源技能、工具和资源仓库（非 GitHub Actions 工作流），用于参考和集成。

## 78.2 技能集合

| 仓库 | 说明 | 用途 |
|------|------|------|
| `awesome-claude-skills/` | Claude Code 技能集合 | 参考和安装社区技能 |
| `awesome-claude-agents/` | Claude Code 代理集合 | 参考和安装社区代理 |
| `awesome-claude-code-subagents/` | 子代理集合 | 参考和安装子代理 |
| `awesome-claude-code-toolkit/` | 工具包集合 | 参考和安装工具 |
| `awesome-cli.json` | CLI 工具 JSON 列表 | 参考 CLI 工具 |
| `awesome-list.json` | 综合列表 | 参考各种资源 |
| `awesome-skills.json` | 技能 JSON 列表 | 参考技能 |
| `claude-skills.json` | Claude 技能列表 | 参考 Claude 技能 |
| `coding-agent.json` | 编程代理列表 | 参考编程代理 |
| `developer-tools.json` | 开发者工具列表 | 参考开发者工具 |
| `devops.json` | DevOps 工具列表 | 参考 DevOps 工具 |
| `javascript.json` | JavaScript 工具列表 | 参考 JS 工具 |
| `llm-agent.json` | LLM 代理列表 | 参考 LLM 代理 |
| `llm-api.json` | LLM API 列表 | 参考 LLM API |
| `nextjs.json` | Next.js 工具列表 | 参考 Next.js 工具 |
| `programming-agent.json` | 编程代理列表 | 参考编程代理 |
| `python.json` | Python 工具列表 | 参考 Python 工具 |
| `react.json` | React 工具列表 | 参考 React 工具 |
| `rust.json` | Rust 工具列表 | 参考 Rust 工具 |
| `typescript.json` | TypeScript 工具列表 | 参考 TS 工具 |

## 78.3 AI 代理框架

| 仓库 | 说明 |
|------|------|
| `langchain/` | LangChain 框架 |
| `langgraph/` | LangGraph 框架 |
| `autogen/` | Microsoft AutoGen |
| `crewAI/` | CrewAI 框架 |
| `semantic-kernel/` | Microsoft Semantic Kernel |
| `llama-agents/` | LlamaAgents 框架 |
| `smolagents/` | HuggingFace SmolAgents |
| `agno/` | Agno 框架 |
| `agentbench/` | Agent 评测框架 |
| `agentchain/` | AgentChain 框架 |
| `agent-dev/` | Agent 开发工具 |
| `agentic/` | Agentic 框架 |
| `agents-cli/` | Agent CLI 工具 |
| `agents-md/` | Agent Markdown 工具 |
| `agent-toolkit/` | Agent 工具包 |
| `agenttuning/` | Agent 调优工具 |
| `agentverse/` | AgentVerse 平台 |
| `Cline/` | Cline AI 编程助手 |
| `Continue/` | Continue IDE 扩展 |
| `Sourcegraph/` | Sourcegraph Cody |

## 78.4 编程代理

| 仓库 | 说明 |
|------|------|
| `aider/` | Aider AI 编程助手 |
| `gpt-engineer/` | GPT-Engineer |
| `gpt-pilot/` | GPT-Pilot |
| `gpt-researcher/` | GPT-Researcher |
| `claude-code-*/` | Claude Code 相关工具 |
| `codefuse/` | CodeFuse |
| `codecompanion-nvim/` | CodeCompanion Neovim 插件 |
| `copilot-emacs/` | Copilot Emacs 插件 |
| `avante-nvim/` | Avante Neovim 插件 |

## 78.5 MCP 相关

| 仓库 | 说明 |
|------|------|
| `BeehiveInnovations-pal-mcp-server/` | Pal MCP 服务器 |
| `mcp_excalidraw/` | Excalidraw MCP 服务器 |
| `czlonkowski-n8n-m8n/` | n8n MCP 服务器 |
| `ref-tools-mcp/` | 参考工具 MCP 服务器 |

## 78.6 教育材料

| 文件 | 说明 |
|------|------|
| `biology-notes-page1.json` | 生物笔记 |
| `chemistry-notes-page1.json` | 化学笔记 |
| `physics-notes-page1.json` | 物理笔记 |
| `math-notes-page1.json` | 数学笔记 |
| `english-gaokao-page1.json` | 英语高考 |
| `chinese-gaokao-*.json` | 语文高考 |
| `gaokao-*.json` | 高考资料 |
| `high-school-*.json` | 高中资料 |
| `高考-*.json` | 高考资料（中文） |

## 78.7 配置文件

| 文件 | 说明 |
|------|------|
| `api-key.json` | API 密钥配置 |
| `api-tokens/` | API 令牌目录 |
| `automation.json` | 自动化配置 |
| `free-api-key.json` | 免费 API 密钥 |
| `free-tokens.json` | 免费令牌 |
| `free-llm.json` | 免费 LLM 列表 |
| `free-llm-api-page1.json` | 免费 LLM API |

## 78.8 使用方式

```cmd
:: 查看技能列表
cat .github/awesome-skills.json

:: 搜索特定技能
cat .github/claude-skills.json | findstr "review"

:: 安装社区技能
/clone skill awesome-claude-skills

:: 参考代理定义
cat .github/coding-agent.json

:: 搜索免费 API
cat .github/free-api-key.json
```

---

# 第七十九部分：桌面端开发脚本详解

## 79.1 主进程脚本

| 脚本 | 功能 | 使用方法 |
|------|------|----------|
| `fix_api_client.js` | 修复 API 客户端 | `node fix_api_client.js` |
| `repair_apiClient.js` | 修复 API 客户端（另一版本） | `node repair_apiClient.js` |
| `rebuild_apiclient.py` | 重建 API 客户端（Python） | `python rebuild_apiclient.py` |
| `fix_apiclient.py` | 修复 API 客户端（Python） | `python fix_apiclient.py` |
| `fix_block.py` | 修复阻塞代码 | `python fix_block.py` |
| `fix_context.py` | 修复上下文 | `python fix_context.py` |
| `fix_index_imports.py` | 修复导入 | `python fix_index_imports.py` |
| `patch_aps.py` | 打补丁 | `python patch_aps.py` |
| `surgical_fix.py` | 精准修复 | `python surgical_fix.py` |
| `analyze_no_default.py` | 分析无默认值 | `python analyze_no_default.py` |
| `analyze_shims.py` | 分析 shim | `python analyze_shims.py` |
| `check_bytes.py` | 检查字节 | `python check_bytes.py` |
| `check_encoding2.py` | 检查编码 | `python check_encoding2.py` |
| `check_js_refs.py` | 检查 JS 引用 | `python check_js_refs.py` |
| `check_jsx.py` | 检查 JSX | `python check_jsx.py` |
| `check_jsx2.py` | 检查 JSX v2 | `python check_jsx2.py` |
| `check_line.py` | 检查行 | `python check_line.py` |
| `check_no_default.py` | 检查无默认值 | `python check_no_default.py` |
| `check_shims.py` | 检查 shim | `python check_shims.py` |
| `find_problems.py` | 查找问题 | `python find_problems.py` |
| `find_stale.py` | 查找过期代码 | `python find_stale.py` |
| `fix-tests.js` | 修复测试 | `node fix-tests.js` |
| `fix-vml-t7.js` | 修复 VML 测试 | `node fix-vml-t7.js` |
| `debug-t8.js` | 调试工具 | `node debug-t8.js` |
| `debug-tests.js` | 测试调试 | `node debug-tests.js` |
| `test-real-impl.js` | 真实实现测试 | `node test-real-impl.js` |
| `test-t3.js` | T3 测试 | `node test-t3.js` |
| `test-t3-debug.js` | T3 调试测试 | `node test-t3-debug.js` |
| `test_bundle_check.js` | 包检查测试 | `node test_bundle_check.js` |
| `test-parse.js` | 解析测试 | `node test-parse.js` |
| `diagnostic-flow.mjs` | 诊断流程 | `node diagnostic-flow.mjs` |
| `tmp_electron_path_test.mjs` | Electron 路径测试 | `node tmp_electron_path_test.mjs` |

## 79.2 脚本使用示例

```cmd
:: 修复 API 客户端
cd desktop/src/main
node fix_api_client.js

:: 查找代码问题
python find_problems.py

:: 检查 JSX
python check_jsx.py src/renderer/components/

:: 分析 shim
python analyze_shims.py

:: 调试测试
node debug-tests.js
```

---

# 第八十部分：自动化脚本详解

## 80.1 根目录脚本

| 脚本 | 功能 | 使用方法 |
|------|------|----------|
| `install.bat` | 安装脚本 | `install.bat` |
| `compile.bat` | 编译脚本 | `compile.bat` |
| `d.bat` | 快速启动 | `d.bat` |
| `d_min.bat` | 最小化启动 | `d_min.bat` |
| `commit.bat` | 提交脚本 | `commit.bat` |

## 80.2 scripts/ 目录脚本

### 构建脚本

| 脚本 | 功能 | 使用方法 |
|------|------|----------|
| `scripts/build.ts` | 构建脚本 | `bun run build` |
| `scripts/package.ts` | 打包脚本 | `bun run package` |
| `scripts/release.ts` | 发布脚本 | `bun run release` |
| `scripts/version.ts` | 版本管理 | `bun run version` |

### 配置生成脚本

| 脚本 | 功能 | 使用方法 |
|------|------|----------|
| `scripts/gen_auth_config.mjs` | 认证配置生成 | `node scripts/gen_auth_config.mjs` |
| `scripts/gen_doge_config.mjs` | Doge 配置生成 | `node scripts/gen_doge_config.mjs` |
| `scripts/gen_presets.cjs` | 预设配置生成 | `node scripts/gen_presets.cjs` |
| `scripts/gen_presets2.cjs` | 预设配置生成 v2 | `node scripts/gen_presets2.cjs` |

### 分析脚本

| 脚本 | 功能 | 使用方法 |
|------|------|----------|
| `scripts/analyze-logs.ts` | 日志分析 | `bun run scripts/analyze-logs.ts` |
| `scripts/check-coverage.ts` | 覆盖率检查 | `bun run scripts/check-coverage.ts` |
| `scripts/consolidate-globals.ts` | 全局声明合并 | `bun run scripts/consolidate-globals.ts` |
| `scripts/embed-status-line.ts` | 状态行嵌入 | `bun run scripts/embed-status-line.ts` |
| `scripts/inject-macro.ts` | 宏注入 | `bun run scripts/inject-macro.ts` |

### 修复脚本

| 脚本 | 功能 | 使用方法 |
|------|------|----------|
| `scripts/fix-types.ts` | 类型修复 | `bun run scripts/fix-types.ts` |
| `scripts/fix-app-declare.ts` | 应用声明修复 | `bun run scripts/fix-app-declare.ts` |
| `scripts/fix-final-types.ts` | 最终类型修复 | `bun run scripts/fix-final-types.ts` |
| `scripts/fix-global-declarations.ts` | 全局声明修复 | `bun run scripts/fix-global-declarations.ts` |
| `scripts/fix-orphan-code.ts` | 孤立代码修复 | `bun run scripts/fix-orphan-code.ts` |
| `scripts/fix-tsconfig.ts` | tsconfig 修复 | `bun run scripts/fix-tsconfig.ts` |
| `scripts/fix-usedb.ts` | useDb 修复 | `bun run scripts/fix-usedb.ts` |

### 桥接脚本

| 脚本 | 功能 | 使用方法 |
|------|------|----------|
| `scripts/bridge.ts` | 桥接通信 | `bun run scripts/bridge.ts` |
| `scripts/bridge-client.ts` | 桥接客户端 | `bun run scripts/bridge-client.ts` |
| `scripts/bridge-secure.ts` | 安全桥接 | `bun run scripts/bridge-secure.ts` |

### 模型脚本

| 脚本 | 功能 | 使用方法 |
|------|------|----------|
| `scripts/extract_models.mjs` | 模型提取 | `node scripts/extract_models.mjs` |
| `scripts/fix_providers.mjs` | 提供商修复 | `node scripts/fix_providers.mjs` |
| `scripts/list_providers.mjs` | 列出提供商 | `node scripts/list_providers.mjs` |

### 技能脚本

| 脚本 | 功能 | 使用方法 |
|------|------|----------|
| `scripts/clone_popular_skills.bat` | 克隆热门技能 | `scripts/clone_popular_skills.bat` |
| `scripts/clone_popular_skills.sh` | 克隆热门技能（Linux） | `bash scripts/clone_popular_skills.sh` |

### 其他脚本

| 脚本 | 功能 | 使用方法 |
|------|------|----------|
| `scripts/check_agents.mjs` | 代理检查 | `node scripts/check_agents.mjs` |
| `scripts/finalize.mjs` | 最终处理 | `node scripts/finalize.mjs` |
| `scripts/postbuild-tools.ts` | 构建后工具 | `bun run scripts/postbuild-tools.ts` |
| `scripts/sync-upstream.sh` | 上游同步 | `bash scripts/sync-upstream.sh` |
| `scripts/test-bridge-ws.mjs` | 桥接 WebSocket 测试 | `node scripts/test-bridge-ws.mjs` |

## 80.3 桌面端构建脚本

| 脚本 | 功能 | 使用方法 |
|------|------|----------|
| `desktop/scripts/dev.mjs` | 开发模式 | `node scripts/dev.mjs` |
| `desktop/scripts/build.mjs` | 构建 | `node scripts/build.mjs` |
| `desktop/scripts/build-vite.mjs` | Vite 构建 | `node scripts/build-vite.mjs` |
| `desktop/scripts/pack.mjs` | 打包 | `node scripts/pack.mjs` |
| `desktop/scripts/launch-electron.mjs` | 启动 Electron | `node scripts/launch-electron.mjs` |
| `desktop/scripts/run-app.mjs` | 运行应用 | `node scripts/run-app.mjs` |
| `desktop/scripts/run-debug.mjs` | 调试运行 | `node scripts/run-debug.mjs` |
| `desktop/scripts/run-pack.mjs` | 打包运行 | `node scripts/run-pack.mjs` |
| `desktop/scripts/generate-icons.mjs` | 生成图标 | `node scripts/generate-icons.mjs` |
| `desktop/scripts/check-asar.mjs` | 检查 ASAR | `node scripts/check-asar.mjs` |
| `desktop/scripts/check-files.mjs` | 检查文件 | `node scripts/check-files.mjs` |
| `desktop/scripts/check-pkg.mjs` | 检查包 | `node scripts/check-pkg.mjs` |
| `desktop/scripts/run-and-check.ps1` | 运行并检查 | `powershell -File scripts/run-and-check.ps1` |
