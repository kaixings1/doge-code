---
name: mcp-setup
description: 配置常用的 MCP 服务器以增强代理能力。
level: 2
---

# MCP 设置

配置 Model Context Protocol（MCP）服务器，用网页搜索、文件系统访问和 GitHub 集成等外部工具扩展 Claude Code 的能力。

## 总览

MCP 服务器提供可供 Claude Code 代理使用的额外工具。本技能帮助你用 `claude mcp add` 命令行接口配置常用的 MCP 服务器。

## 步骤 1：选择设置路径

使用 **AskUserQuestion**，**一次只问一个问题**且**每个问题不超过 3 个选项**。近期的 Claude Code 构建会把更大的选项载荷当作无效工具参数而拒绝，因此要让 MCP 选择流程分阶段进行。

### 步骤 1.1：首个菜单

**问题：** "你想要哪种 MCP 设置？"

**选项：**
1. **推荐起步配置** —— 最常见的 OMC MCP 增项的快速路径
2. **单个常用服务器** —— 从一个简短的后续菜单中挑一个内置服务器
3. **自定义服务器** —— 添加你自己的 stdio 或 HTTP MCP 服务器

### 步骤 1.2：如果用户选择"推荐起步配置"

提出一个后续的 **AskUserQuestion**：

**问题：** "我应该配置哪个推荐的 MCP 组合？"

**选项：**
1. **仅 Context7（推荐）** —— 零配置的文档/上下文服务器
2. **Context7 + Exa** —— 文档/上下文外加增强的网页搜索
3. **完整推荐组合** —— Context7、Exa、Filesystem 和 GitHub

把该选择映射为你将要配置的服务器清单。

### 步骤 1.3：如果用户选择"单个常用服务器"

再提一个后续的 **AskUserQuestion**：

**问题：** "我应该先配置哪个服务器？"

**选项：**
1. **Context7（推荐）** —— 来自常用库的文档与代码上下文
2. **Exa Web Search** —— 增强的网页搜索（取代内置 websearch）
3. **更多服务器选择** —— Filesystem、GitHub 或完整推荐组合

如果用户选择**更多服务器选择**，再提一个 **AskUserQuestion**：

**问题：** "你还想用哪个额外的 MCP 选项？"

**选项：**
1. **Filesystem（推荐）** —— 带额外能力的扩展文件系统访问
2. **GitHub** —— 面向 issue、PR 和仓库管理的 GitHub API 集成
3. **完整推荐组合** —— 一并配置 Context7、Exa、Filesystem 和 GitHub

### 步骤 1.4：如果用户选择"自定义服务器"

直接跳到下面的**自定义 MCP 服务器**章节。

## 步骤 2：收集所需信息

### 对于 Context7：
无需 API 密钥。可立即使用。

### 对于 Exa Web Search：
询问 API 密钥：
```
你有 Exa API 密钥吗？
- 在此获取：https://exa.ai
- 输入你的 API 密钥，或输入 'skip' 稍后再配置
```

### 对于 Filesystem：
询问允许访问的目录：
```
filesystem MCP 应该有权访问哪些目录？
默认：当前工作目录
输入以逗号分隔的路径，或按 Enter 使用默认值
```

### 对于 GitHub：
询问令牌：
```
你有 GitHub 个人访问令牌吗？
- 在此创建：https://github.com/settings/tokens
- 推荐 scope：repo、read:org
- 输入你的令牌，或输入 'skip' 稍后再配置
```

## 步骤 3：用 CLI 添加 MCP 服务器

用 `claude mcp add` 命令配置每个 MCP 服务器。CLI 会自动处理 settings.json 的更新与合并。

### Context7 配置：
```bash
claude mcp add context7 -- npx -y @upstash/context7-mcp
```

### Exa Web Search 配置：
```bash
claude mcp add -e EXA_API_KEY=<user-provided-key> exa -- npx -y exa-mcp-server
```

### Filesystem 配置：
```bash
claude mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem <allowed-directories>
```

### GitHub 配置：

**选项 1：Docker（本地）**
```bash
claude mcp add -e GITHUB_PERSONAL_ACCESS_TOKEN=<user-provided-token> github -- docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server
```

