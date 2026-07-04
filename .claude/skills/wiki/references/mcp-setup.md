# MCP 设置

MCP 让 Claude 直接读写 Vault 笔记，无需复制粘贴。四种选项按从最简单到功能最丰富排列。

> [!tip] 推荐
> 如果你有 **Obsidian v1.12 或更新版本**，从**选项 D：Obsidian CLI** 开始。它不需要 MCP 服务器、插件或 TLS 变通方案。仅当你需要持久化 MCP 集成或使用较旧版本的 Obsidian 时，才使用选项 A 或 B。

---

## 步骤 1：安装 Local REST API 插件

你必须在 Obsidian 中执行此操作（Claude 无法以编程方式完成）：

1. Obsidian > 设置 > 第三方插件 > 关闭安全模式
2. 浏览 > 搜索 "Local REST API" > 安装 > 启用
3. 设置 > Local REST API > 复制 API 密钥

该插件在 `https://127.0.0.1:27124` 上运行，使用自签名证书。

测试：
```bash
curl -sk -H "Authorization: Bearer <你的密钥>" https://127.0.0.1:27124/
```

你应该会收到包含 Vault 信息的 JSON 响应。

---

## 选项 A：mcp-obsidian（基于 REST API）

使用 MarkusPfundstein 的 mcp-obsidian。需要 Local REST API 插件正在运行。

```bash
claude mcp add-json obsidian-vault '{
  "type": "stdio",
  "command": "uvx",
  "args": ["mcp-obsidian"],
  "env": {
    "OBSIDIAN_API_KEY": "<你的密钥>",
    "OBSIDIAN_HOST": "127.0.0.1",
    "OBSIDIAN_PORT": "27124",
    "NODE_TLS_REJECT_UNAUTHORIZED": "0"
  }
}' --scope user
```

> [!warning] 安全性
> `NODE_TLS_REJECT_UNAUTHORIZED: "0"` **在进程范围内禁用**了 MCP 服务器的 TLS 证书验证。这里需要这样做是因为 Local REST API 插件使用自签名证书。这仅接受用于 `127.0.0.1`（localhost）连接。切勿在任何非回环连接中使用此设置。如果你对全局 TLS 绕过感到不安，请优先选择**选项 D（Obsidian CLI）**或**选项 B（基于文件系统）**，它们完全避免了这个问题。

功能：读取笔记、写入笔记、搜索、修补前置元数据字段、在标题下追加内容。

---

## 选项 B：MCPVault（基于文件系统）

无需 Obsidian 插件。直接读取 Vault 目录。

```bash
claude mcp add-json obsidian-vault '{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@bitbonsai/mcpvault@latest", "/你的/vault/绝对路径"]
}' --scope user
```

将 `/你的/vault/绝对路径` 替换为实际的 Vault 路径。

可用工具：`search_notes`（BM25）、`read_note`、`create_note`、`update_note`、`get_frontmatter`、`update_frontmatter`、`list_all_tags`、`read_multiple_notes`。

---

## 选项 C：通过 curl 直接使用 REST API

无需 MCP。在整个会话中使用 bash 的 curl。所有命令参见 `rest-api.md`。

---

## 选项 D：Obsidian CLI（推荐用于 v1.12+）

Obsidian 在 v1.12（2026 年）中推出了原生 CLI。它直接向终端公开 Vault 操作。无需 REST API 插件、MCP 服务器、自签名证书或 TLS 变通方案。Claude 通过 Bash 工具调用它。

**检查是否可用：**
```bash
which obsidian-cli 2>/dev/null && obsidian-cli --version
# 或者在 flatpak 上：
flatpak run md.obsidian.Obsidian --cli --version
```

**常见操作：**
```bash
# 列出文件夹中的所有笔记
obsidian-cli list /路径/到/vault wiki/

# 读取笔记
obsidian-cli read /路径/到/vault wiki/index.md

# 创建或更新笔记
obsidian-cli write /路径/到/vault wiki/new-note.md < content.md

# 按内容搜索笔记
obsidian-cli search /路径/到/vault "查询词"
```

**为什么优先选择此选项：**
- 无需安装插件（CLI 内置于 Obsidian）
- 无需管理 MCP 服务器进程
- 无需 TLS 证书绕过
- 重启 Obsidian 后仍有效（无持久连接）
- 在桌面和无头环境中工作方式相同

**何时改用选项 A/B/C：** 如果需要持久化语义搜索、前置元数据修补，或使用 Obsidian < v1.12。

`kepano/obsidian-skills` 仓库包含一个 `obsidian-cli` 技能，将这些命令包装为可复用的模式。与此插件一同安装以获得一流的 CLI 支持。

---

## 使用 `--scope user`

两个 MCP 选项均使用 `--scope user`，以便 Vault 在所有 Claude Code 项目中可用，而不仅限于运行命令的那个项目。

---

## 验证

设置后：

```bash
claude mcp list               # 确认服务器出现
claude mcp get obsidian-vault # 确认路径或 URL 正确
```

在 Claude Code 会话中，输入 `/mcp` 检查连接状态。

然后测试："列出我的 wiki 文件夹中的所有笔记。"
