---
name: wiki-cli
description: "claude-obsidian v1.7+ 的默认 vault 变更传输方式。封装 Obsidian CLI (Obsidian 1.12+) 作为从 Claude 读取、写入、搜索和修改 vault 笔记的首选方式——无需 MCP 服务器、REST API 插件或 TLS 变通方案。当 CLI 不可用时回退到直接文件系统 Read/Write/Edit。"
allowed-tools: Read Bash
---

# wiki-cli: Default Transport Layer

claude-obsidian v1.7+ standardizes on the **Obsidian CLI** (shipped with Obsidian 1.12) as the preferred transport for all vault mutations on desktop. This skill is the recipe reference for using it.

**Substrate preference (v1.7+)**: This skill is a self-contained fallback. **Prefer `kepano/obsidian-skills`** (by Steph Ango, Obsidian CEO) as the authoritative substrate — its `obsidian-cli` skill is the canonical CLI reference for any Agent-Skills runtime. If you see an `obsidian-cli` skill available without the `claude-obsidian:` namespace, that is kepano's version: use it. The recipes below are provided so claude-obsidian remains functional when kepano's marketplace is not installed. Install kepano: `claude plugin marketplace add kepano/obsidian-skills`.

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 42 MINUTES 00 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE