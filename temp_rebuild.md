# Doge Code 完整使用说明

> 基于 Claude Code 深度定制的中文 AI 编程助手
> 版本：最新 | 更新日期：2026-08-04

---

# 目录

- [第一部分：系统概述](#第一部分系统概述)
- [第二部分：CLI 斜杠命令](#第二部分cli-斜杠命令)
- [第三部分：内置工具系统](#第三部分内置工具系统)
- [第四部分：技能系统](#第四部分技能系统)
- [第五部分：代理系统](#第五部分代理系统)
- [第六部分：权限与安全](#第六部分权限与安全)
- [第七部分：记忆系统](#第七部分记忆系统)
- [第八部分：工作流技能](#第八部分工作流技能)
- [第九部分：桌面端功能](#第九部分桌面端功能)
- [第十部分：常见使用场景](#第十部分常见使用场景)
- [第十一部分：环境变量与配置](#第十一部分环境变量与配置)
- [第十二部分：插件系统](#第十二部分插件系统)
- [第十三部分：Hooks 钩子系统](#第十三部分hooks-钩子系统)
- [第十四部分：远程与分布式](#第十四部分远程与分布式)
- [第十五部分：语音与 Vim 模式](#第十五部分语音与-vim-模式)
- [第十六部分：伙伴系统](#第十六部分伙伴系统)
- [第十七部分：守护进程与自托管](#第十七部分守护进程与自托管)
- [第十八部分：关键 Hooks 列表](#第十八部分关键-hooks-列表)
- [新功能标志系统](#新功能标志系统)
- [引擎核心系统](#引擎核心系统)
- [模型系统](#模型系统)
- [权限系统详解](#权限系统详解)
- [设置系统](#设置系统)
- [常量与消息系统](#常量与消息系统)
- [服务层](#服务层)
- [成本追踪系统](#成本追踪系统)
- [服务器与直接连接](#服务器与直接连接)
- [组件系统](#组件系统)
- [MCP 集成](#mcp-集成)
- [数据迁移](#数据迁移)
- [持久化规则系统](#持久化规则系统)
- [用量分析仪表盘](#用量分析仪表盘)
- [IDE 扩展](#ide-扩展)
- [代理开发指南](#代理开发指南)
- [未文档化工具](#未文档化工具)
- [后台服务](#后台服务)
- [完整命令注册参考](#完整命令注册参考)
- [专用代理完整列表](#专用代理完整列表)
- [软件开发全流程指南](#软件开发全流程指南)
- [智能体/子代理/工作流全方位整合](#智能体子代理工作流全方位整合)
- [综合实战案例](#综合实战案例)
- [性能优化指南](#性能优化指南)
- [备份与恢复](#备份与恢复)
- [多项目工作流](#多项目工作流)
- [CI/CD 集成](#cicd-集成)
- [API 参考](#api-参考)
- [迁移指南](#迁移指南)
- [隐私与数据处理](#隐私与数据处理)
- [故障排除](#故障排除)
- [最佳实践](#最佳实践)
- [术语表](#术语表)
- [常见问题](#常见问题)
- [贡献指南](#贡献指南)
- [安全政策](#安全政策)
- [许可证](#许可证)
- [索引](#索引)

---

# 第一部分：系统概述

## 1.1 什么是 Doge Code

Doge Code 是基于 Claude Code 深度定制的中文 AI 编程助手，具备以下核心能力：

- **多模型自由切换**：支持 Anthropic 兼容接口、OpenAI 兼容接口，可自由配置 BaseURL/API Key/模型
- **中文优化**：提示词全中文化，单 token 信息密度更高，显著节约 token 消耗
- **工具系统**：70+ 内置工具，覆盖文件操作、代码搜索、浏览器自动化、数据库操作等
- **技能系统**：可加载专业技能模块，扩展 AI 能力边界
- **代理系统**：支持多 Agent 协作，可启动子代理处理复杂任务
- **多会话管理**：类似 tmux 的多会话切换、恢复、命名
- **编译部署**：可编译为独立可执行文件，跨平台使用

## 1.2 核心架构

```
src/
├── entrypoints/       # CLI/开发模式入口
├── engine/            # AI 引擎（状态机+消息循环+工具调度）
├── tools/             # 70+ 内置工具
├── commands/          # 180+ CLI 命令
├── skills/            # 技能系统
├── plugins/           # 插件系统
├── api/               # 注册表/会话管理
├── state/             # 全局状态管理
├── bridge/            # 桌面/远程桥接
├── tasks/             # 任务系统
├── memory/            # 记忆系统
└── screens/           # 终端 UI
```

## 1.3 常用启动命令

```cmd
:: 开发模式（热重载）
bun run dev

:: 生产构建
bun run build

:: 编译为可执行文件
compile.bat

:: 启动程序
d.bat
```

## 1.4 运行环境

- Bun 1.3.5 或更高版本
- Node.js 24 或更高版本
- Windows 10/11、macOS、Linux

---

# 第二部分：CLI 斜杠命令

## 2.1 会话管理类

| 命令 | 功能 | 使用场景 | 预期结果 |
|------|------|----------|----------|
| `/clear` | 清空上下文 | 会话过长需要重新开始，或 AI 反复啰嗦时 | 对话历史清空，token 占用归零 |
| `/compact` | 压缩会话 | 上下文接近窗口上限时 | 将历史对话压缩为摘要，释放 token 空间 |
| `/context` | 查看上下文 | 想了解当前 token 用量时 | 显示当前会话的 token 占用详情 |
| `/rewind` | 回滚上下文 | AI 修改错误需要回退时 | 回滚到指定轮次，可多次执行 |
| `/resume` | 恢复会话 | 从历史会话继续工作时 | 列出历史会话，选择后恢复 |
| `/rename` | 命名会话 | 给当前会话添加可读名称 | 会话名称更新，方便后续查找 |
| `/sessions` | 多会话管理 | 需要切换/新建/删除会话时 | 进入会话管理器界面 |
| `/exit` | 退出程序 | 完成工作要退出时 | 程序正常退出 |

## 2.2 模型与认证类

| 命令 | 功能 | 使用场景 |
|------|------|----------|
| `/login` | 登录/切换接口 | 更换 BaseURL/API Key/模型时 |
| `/logout` | 退出登录 | 需要清除认证信息时 |
| `/model` | 切换模型 | 当前任务需要不同能力模型时 |
| `/add-model` | 添加模型 | 增加新的模型配置时 |
| `/remove-model` | 删除模型 | 移除不再需要的模型时 |

## 2.3 代码与开发类

| 命令 | 功能 | 使用场景 |
|------|------|----------|
| `/init` | 审视项目 | 新项目或项目结构变更后 |
| `/review` | 代码审查 | 提交前检查代码质量 |
| `/commit` | 提交代码 | 完成代码修改后 |
| `/commit-push-pr` | 提交+推送+PR | 完成功能开发后 |
| `/diff` | 差异查看 | 查看代码变更 |
| `/diff-mode` | 并排差异视图 | 需要直观的 diff 对比 |
| `/code-search` | 代码搜索 | 在代码库中搜索内容 |
| `/vector-search` | 向量搜索 | 语义级代码检索 |
| `/repo-map` | 代码库映射 | 了解项目结构时 |
| `/test-gen` | 测试生成 | 为代码添加测试时 |
| `/refactor` | 代码重构 | 优化代码结构时 |
| `/format` | 代码格式化 | 统一代码风格 |
| `/block-mode` | 块状输出 | 需要结构化工具输出时 |

## 2.4 安全类

| 命令 | 功能 | 使用场景 |
|------|------|----------|
| `/security-audit` | 安全扫描 | 检测代码安全漏洞 |
| `/audit` | 安全扫描（别名） | 快捷安全扫描 |
| `/sast` | 静态分析（别名） | SAST 扫描 |
| `/security-review` | 安全审查 | AI 辅助安全代码审查 |
| `/permissions` | 权限管理 | 管理工具的权限设置 |

## 2.5 代理与技能类

| 命令 | 功能 | 使用场景 |
|------|------|----------|
| `/agents` | 代理管理 | 管理多代理系统 |
| `/agent-new` | 新建代理 | 创建新的专用代理时 |
| `/skills` | 技能管理 | 管理已安装技能 |
| `/updateskills` | 更新技能 | 更新已安装技能 |
| `/plugins` | 插件列表 | 查看所有插件 |
| `/plugin` | 插件管理 | 管理单个插件 |

## 2.6 Git 工作流类

| 命令 | 功能 |
|------|------|
| `/branch` | 分支管理 |
| `/stash` | 暂存更改 |
| `/auto-commit` | 自动提交 |
| `/autofix-pr` | 自动修复 PR |
| `/pr-review` | PR 审查 |
| `/pr_comments` | PR 评论 |

## 2.7 调试与诊断类

| 命令 | 功能 |
|------|------|
| `/diagnose` | 系统诊断 |
| `/doctor` | 医生诊断（别名） |
| `/debug-tool-call` | 调试工具调用 |
| `/logs` | 查看日志 |
| `/errors` | 错误列表 |
| `/heapdump` | 堆转储 |
| `/monitor` | 系统监控 |

## 2.8 浏览器与自动化类

| 命令 | 功能 |
|------|------|
| `/browser` | 浏览器自动化 |
| `/chrome` | Chrome 控制 |
| `/mobile` | 移动端调试 |

## 2.9 数据与存储类

| 命令 | 功能 |
|------|------|
| `/database` | 数据库操作 |
| `/redis` | Redis 操作 |
| `/notebook` | Notebook 编辑 |
| `/rag` | RAG 管理 |

## 2.10 计划与任务类

| 命令 | 功能 |
|------|------|
| `/plan` | 计划模式 |
| `/task` | 任务管理 |
| `/todo` | 待办管理 |
| `/schedule` | 计划任务 |
| `/focus` | 专注模式 |

## 2.11 配置与设置类

| 命令 | 功能 |
|------|------|
| `/config` | 配置管理 |
| `/env` | 环境变量 |
| `/theme` | 主题设置 |
| `/keybindings` | 快捷键 |
| `/mcp` | MCP 管理 |
| `/hooks` | Hook 管理 |

## 2.12 监控与统计类

| 命令 | 功能 |
|------|------|
| `/cost` | 计费查看 |
| `/cost-history` | 费用历史 |
| `/usage` | 使用统计 |
| `/stats` | 统计数据 |
| `/metrics` | 指标查看 |

---

# 第三部分：内置工具系统

## 3.1 文件操作工具

### FileReadTool（读取文件）
- **功能**：读取本地文件内容
- **参数**：`file_path`（文件绝对路径）、`offset`（起始行号）、`limit`（读取行数）
- **预期结果**：返回文件内容，带行号（cat -n 格式）
- **注意事项**：读取 PDF 需指定 `pages` 参数；图片文件会以视觉形式呈现

### FileWriteTool（写入文件）
- **功能**：创建新文件或覆盖已有文件
- **参数**：`file_path`（文件路径）、`content`（写入内容）
- **预期结果**：文件被创建/覆盖，返回成功确认
- **注意事项**：覆盖已有文件前会先尝试读取；不要用于文档文件（*.md）除非用户明确要求

### FileEditTool（编辑文件）
- **功能**：精确替换文件中的文本
- **参数**：`file_path`（文件路径）、`old_string`（要替换的精确文本）、`new_string`（新文本）
- **预期结果**：文件中指定文本被替换
- **注意事项**：`old_string` 必须能唯一匹配，建议包含至少 3 行上下文

### MultiFileEditTool（多文件编辑）
- **功能**：一次编辑多个文件
- **参数**：`operations`（编辑操作数组，最多 20 个）
- **预期结果**：所有文件中指定文本被替换

### GlobTool（文件搜索）
- **功能**：按文件名模式搜索文件
- **参数**：`pattern`（glob 模式，如 `**/*.ts`）、`path`（搜索目录）
- **预期结果**：返回匹配的文件路径列表，按修改时间排序

### GrepTool（内容搜索）
- **功能**：按正则表达式搜索文件内容
- **参数**：`pattern`（正则表达式）、`path`（搜索路径）、`glob`（文件筛选）、`output_mode`（输出模式）
- **预期结果**：返回匹配行（content 模式）或文件路径（files_with_matches 模式）
- **输出模式**：`content`（匹配行）、`files_with_matches`（文件路径）、`count`（匹配计数）

## 3.2 系统操作工具

### BashTool（执行命令）
- **功能**：执行系统 shell 命令
- **参数**：`command`（命令字符串）、`timeout`（超时毫秒）、`description`（功能描述）
- **预期结果**：返回命令的标准输出
- **注意事项**：Windows 环境使用 cmd 格式命令（dir、type 等）；避免运行 grep/cat 等（有专用工具替代）

### PowerShellTool（PowerShell）
- **功能**：执行 PowerShell 命令
- **参数**：`command`（PowerShell 命令）、`timeout`（超时毫秒）
- **预期结果**：返回 PowerShell 命令输出

### ShellTool（Shell 命令）
- **功能**：执行 Shell 命令（跨平台）
- **参数**：`command`（命令字符串）、`cwd`（工作目录）
- **预期结果**：返回命令输出

## 3.3 网络工具

### WebFetchTool（网页获取）
- **功能**：获取网页内容并转换
- **参数**：`url`（URL 地址）、`prompt`（处理提示词）
- **预期结果**：返回 AI 处理后的网页内容摘要
- **注意事项**：需要登录的 URL 可能无法访问；有 15 分钟缓存

### WebSearchTool（网页搜索）
- **功能**：执行网络搜索
- **参数**：`query`（搜索关键词）
- **预期结果**：返回搜索结果摘要

### HttpTool（HTTP 请求）
- **功能**：发送 HTTP 请求
- **参数**：`method`（HTTP 方法）、`url`（请求 URL）、`headers`（请求头）、`body`（请求体）
- **预期结果**：返回 HTTP 响应

## 3.4 代理工具

### AgentTool（代理工具）
- **功能**：启动子代理处理复杂任务
- **参数**：`description`（任务描述）、`prompt`（任务提示词）、`subagent_type`（代理类型）
- **预期结果**：子代理独立执行任务并返回结果
- **代理类型**：general-purpose（通用）、plan（规划）、explore（探索）等 400+ 类型

### SkillTool（技能工具）
- **功能**：执行已安装的技能
- **参数**：`skill`（技能名称）、`args`（技能参数）
- **预期结果**：执行技能并返回结果

## 3.5 数据库工具

### DatabaseTool（数据库操作）
- **功能**：操作 SQLite 数据库
- **参数**：`operation`（操作类型）、`sql`（SQL 语句）、`values`（参数值）
- **操作类型**：`query`（查询）、`insert`（插入）、`update`（更新）、`delete`（删除）、`migrate`（迁移）
- **预期结果**：返回数据库操作结果

---

# 第四部分：技能系统

## 4.1 技能类型

| 类型 | 位置 | 说明 |
|------|------|------|
| 内置技能 | `src/skills/bundled/` | 系统自带，开箱即用 |
| 项目技能 | `.claudeskills/` | 项目级自动加载 |
| 全局技能 | `~/.doge/skills/` | 全局自动加载 |
| MCP 技能 | 通过 MCP 服务器 | 需配置 MCP |
| 社区技能 | 从开源仓库克隆 | `clone_popular_skills.bat` |

## 4.2 内置技能

### Git 与版本控制
- `git:commit` — 智能提交代码
- `git:pr-create` — 创建 Pull Request
- `git:pr-review` — 审查 Pull Request
- `git:changelog` — 生成 Changelog
- `git:release` — 发布管理
- `git:worktree` — 工作树管理
- `git:fix-issue` — 根据 Issue 描述自动修复

### 架构与设计
- `architecture:plan` — 架构规划
- `architecture:refactor` — 架构重构
- `architecture:design-review` — 设计审查
- `architecture:diagram` — 架构图生成
- `architecture:adr` — 架构决策记录

### 代码审查与安全
- `workflow-imports:code-review` — 代码审查
- `workflow-imports:security-review` — 安全审查
- `security:audit` — 安全审计
- `security:dependency-audit` — 依赖审计
- `security:secrets-scan` — 密钥扫描

### 测试
- `testing:tdd` — 测试驱动开发
- `testing:integration-test` — 集成测试
- `testing:e2e` — 端到端测试
- `testing:test-coverage` — 测试覆盖率

### DevOps 与部署
- `devops:deploy` — 部署管理
- `devops:ci-pipeline` — CI/CD 流水线
- `devops:dockerfile` — Dockerfile 生成
- `devops:k8s-manifest` — K8s 配置

### 文档
- `documentation:api-docs` — API 文档
- `documentation:doc-gen` — 文档生成
- `documentation:onboard` — 入职文档

### 工作流
- `workflow:orchestrate` — 工作流编排
- `workflow:checkpoint` — 检查点
- `workflow:wrap-up` — 收尾工作

## 4.3 技能管理命令

```cmd
/skills              ← 列出所有已安装技能
/updateskills        ← 更新已安装技能
/plugin              ← 管理插件
/skill <name> <args> ← 执行指定技能
```

---

# 第五部分：代理系统

## 5.1 代理类型概览

| 类别 | 代理类型 | 说明 |
|------|----------|------|
| 通用 | general-purpose | 通用型代理，搜索/研究/多步骤任务 |
| 规划 | plan / planner / 规划师 | 任务规划和方案设计 |
| 探索 | explore / code-explorer | 代码库探索和理解 |
| 代码审查 | code-reviewer / critic / 审查员 | 代码质量审查 |
| 重构 | refactor-cleaner / legacy-modernizer | 代码重构和现代化 |
| 测试 | test-engineer / qa-lead | 测试设计和执行 |
| 文档 | api-documentation / document-specialist | 文档编写 |
| 安全 | security-engineer / penetration-tester | 安全审计和渗透测试 |
| 数据 | data-analyst / data-scientist | 数据分析和建模 |
| 调试 | debug-expert / build-error-resolver | 调试和错误修复 |
| 部署 | deploy-engineer / devops-engineer | 部署和基础设施 |
| 研究 | researcher / technology-scout | 技术调研 |
| 前端 | frontend-engineer / ui-designer | 前端开发 |
| 后端 | backend-engineer / api-architect | 后端开发 |

## 5.2 子代理使用方式

```
:: 方式一：通过提示词启动
"使用 general-purpose 代理帮我调研 React Server Components 的最佳实践"

:: 方式二：通过 Agent 工具启动
Agent({
  description: "研究任务",
  prompt: "调研 XXX 最佳实践",
  subagent_type: "general-purpose"
})

:: 方式三：通过命令启动
/cs:fullstack-review
/cs:frontend-review
/cs:backend-review
```

## 5.3 子代理管理器

```typescript
const manager = getSubAgentManager()
manager.canSpawn(depth)           // 检查是否可以启动新子代理
await manager.spawn(async () => { /* 任务逻辑 */ })
manager.getStats()                // 获取统计信息
```

---

# 第六部分：权限与安全

## 6.1 权限级别

| 级别 | 说明 | 行为 |
|------|------|------|
| 自动允许 | 低风险操作（读取文件等） | 自动执行，无需确认 |
| 需要确认 | 中等风险（编辑文件、执行命令） | 显示操作详情，需要用户确认 |
| 手动审批 | 高风险（删除文件、push 代码） | 必须用户明确批准 |
| 禁止 | 极高风险（force push、删除分支） | 系统拒绝执行 |

## 6.2 安全工具

- `CredentialManager`（src/security/CredentialManager.ts）— 密钥管理
- `SandboxExecutor`（src/utils/sandbox/）— 沙箱执行
- `PermissionManager` — 权限检查接口
- `/security-audit` — 代码安全扫描

## 6.3 安全实践

1. **首次提交到 GitHub 时**，务必将 `.doge/` 目录排除在 `.gitignore` 外
2. **敏感文件**（.env、credentials.json 等）不会被提交，除非明确要求
3. **破坏性操作**（force push、reset --hard 等）需要明确用户授权
4. **工具执行**在沙箱中隔离，防止意外影响系统

---

# 第七部分：记忆系统

## 7.1 记忆类型

| 类型 | 文件 | 说明 |
|------|------|------|
| 用户记忆 | `user_*.md` | 用户角色、偏好、知识水平 |
| 反馈记忆 | `feedback_*.md` | 用户指导（避免什么、继续什么） |
| 项目记忆 | `project_*.md` | 项目背景、决策、事件 |
| 参考记忆 | `reference_*.md` | 外部系统资源指针 |
| 索引 | `MEMORY.md` | 记忆索引文件 |

## 7.2 记忆存储位置

```
C:\Users\Administrator\.doge\projects\d--doge-code\memory\
```

## 7.3 记忆操作

| 操作 | 说明 |
|------|------|
| `/memory` | 记忆管理 |
| `/memory-search` | 记忆搜索 |
| `/memory-monitor` | 记忆监控 |
| `/memory-bank` | 记忆库管理 |

---

# 第八部分：工作流技能

## 8.1 TDD 测试驱动开发

```
:: 步骤 1：红（写失败测试）
AI 调用 FileWriteTool: 创建测试文件
AI 调用 BashTool: 运行测试（失败）

:: 步骤 2：绿（写代码通过测试）
AI 调用 FileWriteTool: 实现功能
AI 调用 BashTool: 运行测试（通过）

:: 步骤 3：重构（优化代码结构）
AI 调用 FileEditTool: 优化代码
AI 调用 BashTool: 运行测试（仍然通过）
```

## 8.2 Git 工作流

```
> /commit-push-pr

:: AI 执行：
:: 1. git diff 分析变更
:: 2. 生成 commit message
:: 3. git commit
:: 4. git push
:: 5. 创建 PR
```

---

# 第九部分：桌面端功能

## 9.1 智能上下文工作流

| 模式 | 触发条件 | 自动调整 |
|------|----------|----------|
| 编码模式 | 选择 .ts/.py 等代码文件 | 打开 MonacoEditor + ToolPanel |
| 调试模式 | 检测到 Error:/Traceback: | 右侧切换 Debugger + Terminal |
| 审查模式 | 检测到 Git 代码变更 | 右侧切换 GitDiff + ReviewPanel |
| 项目管理 | 检测到 TODO/任务描述 | 右侧切换 Kanban + TimeTracker |

## 9.2 预测性 AI 助手

- **待办标记检测**：TODO/FIXME/HACK/XXX/OPTIMIZE
- **长函数检测**：超过 80 行的函数
- **重复代码检测**：建议提取公共函数
- **复杂嵌套检测**：超过 4 层的嵌套
- **废弃 API 检测**：componentWillMount 等

---

# 第十部分：常见使用场景

## 场景 1：新项目开发

```
1. /scaffold          ← 创建项目脚手架
2. 描述项目需求        ← AI 生成项目结构
3. /init              ← 更新 CLAUDE.md，让 AI 了解项目
4. 分阶段描述功能需求   ← AI 逐步实现
5. /test-gen          ← 生成测试
6. /review            ← 代码审查
7. /commit-push-pr    ← 提交并创建 PR
```

## 场景 2：Bug 修复

```
1. 描述 bug 现象       ← AI 分析问题
2. /debug-tool-call    ← 查看工具调用详情（如需要）
3. AI 定位问题并修复   ← 自动执行
4. /test-run           ← 验证修复
5. /review             ← 审查修复
```

## 场景 3：代码重构

```
1. /plan              ← 进入计划模式，制定重构方案
2. AI 分析代码结构    ← 识别重构点
3. /refactor          ← 执行重构
4. /test-run           ← 验证重构不影响功能
5. /security-audit     ← 安全检查
```

---

# 第十一部分：环境变量与配置

## 11.1 核心环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `CLAUDE_CONFIG_DIR` | 配置目录 | `~/.doge` |
| `LOG_LEVEL` | 日志级别 | `info` |
| `NODE_ENV` | 运行环境 | `production` |
| `ANTHROPIC_API_KEY` | Anthropic API Key | — |
| `ANTHROPIC_BASE_URL` | Anthropic Base URL | — |
| `ANTHROPIC_MODEL` | 默认模型 | — |
| `OPENAI_API_KEY` | OpenAI API Key | — |
| `OPENAI_BASE_URL` | OpenAI Base URL | — |

## 11.2 功能标志环境变量

| 变量名 | 说明 | 启用方式 |
|--------|------|----------|
| `CLAUDE_CODE_FEATURE_PROACTIVE` | 主动建议 | `=1` |
| `CLAUDE_CODE_FEATURE_KAIROS` | KAIROS 功能 | `=1` |
| `CLAUDE_CODE_FEATURE_BRIDGE_MODE` | 桥接模式 | `=1` |
| `CLAUDE_CODE_FEATURE_VOICE_MODE` | 语音模式 | `=1` |
| `CLAUDE_CODE_FEATURE_ULTRAPLAN` | 超级计划 | `=1` |

## 11.3 配置文件层级

```
~/.doge/
├── .claude.json          ← 全局配置
├── projects/
│   └── <project-hash>/
│       ├── memory/       ← 记忆系统
│       └── sessions/     ← 会话历史
└── skills/               ← 全局技能

<项目根目录>/
├── .doge/                ← 项目级配置
├── .dogerules            ← 项目持久化规则
├── .claudeskills/        ← 项目技能
└── CLAUDE.md             ← 项目上下文
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

| 插件 | 功能 |
|------|------|
| 自动属性 | 自动为工具调用添加属性 |
| 增长追踪 | GrowthBook 功能标记追踪 |
| 第三方追踪 | 第三方分析追踪 |
| 开发工具 | 开发者工具集成 |

---

# 第十三部分：Hooks 钩子系统

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

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "echo 'Tool executed' >> ~/.doge/tool-log.txt"
        }]
      }
    ],
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "powershell -c (New-Object.Media.SoundPlayer 'C:\\notify.wav').PlaySync()"
        }]
      }
    ]
  }
}
```

---

# 第十四部分：远程与分布式

## 14.1 远程会话

| 组件 | 功能 |
|------|------|
| 远程会话管理器 | 管理远程会话生命周期 |
| WebSocket 桥接 | WebSocket 实时通信 |
| 权限桥接 | 远程权限验证 |

## 14.2 SSH 会话

| 组件 | 功能 |
|------|------|
| SSH 会话管理器 | 管理 SSH 连接 |
| SSH 创建 | 创建新的 SSH 会话 |

---

# 第十五部分：语音与 Vim 模式

## 15.1 语音功能

| 组件 | 功能 |
|------|------|
| 语音模式 | 语音输入/输出 |
| 语音服务 | 语音处理服务 |
| 流式 STT | 实时语音转文字 |
| 语音关键词 | 语音关键词检测 |

## 15.2 Vim 模式

| 组件 | 功能 |
|------|------|
| 动作 | Vim 光标动作 |
| 操作符 | Vim 操作符（d/c/y 等） |
| 文本对象 | Vim 文本对象（w/s/p 等） |
| 状态转换 | 模式切换逻辑 |

---

# 第十六部分：伙伴系统

| 组件 | 功能 |
|------|------|
| 伙伴核心 | 伙伴核心逻辑 |
| 伙伴 React | 伙伴 React 组件 |
| 伙伴卡片 | 伙伴信息卡片 |
| 伙伴精灵 | 伙伴动画精灵 |
| 伙伴提示 | 伙伴提示词 |
| 精灵动画 | 精灵动画帧 |
| 通知 Hook | 伙伴通知 |

---

# 第十七部分：守护进程与自托管

## 17.1 守护进程（Daemon）

| 组件 | 功能 |
|------|------|
| 守护进程主程序 | 后台服务主循环 |
| 工作器注册 | 后台任务工作器管理 |

## 17.2 自托管运行器

| 组件 | 功能 |
|------|------|
| 运行器主程序 | CI/CD 自托管运行器 |

---

# 第十八部分：关键 Hooks 列表

## 18.1 输入与交互

| Hook | 功能 |
|------|------|
| `useTextInput` | 文本输入处理 |
| `useInputBuffer` | 输入缓冲 |
| `useArrowKeyHistory` | 方向键历史 |
| `usePasteHandler` | 粘贴处理 |
| `useVimInput` | Vim 输入模式 |

## 18.2 会话与状态

| Hook | 功能 |
|------|------|
| `useSessionBackgrounding` | 会话后台化 |
| `useRemoteSession` | 远程会话 |
| `useSSHSession` | SSH 会话 |
| `useIDEIntegration` | IDE 集成 |

## 18.3 工具与权限

| Hook | 功能 |
|------|------|
| `useCanUseTool` | 工具权限检查 |
| `useCancelRequest` | 取消请求 |
| `useCommandQueue` | 命令队列 |

## 18.4 通知与提醒

| Hook | 功能 |
|------|------|
| `useNotifyAfterTimeout` | 超时提醒 |
| `useAwaySummary` | 离开摘要 |
| `useUpdateNotification` | 更新通知 |

---

# 附录 A：快捷键

| 快捷键 | 功能 |
|--------|------|
| Shift+Tab（两次） | 进入/退出计划模式 |
| ESC（两次） | 回滚上下文 |
| Ctrl+C | 中断当前操作 |
| Ctrl+D | 退出程序 |
| Tab | 自动补全 |

---

# 附录 B：配置文件

| 文件 | 说明 |
|------|------|
| `~/.doge/.claude.json` | 全局配置文件 |
| `.doge/` 目录 | 项目级配置 |
| `CLAUDE.md` | 项目上下文文件 |
| `biome.json` | 代码检查配置 |
| `tsconfig.json` | TypeScript 配置 |
| `package.json` | 包配置 |

---

# 附录 C：故障排除

| 问题 | 解决方案 |
|------|----------|
| AI 反复啰嗦不执行 | `/clear` 重新会话 |
| 上下文过长 | `/compact` 压缩 |
| 修改错误需要回退 | `/rewind` 或两次 ESC |
| 模型响应慢 | `/fast` 切换快速模式 |
| 环境/配置问题 | `/diagnose` 诊断 |
| 编译失败 | 使用 debug-expert 代理 |
| Token 消耗过快 | 使用中文提示词，`/compact` 压缩 |

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

---

# 附录 E：术语表

| 术语 | 说明 |
|------|------|
| Agent | 专用子代理，可独立执行特定任务 |
| Compact | 上下文压缩，将历史对话压缩为摘要 |
| CRDT | 无冲突复制数据类型，用于桌面端文档协作 |
| Dogerules | 持久化规则文件，跨会话生效的指令 |
| Feature Flag | 功能标志，通过环境变量控制功能的启用/禁用 |
| Hook | 钩子，在特定事件发生时自动执行的 shell 命令 |
| MCP | Model Context Protocol，连接外部工具和数据的标准协议 |
| RAG | 检索增强生成 |
| Repo Map | 代码库映射，生成目录结构+符号分组摘要 |
| Rewind | 上下文回滚，恢复到指定轮次的对话状态 |
| Sandbox | 沙箱隔离，在受限环境中执行危险操作 |
| Skill | 可加载的专业技能模块，扩展 AI 能力 |
| Subagent | 子代理，由主代理启动的独立 AI 进程 |
| Token | AI 模型处理文本的最小单位 |

---

# 附录 F：常见问题

**Q: 支持哪些模型？**
- Anthropic Claude 系列（3.5/4/4.5/Opus 4/4.1/4.5/4.6）
- OpenAI 兼容接口（GPT-4o、DeepSeek、Qwen 等）
- 本地模型（Ollama、vLLM 等）

**Q: 如何切换模型？**
```
/model                    ← 交互式切换
/model claude-sonnet-4-6  ← 直接指定
```

**Q: 如何减少 token 消耗？**
- 使用中文提示词（单 token 信息密度更高）
- 复杂任务分阶段完成，每阶段 `/clear`
- 使用 `/compact` 压缩上下文
- 简单任务用轻量模型，复杂任务用强力模型

---

> **文档版本**：v3.0（重建版）
> **最后更新**：2026-08-04
> **总行数**：约 800 行
> **覆盖范围**：核心功能、实战示例、故障排除
