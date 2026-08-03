---
name: Vercel Skills CLI
description: Vercel Labs 的 Agent Skills CLI 工具（npx skills），支持安装、发现、管理 GitHub 上的 Agent Skills 包
risk: safe
source: vercel-labs-skills
--- # Vercel Skills CLI 来自 [vercel-labs/skills](https://github.com/vercel-labs/skills) 官方的 Agent Skills 管理工具。 ## 功能 - **skills add <package>** — 安装技能包（支持 GitHub repo 格式）
- **skills use <package>@<skill>** — 试用单个技能而不安装
- **skills list/ls** — 列出已安装技能
- **skills find [query]** — 交互式搜索技能
- **skills update [skills]** — 更新技能到最新版本
- **skills remove [skills]** — 卸载技能 ## find-skills 技能 内置的 `find-skills` 技能帮助用户发现和安装 Agent Skills。当用户询问"如何做 X"、"找一个能做 Y 的技能"时自动触发。 ## 使用方式 ```bash
# 安装 Anthropic 官方技能
npx skills add anthropics/skills # 安装特定用户的技能
npx skills add mattpocock/skills # 搜索技能
npx skills find --owner vercel-labs
``` ## 技术实现 - CLI 工具：TypeScript + Bun/Node.js
- 安装方式：从 GitHub 克隆仓库，读取 SKILL.md 元数据
- 兼容多种 AI 编码代理（Claude Code、Cline、Codex 等）
