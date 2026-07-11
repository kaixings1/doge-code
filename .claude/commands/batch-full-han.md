---
description: 批量汉化所有 commands/agents/plugins/skills 目录下未翻译的文件
--- ## 工作模式 依次处理多个目录中所有未翻译（无 CJK 字符）的文件。对每个文件仅执行安全的基于模式的替换——不使用 AI 翻译。 ## 目标目录 1. .claude/commands/*.md（207 个未翻译）
2. .claude/agents/*.md（409 个未翻译）
3. .claude/plugins/*/*.md（642 个未翻译）
4. .claude/skills/*/SKILL.md（1330 个未翻译）
5. .claude/DisableSkills/*/SKILL.md（19 个未翻译） ## 翻译规则 对每个文件：
1. 检查前 300 字节是否包含 CJK 字符 -> 有则跳过
2. 将英文 description 翻译为中文（保留技术术语：API, SDK, SQL, CSS, HTML, JSON, YAML 等）
3. 将常见英文标题替换为中文对照： ## Prerequisites -> ## 前置条件 ## Setup -> ## 设置 ## Quick Reference -> ## 快速参考 ## Instructions -> ## 使用说明 ## Overview -> ## 概述 ## Usage -> ## 用法 ## Configuration -> ## 配置 ## API Reference -> ## API 参考 ## Examples -> ## 示例 ## Troubleshooting -> ## 故障排除 ## Best Practices -> ## 最佳实践 ## Limitations -> ## 限制 ## Notes -> ## 备注 ## Security -> ## 安全 ## Performance -> ## 性能 Step 1: -> 步骤 1： Step 2: -> 步骤 2： Step 3: -> 步骤 3：
4. 将英文正文翻译为中文
5. 绝不修改代码块（``` ... ```）或文件路径
6. 绝不破坏 YAML frontmatter（--- ... ---）
7. 每次处理一个目录：先 commands，然后 agents，然后 plugins，最后 skills
8. 每 20 个文件输出一次进度
9. 出错时：记录文件路径并继续——绝不因单文件失败而停止 ## 完成报告 各目录统计：文件总数、已汉化数、新增汉化数、跳过/失败数。
