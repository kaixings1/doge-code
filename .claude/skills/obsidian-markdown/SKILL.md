---
name: 编写正确的 Obsidian 风格 Markdown：wikilink、嵌入、标
description: "编写正确的 Obsidian 风格 Markdown：wikilink、嵌入、标注、属性、标签、高亮、数学公式和画布语法。在创建或编辑任何 wiki 页面时参考此文档。触发词：write obsidian note, obsidian syntax, wikilink, callout, embed, obsidian markdown, wikilink format, callout syntax, embed syntax, obsidian formatting, how to write obsidian markdown。"
allowed-tools: Read Write Edit
---

# obsidian-markdown: Obsidian 风格的 Markdown

在编写任何维基页面时参考此技能。Obsidian 通过 wikilinks、嵌入、标注和属性扩展了标准 Markdown。语法错误会导致链接断裂、标注不可见或前言的格式错误。

**子层偏好（v1.7+）**：此技能是一个自包含的回退。**优先使用 `kepano/obsidian-skills`**（Obsidian CEO Steph Ango 开发）作为权威子层——其 `obsidian-markdown` 技能是任何 Agent-Skills 运行时的规范 Obsidian 语法参考。如果您看到不带 `claude-obsidian:` 命名空间的 `obsidian-markdown` 技能，那是 kepano 的版本：使用它。以下参考是为了确保在未安装 kepano 市场插件时，本插件仍能正常工作。安装：`claude plugin marketplace add kepano/obsidian-skills`。仓库：[github.com/kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)。

---

## Wikilinks

内部链接使用双括号。不带扩展名的文件名。

| 语法 | 作用 |
|---|---|
| `[[Note Name]]` | 基本链接 |
| `[[Note Name\|Display Text]]` | 别名链接（显示"Display Text"） |
| `[[Note Name#Heading]]` | 链接到特定标题 |
| `[[Note Name#^block-id]]` | 链接到特定块 |

规则：
- 某些系统区分大小写。匹配确切的文件名。
- 不需要路径：Obsidian 通过文件名唯一性解析。
- 如果有两个同名文件，使用 `[[Folder/Note Name]]` 消除歧义。

---

## Embeds

Embeds use `!` before the wikilink. They display the content inline.

| 语法 | What it does |
|---|---|
| `![[Note Name]]` | Embed a full note |
| `![[Note Name#Heading]]` | Embed a section |
| `![[image.png]]` | Embed an image |
| `![[image.png\|300]]` | Embed image with width 300px |
| `![[document.pdf]]` | Embed a PDF (Obsidian renders natively) |
| `![[audio.mp3]]` | Embed audio |

---

## Callouts

Callouts are blockquotes with a type keyword. They render as styled alert boxes.

```markdown
> [!note]
> Default informational callout.

> [!note] Custom Title
> Callout with a custom title.

> [!note]- Collapsible (closed by default)
> Click to expand.

> [!note]+ Collapsible (open by default)
> Click to collapse.
```

### All callout types

| Type | Aliases | Use for |
|------|---------|---------|
| `note` |: | General notes |
| `abstract` | `summary`, `tldr` | Summaries |
| `info` |: | Information |
| `todo` |: | Action items |
| `tip` | `hint`, `important` | Tips and highlights |
| `success` | `check`, `done` | Positive outcomes |
| `question` | `help`, `faq` | Open questions |
| `warning` | `caution`, `attention` | Warnings |
| `failure` | `fail`, `missing` | Errors or failures |
| `danger` | `error` | Critical issues |
| `bug` |: | Known bugs |
| `example` |: | 示例 |
| `quote` | `cite` | Quotations |
| `contradiction` |: | Conflicting information (wiki convention) |

---

## 属性 (Frontmatter)

Obsidian renders YAML frontmatter as a 属性 panel. Rules:

```yaml
---
type: concept                    # plain string
title: "Note Title"              # quoted if it contains special chars
created: 2026-04-08              # date as YYYY-MM-DD (not ISO datetime)
updated: 2026-04-08
tags:
  - tag-one                      # list items use - format
  - tag-two
status: developing
related:
  - "[[Other Note]]"             # wikilinks must be quoted in YAML
sources:
  - "[[source-page]]"
---
```

