---
name: API 自动获取最新库/框架
description: "通过 Context7 API 自动获取最新库/框架文档供 Claude Code 使用。适用于需要最新文档或有关于 React、Next.js、Prisma 或其他流行库的问题时。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# context7-auto-research

## 概述
Automatically fetch latest library/framework documentation for Claude Code via Context7 API

## 使用场景
- When you need up-to-date documentation for libraries and frameworks
- When asking about React, Next.js, Prisma, or any other popular library

## 安装
```bash
npx skills add -g BenedictKing/context7-auto-research
```

## 分步指南
1. Install the skill using the command above
2. Configure API key (optional, see GitHub repo for details)
3. Use naturally in Claude Code conversations

## 示例
See [GitHub Repository](https://github.com/BenedictKing/context7-auto-research) for examples.

## 最佳实践
- Configure API keys via environment variables for higher rate limits
- Use the skill's auto-trigger feature for seamless 集成

## 故障排除
See the GitHub repository for troubleshooting guides.

## 相关技能
- tavily-web, exa-search, firecrawl-scraper, codex-review

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
