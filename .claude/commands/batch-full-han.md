---
description: batch i18n all untranslated files in commands/agents/plugins/skills
--- ## Work Mode Sequentially process all untranslated (no CJK characters) files across multiple directories. For each file, perform safe pattern-based replacements only - no AI translation. ## Target Directories 1. .claude/commands/*.md (207 untranslated)
2. .claude/agents/*.md (409 untranslated)
3. .claude/plugins/*/*.md (642 untranslated)
4. .claude/skills/*/SKILL.md (1330 untranslated)
5. .claude/DisableSkills/*/SKILL.md (19 untranslated) ## Translation Rules For each file:
1. Check if contains CJK characters in first 300 bytes -> skip if yes
2. Translate English description to Chinese (keep technical terms: API, SDK, SQL, CSS, HTML, JSON, YAML, etc.)
3. Replace common English headings with Chinese equivalents: ## Prerequisites -> ## 前置条件 ## Setup -> ## 设置 ## Quick Reference -> ## 快速参考 ## Instructions -> ## 使用说明 ## Overview -> ## 概述 ## Usage -> ## 用法 ## Configuration -> ## 配置 ## API Reference -> ## API 参考 ## Examples -> ## 示例 ## Troubleshooting -> ## 故障排除 ## Best Practices -> ## 最佳实践 ## Limitations -> ## 限制 ## Notes -> ## 备注 ## Security -> ## 安全 ## Performance -> ## 性能 Step 1: -> 步骤 1： Step 2: -> 步骤 2： Step 3: -> 步骤 3：
4. Translate English body text to Chinese
5. Never modify code blocks (``` ... ```) or file paths
6. Never break YAML frontmatter (--- ... ---)
7. Process one directory at a time: commands first, then agents, then plugins, then skills
8. Output progress every 20 files
9. On error: log file path and continue - never stop on single file failure ## Completion Report per-directory stats: total files, already hanhua, newly hanhua, skipped/failed.