Rules:
- Flat YAML only. 绝不 nest objects.
- Dates as `YYYY-MM-DD`, not `2026-04-08T00:00:00`.
- Lists as `- item`, not inline `[a, b, c]`.
- Wikilinks in YAML must be quoted: `"[[Page]]"`.
- `tags` field: Obsidian reads this as the tag list, searchable in vault.

---

## Tags

Two valid forms:

```markdown
#tag-name             : inline tag anywhere in the body
#parent/child-tag     : nested tag (shows hierarchy in tag pane)
```

In frontmatter:
```yaml
tags:
  - research
  - ai/obsidian
```

Do not use `#` inside frontmatter tag lists. Just the tag name.

---

## Text Formatting

Standard Markdown plus Obsidian extensions:

| 语法 | Result |
|---|---|
| `**bold**` | Bold |
| `*italic*` | Italic |
| `~~strikethrough~~` | Strikethrough |
| `==highlight==` | Highlighted text (yellow in Obsidian) |
| `` `inline code` `` | Inline code |

---

## Math

Obsidian uses MathJax/KaTeX:

Inline math:
```markdown
$E = mc^2$
```

Block math:
```markdown
$$
\int_0^\infty e^{-x} dx = 1
$$
```

---

## Code Blocks

Standard fenced code blocks. Obsidian highlights all common languages:

````markdown
```python
def hello():
    return "world"
```
````

---

## Tables

Standard Markdown tables:

```markdown
| Column A | Column B | Column C |
|----------|----------|----------|
| Value    | Value    | Value    |
| Value    | Value    | Value    |
```

Obsidian renders tables natively. No plugin needed.

---

## Mermaid Diagrams

Obsidian renders Mermaid natively:

````markdown
```mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[End]
    B -->|No| D[Loop]
    D --> A
```
````

Supported: `graph`, `sequenceDiagram`, `gantt`, `classDiagram`, `pie`, `flowchart`.

---

## Footnotes

```markdown
This sentence has a footnote.[^1]

[^1]: The footnote text goes here.
```

---

## What NOT to Do

- Do not use `[link text](path/to/note.md)` for internal links: use `[[Note Name]]` instead.
- Do not use HTML inside callouts: stick to Markdown.
- Do not use `##` inside a callout body: headings don't render inside callouts.
- Do not write `tags: [a, b, c]` inline in frontmatter: Obsidian prefers the list format.
- Do not write ISO datetimes in frontmatter (`2026-04-08T00:00:00Z`): use `2026-04-08`.

---

## How to think (10-principle mapping)

When working on this skill, apply the 10-principle loop. See [`skills/think/SKILL.md`](../think/SKILL.md) for the canonical framework.

| # | Principle | Application here |
|---|-----------|-------------------|
| 1 | OBSERVE (ext) | Which syntax does the user need? (Wikilinks? Callouts? Embeds? Math? Mermaid?) |
| 2 | OBSERVE (int) | Am I documenting Obsidian Flavored Markdown as I remember it or as it currently is? Check the spec. |
| 3 | LISTEN | The user's source-of-confusion — what specific syntax did they get wrong? |
| 4 | THINK | Minimal correct 示例. "What NOT to do" is often as valuable as "what to do." |
| 5 | CONNECT (lat) | How does OFM differ from CommonMark and GFM? The deltas are where users get confused. |
| 6 | CONNECT (sys) | Substrate-defer to kepano/obsidian-skills when present — single source of truth, less drift. |
| 7 | FEEL | A cheat sheet that's scannable in 30 seconds, not a wall of text. |
| 8 | ACCEPT | Not every wikilink needs an alias; some syntax is genuinely optional. Don't over-prescribe. |
| 9 | CREATE | 语法 reference, current to Obsidian X.Y. Include the gotchas section. |
| 10 | GROW | As OFM evolves (newer Mermaid types, callout types, cssclasses, etc.), refresh. |