**选项 2：HTTP（远程）**
```bash
claude mcp add --transport http github https://api.githubcopilot.com/mcp/
```

> 注意：Docker 选项要求已安装 Docker。HTTP 选项更简单，但能力可能不同。

## 步骤 4：验证安装

配置之后，验证 MCP 服务器已正确设置：

```bash
# 列出已配置的 MCP 服务器
claude mcp list
```

这会显示所有已配置的 MCP 服务器及其状态。

## 步骤 5：显示完成消息

```
MCP 服务器配置完成！

已配置的服务器：
[列出已配置的服务器]

后续步骤：
1. 重启 Claude Code 使更改生效
2. 已配置的 MCP 工具将对所有代理可用
3. 运行 `claude mcp list` 验证配置

使用提示：
- Context7：询问库文档（例如 "我该如何使用 React hooks？"）
- Exa：用于网页搜索（例如 "搜索最新的 TypeScript 特性"）
- Filesystem：在工作目录之外进行扩展文件操作
- GitHub：与 GitHub 仓库、issue 和 PR 交互

故障排查：
- 如果 MCP 服务器没有出现，运行 `claude mcp list` 检查状态
- 确保已安装 Node.js 18+ 以支持基于 npx 的服务器
- 对于 GitHub Docker 选项，确保 Docker 已安装并正在运行
- 运行 /oh-my-claudecode:omc-doctor 诊断问题

管理 MCP 服务器：
- 添加更多服务器：/oh-my-claudecode:mcp-setup 或 `claude mcp add ...`
- 列出服务器：`claude mcp list`
- 移除服务器：`claude mcp remove <server-name>`
```

## 自定义 MCP 服务器

如果用户选择 "自定义服务器"：

询问：
1. 服务器名称（标识符）
2. 传输类型：`stdio`（默认）或 `http`
3. 对 stdio：命令与参数（例如 `npx my-mcp-server`）
4. 对 http：URL（例如 `https://example.com/mcp`）
5. 环境变量（可选，键=值对）
6. HTTP 头（可选，仅用于 http 传输）

然后构造并运行相应的 `claude mcp add` 命令：

**对于 stdio 服务器：**
```bash
# 不带环境变量
claude mcp add <server-name> -- <command> [args...]

# 带环境变量
claude mcp add -e KEY1=value1 -e KEY2=value2 <server-name> -- <command> [args...]
```

**对于 HTTP 服务器：**
```bash
# 基础 HTTP 服务器
claude mcp add --transport http <server-name> <url>

# 带请求头的 HTTP 服务器
claude mcp add --transport http --header "Authorization: Bearer <token>" <server-name> <url>
```

### 公司上下文约定

如果该自定义服务器旨在向 OMC 工作流提供组织专属的参考资料，优先采用一个名为 `get_company_context` 的工具，它通过 `{ context: string }` 返回 markdown。

本地注册示例：

```bash
claude mcp add company-context -- node examples/vendor-mcp-server/server.mjs
```

然后在 `.claude/omc.jsonc` 或 `~/.config/claude-omc/config.jsonc` 中把 OMC 指向该完整工具名：

```jsonc
{
  "companyContext": {
    "tool": "mcp__company-context__get_company_context",
    "onError": "warn"
  }
}
```

这始终是建议性的提示上下文，而非运行时的强制执行。

## 常见问题

### MCP 服务器未加载
- 确保已安装 Node.js 18+
- 检查 PATH 中是否有 npx
- 运行 `claude mcp list` 验证服务器状态
- 检查服务器日志中的错误

### API 密钥问题
- Exa：在 https://dashboard.exa.ai 验证密钥
- GitHub：确保令牌具有所需的 scope（repo、read:org）
- 如有需要，用正确的凭据重新运行 `claude mcp add`

### 代理仍在使用内置工具
- 配置之后重启 Claude Code
- 配置 exa 之后，内置 websearch 会被降级优先次序
- 运行 `claude mcp list` 确认服务器处于活动状态

### 移除或更新服务器
- 移除：`claude mcp remove <server-name>`
- 更新：先移除旧服务器，再用新配置重新添加
