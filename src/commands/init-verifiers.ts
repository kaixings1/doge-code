import type { Command } from '../commands.js'

const command = {
  type: 'prompt',
  name: 'init-verifiers',
  description: '创建用于自动化验证代码变更的验证器技能',
  contentLength: 0, // 动态内容
  progressMessage: '正在分析你的项目并创建验证器技能',
  source: 'builtin',
  async getPromptForCommand() {
    return [
      {
        type: 'text',
        text: `使用 TodoWrite 工具跟踪这个多步骤任务的进度。

## 目标

创建一个或多个验证器技能，供 Verify 代理用于自动验证本项目或文件夹中的代码变更。如果项目有不同的验证需求（例如同时有 Web UI 和 API 端点），你可以创建多个验证器。

**不要为单位测试或类型检查创建验证器。** 这些已由标准的构建/测试工作流处理，不需要专门的验证器技能。请专注于功能验证：Web UI（Playwright）、CLI（Tmux）和 API（HTTP）验证器。

## 阶段 1：自动检测

分析项目以检测不同子目录中的内容。项目可能包含多个子项目或需要不同验证方式的区域（例如一个仓库中同时包含 Web 前端、API 后端和共享库）。

1. **扫描顶层目录** 以识别不同的项目区域：
   - 查找子目录中单独的 package.json、Cargo.toml、pyproject.toml、go.mod
   - 识别不同文件夹中的不同应用类型

2. **针对每个区域，检测：**

   a. **项目类型和技术栈**
      - 主要语言和框架
      - 包管理器（npm、yarn、pnpm、pip、cargo 等）

   b. **应用类型**
      - Web 应用（React、Next.js、Vue 等）→ 建议基于 Playwright 的验证器
      - CLI 工具 → 建议基于 Tmux 的验证器
      - API 服务（Express、FastAPI 等）→ 建议基于 HTTP 的验证器

   c. **已有的验证工具**
      - 测试框架（Jest、Vitest、pytest 等）
      - E2E 工具（Playwright、Cypress 等）
      - package.json 中的开发服务器脚本

   d. **开发服务器配置**
      - 如何启动开发服务器
      - 运行在哪个 URL
      - 就绪信号（服务器启动完成时显示的文本）

3. **已安装的验证包**（针对 Web 应用）
   - 检查是否安装了 Playwright（查看 package.json 的 dependencies/devDependencies）
   - 检查 MCP 配置（.mcp.json）中的浏览器自动化工具：
     - Playwright MCP 服务器
     - Chrome DevTools MCP 服务器
     - Claude Chrome 扩展 MCP（通过 Claude 的 Chrome 扩展进行浏览器操作）
   - 对于 Python 项目，检查 playwright、pytest-playwright

## 阶段 2：验证工具设置

根据阶段 1 的检测结果，帮助用户设置合适的验证工具。

### 对于 Web 应用

1. **如果已安装/配置浏览器自动化工具**，询问用户想使用哪一个：
   - 使用 AskUserQuestion 展示检测到的选项
   - 示例："我发现配置了 Playwright 和 Chrome DevTools MCP。你希望使用哪一个进行验证？"

2. **如果没有检测到任何浏览器自动化工具**，询问是否要安装/配置一个：
   - 使用 AskUserQuestion："未检测到浏览器自动化工具。是否要设置一个用于 UI 验证？"
   - 提供的选项：
     - **Playwright**（推荐）- 完整的浏览器自动化库，支持无头模式，适合 CI 环境
     - **Chrome DevTools MCP** - 通过 MCP 使用 Chrome DevTools 协议
     - **Claude Chrome 扩展** - 使用 Claude Chrome 扩展进行浏览器交互（需要在 Chrome 中安装该扩展）
     - **不安装** - 跳过浏览器自动化（仅使用基础的 HTTP 检查）

3. **如果用户选择安装 Playwright**，根据包管理器运行相应命令：
   - 对于 npm：\`npm install -D @playwright/test && npx playwright install\`
   - 对于 yarn：\`yarn add -D @playwright/test && yarn playwright install\`
   - 对于 pnpm：\`pnpm add -D @playwright/test && pnpm exec playwright install\`
   - 对于 bun：\`bun add -D @playwright/test && bun playwright install\`

4. **如果用户选择 Chrome DevTools MCP 或 Claude Chrome 扩展**：
   - 这些需要配置 MCP 服务器，而不是安装 npm 包
   - 询问是否要将 MCP 服务器配置添加到 .mcp.json
   - 对于 Claude Chrome 扩展，提醒用户需要从 Chrome 网上应用店安装该扩展

5. **MCP 服务器设置**（如果适用）：
   - 如果用户选择了基于 MCP 的选项，在 .mcp.json 中配置相应的条目
   - 更新验证器技能的 allowed-tools 以使用相应的 mcp__* 工具

### 对于 CLI 工具

1. 检查 asciinema 是否可用（运行 \`which asciinema\`）
2. 如果不可用，告知用户 asciinema 可以帮助录制验证会话，但这是可选的
3. Tmux 通常由系统安装，只需确认其可用性

### 对于 API 服务

1. 检查 HTTP 测试工具是否可用：
   - curl（通常系统已安装）
   - httpie（\`http\` 命令）
2. 通常无需安装

## 阶段 3：交互式问答

根据阶段 1 检测到的区域，你可能需要创建多个验证器。对于每个不同的区域，使用 AskUserQuestion 工具确认：

1. **验证器名称** - 根据检测结果建议一个名称，但允许用户选择：

   如果只有一个项目区域，使用简单格式：
   - 对于 Web UI 测试："verifier-playwright"
   - 对于 CLI/终端测试："verifier-cli"
   - 对于 HTTP API 测试："verifier-api"

   如果有多个项目区域，使用格式 \`verifier-<项目>-<类型>\`：
   - 对于前端 Web UI："verifier-frontend-playwright"
   - 对于后端 API："verifier-backend-api"
   - 对于管理后台："verifier-admin-playwright"

   \`<项目>\` 部分应该是子目录或项目区域的简短标识（例如文件夹名称或包名称）。

   允许自定义名称，但必须包含 "verifier" —— Verify 代理通过在文件夹名中查找 "verifier" 来发现技能。

2. **根据类型提出的项目特定问题**：

   对于 Web 应用（playwright）：
   - 开发服务器命令（例如 "npm run dev"）
   - 开发服务器 URL（例如 "http://localhost:3000"）
   - 就绪信号（服务器启动时出现的文本）

   对于 CLI 工具：
   - 入口命令（例如 "node ./cli.js" 或 "./target/debug/myapp"）
   - 是否使用 asciinema 录制

   对于 API：
   - API 服务器命令
   - 基础 URL

3. **认证与登录**（针对 Web 应用和 API）：

   使用 AskUserQuestion 询问："你的应用在访问需要验证的页面或端点前是否需要认证/登录？"
   - **无需认证** - 应用公开可访问，无需登录
   - **需要登录** - 应用在进行验证前需要认证
   - **部分页面需要认证** - 混合了公开路由和需认证路由

   如果用户选择需要登录（或部分需要），询问后续问题：
   - **登录方式**：用户如何登录？
     - 表单登录（在登录页输入用户名/密码）
     - API 令牌/密钥（作为请求头或查询参数传递）
     - OAuth/SSO（基于重定向的流程）
     - 其他（让用户描述）
   - **测试凭证**：验证器应使用什么凭证？
     - 询问登录 URL（例如 "/login"、"http://localhost:3000/auth"）
     - 询问测试用户名/邮箱和密码，或 API 密钥
     - 注意：建议用户使用环境变量存储敏感信息（例如 \`TEST_USER\`、\`TEST_PASSWORD\`），而不是硬编码
   - **登录成功指示**：如何确认登录成功？
     - URL 重定向（例如重定向到 "/dashboard"）
     - 元素出现（例如显示 "欢迎" 文本、用户头像）
     - Cookie/令牌被设置

## 阶段 4：生成验证器技能

**所有验证器技能都创建在项目根目录的 \`.claude/skills/\` 目录下。** 这确保了在项目中运行 Claude 时技能会自动加载。

将技能文件写入 \`.claude/skills/<验证器名称>/SKILL.md\`。

### 技能模板结构

\`\`\`markdown
---
name: <验证器名称>
description: <基于类型的描述>
allowed-tools:
  # 适用于该验证器类型的工具
---

# <验证器标题>

你是一个验证执行器。你会收到一个验证计划，并严格按照书面说明执行。

## 项目上下文
<来自检测步骤的项目特定详情>

## 设置说明
<如何启动所需的服务>

## 认证
<如果需要认证，此处包含逐步登录说明>
<包含登录 URL、凭证环境变量以及登录成功的验证方法>
<如果无需认证，则省略此部分>

## 报告

使用验证计划中指定的格式，为每个步骤报告通过或失败。

## 清理

验证完成后：
1. 停止已启动的任何开发服务器
2. 关闭任何浏览器会话
3. 报告最终摘要

## 自我更新

如果验证失败是由于本技能的指令已过时（例如开发服务器命令/端口/就绪信号已变更）—— 而不是因为被测功能本身损坏 —— 或者用户在运行过程中纠正了你，请使用 AskUserQuestion 确认，然后用最小化的针对性修复编辑本 SKILL.md 文件。
\`\`\`

### 按类型划分的 allowed-tools

**verifier-playwright**：
\`\`\`yaml
allowed-tools:
  - Bash(npm:*)
  - Bash(yarn:*)
  - Bash(pnpm:*)
  - Bash(bun:*)
  - mcp__playwright__*
  - Read
  - Glob
  - Grep
\`\`\`

**verifier-cli**：
\`\`\`yaml
allowed-tools:
  - Tmux
  - Bash(asciinema:*)
  - Read
  - Glob
  - Grep
\`\`\`

**verifier-api**：
\`\`\`yaml
allowed-tools:
  - Bash(curl:*)
  - Bash(http:*)
  - Bash(npm:*)
  - Bash(yarn:*)
  - Read
  - Glob
  - Grep
\`\`\`

## 阶段 5：确认创建

写入技能文件后，告知用户：
1. 每个技能创建的位置（始终在 \`.claude/skills/\` 中）
2. Verify 代理如何发现它们 —— 文件夹名称必须包含 "verifier"（不区分大小写）才能被自动发现
3. 他们可以编辑这些技能进行自定义
4. 他们可以再次运行 /init-verifiers 为其他区域添加更多验证器
5. 验证器在检测到自身指令已过时（错误的开发服务器命令、已变更的就绪信号等）时会主动提供自我更新的选项
`,
      },
    ]
  },
} satisfies Command

export default command