---
name: wiki-cli
description: "claude-obsidian v1.7+ 的默认 vault 变更传输方式。封装 Obsidian CLI (Obsidian 1.12+) 作为从 Claude 读取、写入、搜索和修改 vault 笔记的首选方式——无需 MCP 服务器、REST API 插件或 TLS 变通方案。当 CLI 不可用时回退到直接文件系统 Read/Write/Edit。"
allowed-tools: Read Bash
---

# wiki-cli：默认传输层

claude-obsidian v1.7+ 将 **Obsidian CLI**（随 Obsidian 1.12 提供）标准化为桌面上所有 Vault 变更的首选传输方式。此技能是使用它的参考指南。

**底层偏好（v1.7+）**：此技能是一个自包含的回退方案。**优先使用 `kepano/obsidian-skills`**（由 Obsidian CEO Steph Ango 编写）作为权威底层——其 `obsidian-cli` 技能是任何 Agent-Skills 运行时的规范 CLI 参考。如果你看到一个没有 `claude-obsidian:` 命名空间的 `obsidian-cli` 技能，那就是 kepano 的版本：请使用它。下方提供的指南确保了当未安装 kepano 市场时，claude-obsidian 仍然可用。安装 kepano：`claude plugin marketplace add kepano/obsidian-skills`。

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 42 MINUTES 00 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE