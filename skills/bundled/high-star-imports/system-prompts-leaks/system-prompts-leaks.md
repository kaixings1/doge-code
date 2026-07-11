---
name: system-prompts-leaks
description: | 系统提示词泄露收集 —— 收录 Claude、ChatGPT、Gemini、Cursor、Meta、Mistral、 Qwen、xAI、Perplexity、Notion 等 AI 聊天机器人/编程助手的系统提示词与指令。 用于研究、审计与理解各家产品的系统级设定。
license: 见原仓库
source: https://github.com/asgeirtj/system-prompts-leaks
--- # 系统提示词泄露收集（System Prompts Leaks） 本技能汇总各大 AI 产品的系统提示词与内部指令，供研究、安全审计与对比分析使用。
原始内容来自 asgeirtj/system-prompts-leaks，按厂商组织。 ## 覆盖厂商与规模 | 厂商 | 目录 | 文件数 | 说明 |
|------|------|--------|------|
| Anthropic | `Anthropic/` | 122 | 含 Claude Code 内置技能（artifact-design、batch、claude-api、code-review 等）、anthropic_reminders 等 |
| OpenAI | `OpenAI/` | 87 | ChatGPT 系列系统提示词 |
| Google | `Google/` | 23 | Gemini 相关 |
| xAI | `xAI/` | 11 | Grok 相关 |
| Microsoft | `Microsoft/` | 5 | Copilot 相关 |
| Mistral | `Mistral/` | 2 | Le Chat 相关 |
| Perplexity | `Perplexity/` | 3 | 搜索助手相关 |
| Cursor | `Cursor/` | 1 | Cursor 编辑器相关 |
| Meta | `Meta/` | 1 | Meta AI 相关 |
| Notion | `Notion/` | 1 | Notion AI 相关 |
| Qwen | `Qwen/` | 1 | 通义千问相关 |
| Misc | `Misc/` | 23 | 其他杂项 | ## 使用建议 - **研究/审计**：直接查阅对应厂商目录下的 `.md` 原文，了解其系统设定、约束与行为边界。
- **对比分析**：横向比较各家在"安全护栏""工具调用""语气设定"上的差异。
- **Claude Code 专项**：`Anthropic/Claude Code/bundled-skills/` 下含 Claude Code 各内置技能的 系统提示词，对理解 Doge Code 的汉化来源有直接参考价值。 ## 注意事项 - 这些提示词反映抓取时的版本，厂商会持续更新，不代表当前线上状态。
- 仅用于学习与合规研究，勿用于规避安全护栏或滥用。
- 原始版权与许可见各文件头部及原仓库 LICENSE。 > 来源：https://github.com/asgeirtj/system-prompts-leaks
