---
name: 使用 AgentShield 扫描您的 Claude Code 配置（.clau
description: 使用 AgentShield 扫描您的 Claude Code 配置（.claude/ 目录）是否存在安全漏洞、配置错误和注入风险。检查项包括 CLAUDE.md、settings.json、MCP 服务器、钩子（Hooks）以及智能体（Agent）定义。
origin: ECC
---

# 安全扫描技能 (Security Scan Skill)

使用 [AgentShield](https://github.com/affaan-m/agentshield) 审计您的 Claude Code 配置安全问题。

## 何时激活

- 设置新的 Claude Code 项目时
- 修改 `.claude/settings.json`、`CLAUDE.md` 或 MCP 配置后
- 提交配置更改前
- 加入具有现有 Claude Code 配置的新仓库时
- 定期的安全卫生检查

## 扫描对象

| 文件 | 检查项 |