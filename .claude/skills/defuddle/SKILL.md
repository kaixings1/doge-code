---
name: defuddle
description: "Defuddle — Defuddle 相关功能和最佳实践"
risk: unknown
source: "https://github.com/kepano/obsidian-skills"
date_added: "2026-03-21"
---

# Defuddle

使用 Defuddle CLI 从网页中提取干净可读的内容。对于标准网页，优先于 WebFetch —— 它移除导航、广告和杂乱内容，减少 token 使用。

## 何时使用
- 当用户提供普通网页 URL 以读取、总结或分析时使用。
- 当 token 效率至关重要时，优先于嘈杂的页面获取方法。
- 用于文档、文章、博客文章和类似的公共网页内容。

如果未安装：`npm install -g defuddle`

## 用法

始终 use `--md` for markdown output:

```bash
defuddle parse <url> --md
```

Save to file:

```bash
defuddle parse <url> --md -o content.md
```

Extract specific metadata:

```bash
defuddle parse <url> -p title
defuddle parse <url> -p description
defuddle parse <url> -p domain
```

## Output formats

| Flag | Format |
|------|--------|
| `--md` | Markdown (default choice) |
| `--json` | JSON with both HTML and markdown |
| (none) | HTML |
| `-p <name>` | Specific metadata property |

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
