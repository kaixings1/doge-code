---
name: Anthropic 官方技能集
description: Anthropic 官方发布的 Claude Agent Skills，涵盖创意设计、开发技术、企业通信和文档处理等领域的技能演示
risk: safe
source: anthropics-skills
--- # Anthropic 官方技能集 来自 [anthropics/skills](https://github.com/anthropics/skills) 官方仓库的技能集合。 ## 技能列表 ### 创意与设计
- **algorithmic-art** — 使用 p5.js 创建算法生成艺术，支持随机种子和交互式参数探索
- **canvas-design** — Canvas 画布设计与创作
- **frontend-design** — 前端 UI/UX 设计技能
- **brand-guidelines** — 品牌指南合规的内容创作 ### 开发与技术
- **mcp-builder** — MCP (Model Context Protocol) 服务端构建
- **claude-api** — Claude API 集成参考（Managed Agents API、Tools、Prompt Caching）
- **codebase-design** — 代码库架构设计
- **skill-creator** — 自定义技能创建工具（含脚本和模板） ### 企业通信
- **doc-coauthoring** — 文档协同编写与协作
- **internal-comms** — 内部通信与沟通模板 ### 文档处理（源可用）
- **docx** — Word 文档创建与编辑（Claude 文档能力底层实现）
- **pdf** — PDF 文档处理（含表单）
- **pptx** — PowerPoint 演示文稿创建与编辑
- **xlsx** — Excel 电子表格处理 ## 使用方法 这些技能演示了 Claude Skills 系统的各种模式和能力。可以直接在 Claude Code 中使用：
1. 每个技能目录包含 `SKILL.md` 指令文件和可选资源文件
2. 通过 `/plugin marketplace add anthropics/skills` 注册为插件市场
3. 或直接复制 `SKILL.md` 到 `.claude/skills/` 目录使用
