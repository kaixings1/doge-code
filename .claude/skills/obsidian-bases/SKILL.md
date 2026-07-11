---
name: 创建和编辑 Obsidian Bases（.base 文件）：Obsidian
description: "创建和编辑 Obsidian Bases（.base 文件）：Obsidian 的原生数据库层，支持动态表格、卡片视图、列表视图、过滤器、公式以及在知识库笔记上的汇总。触发词：create a base, add a base file, obsidian bases, base view, filter notes, formula, database view, dynamic table, task tracker base, reading list base。"
allowed-tools: Read Write
---

# obsidian-bases: Obsidian 的数据库层

Obsidian Bases（2025 年发布）将知识库笔记转化为可查询的动态视图。表格、卡片、列表、地图。在 `.base` 文件中定义。无需插件；它是 Obsidian 的核心功能。

**子层偏好（v1.7+）**：此技能是一个自包含的回退。**优先使用 `kepano/obsidian-skills`** 作为权威子层——其 `obsidian-bases` 技能是 Bases YAML、公式和视图定义的规范参考。如果您看到不带 `claude-obsidian:` 命名空间的 `obsidian-bases` 技能，那是 kepano 的版本：使用它。以下参考是为了确保在未安装 kepano 市场插件时，本插件仍能正常工作。安装：`claude plugin marketplace add kepano/obsidian-skills`。官方 Bases 文档：https://help.obsidian.md/bases/syntax

---

## 文件格式

`.base` 文件包含有效的 YAML。根键为 `filters`、`formulas`、`properties`、`summaries` 和 `views`。

```yaml
# 全局过滤器：应用于所有视图
filters:
  and:
    - file.hasTag("wiki")
    - 'status != "archived"'

# 计算属性
formulas:
  age_days: '(now() - file.ctime).days.round(0)'
  status_icon: 'if(status == "mature", "✅", "🔄")'

# Display name overrides for properties panel
properties:
  status:
    displayName: "Status"
  formula.age_days:
    displayName: "Age (days)"

# One or more views
views:
  - type: table
    name: "All Pages"
    order:
      - file.name
      - type
      - status
      - updated
      - formula.age_days
```

---

## Filters

Filters select which notes appear. Applied globally or per-view.

```yaml
# Single string 过滤器
filters: 'status == "current"'

# AND: all must be true
filters:
  and:
    - 'status != "archived"'
    - file.hasTag("wiki")

# OR: any can be true
filters:
  or:
    - file.hasTag("concept")
    - file.hasTag("entity")

# NOT: exclude matches
filters:
  not:
    - file.inFolder("wiki/meta")

# Nested
filters:
  and:
    - file.inFolder("wiki/")
    - or:
        - 'type == "concept"'
        - 'type == "entity"'
```

### 过滤器 operators

`==` `!=` `>` `<` `>=` `<=`

### Useful 过滤器 functions

| Function | Example |
|----------|---------|
| `file.hasTag("x")` | Notes with tag `x` |
| `file.inFolder("path/")` | Notes in folder |
| `file.hasLink("Note")` | Notes linking to Note |

---

## Properties

Three types:
- **Note properties**: from frontmatter: `status`, `type`, `updated`
- **File properties**: metadata: `file.name`, `file.mtime`, `file.size`, `file.ctime`, `file.tags`, `file.folder`
- **Formula properties**: computed: `formula.age_days`

---

## Formulas

Defined in `formulas:`. Referenced as `formula.name` in `order:` and `properties:`.

```yaml
formulas:
  # Days since created
  age_days: '(now() - file.ctime).days.round(0)'

  # Days until a date property
  days_until: 'if(due_date, (date(due_date) - today()).days, "")'

  # Conditional label
  status_icon: 'if(status == "mature", "✅", if(status == "developing", "🔄", "🌱"))'

  # Word count estimate
  word_est: '(file.size / 5).round(0)'
```

**Key rule**: Subtracting two dates returns a `Duration`. Not a number. Always access `.days` first:
```yaml
# CORRECT
age: '(now() - file.ctime).days'

# WRONG: crashes
age: '(now() - file.ctime).round(0)'
```

**Always guard nullable properties with `if()`**:
```yaml
# CORRECT
days_left: 'if(due_date, (date(due_date) - today()).days, "")'
```

---

## View Types

### Table
```yaml
views:
  - type: table
    name: "Wiki Index"
    limit: 100
    order:
      - file.name
      - type
      - status
      - updated
    groupBy:
      property: type
      direction: ASC
```

### Cards
```yaml
views:
  - type: cards
    name: "Gallery"
    order:
      - file.name
      - tags
      - status
```

### List
```yaml
views:
  - type: list
    name: "Quick List"
    order:
      - file.name
      - status
```

---

## Wiki Vault Templates

### Wiki content dashboard (all non-meta pages)

```yaml
filters:
  and:
    - file.inFolder("wiki/")
    - not:
        - file.inFolder("wiki/meta")

formulas:
  age: '(now() - file.ctime).days.round(0)'

properties:
  formula.age:
    displayName: "Age (days)"

views:
  - type: table
    name: "All Wiki Pages"
    order:
      - file.name
      - type
      - status
      - updated
      - formula.age
    groupBy:
      property: type
      direction: ASC
```

### Entity index (people, orgs, repos)

```yaml
filters:
  and:
    - file.inFolder("wiki/entities/")
    - 'file.ext == "md"'

views:
  - type: table
    name: "Entities"
    order:
      - file.name
      - entity_type
      - status
      - updated
    groupBy:
      property: entity_type
      direction: ASC
```

### Recent ingests

```yaml
filters:
  and:
    - file.inFolder("wiki/sources/")

views:
  - type: table
    name: "Sources"
    order:
      - file.name
      - source_type
      - created
      - status
    groupBy:
      property: source_type
      direction: ASC
```

---

## Embedding in Notes

```markdown
![[MyBase.base]]

![[MyBase.base#View Name]]
```

---

## Where to Save

Store `.base` files in `wiki/meta/` for vault dashboards:
- `wiki/meta/dashboard.base`: main content view
- `wiki/meta/entities.base`: entity tracker
- `wiki/meta/sources.base`: ingestion log

---

## YAML Quoting Rules

- Formulas with double quotes → wrap in single quotes: `'if(done, "Yes", "No")'`
- Strings with colons or special chars → wrap in double quotes: `"Status: Active"`
- Unquoted strings with `:` break YAML parsing

---

## What Not to Do

- Do not use `from:` or `where:`: those are Dataview syntax, not Obsidian Bases
- Do not use `sort:` at the root level: sorting is per-view via `order:` and `groupBy:`
- Do not put `.base` files outside the vault: they only render inside Obsidian
- Do not reference `formula.X` in `order:` without defining `X` in `formulas:`

---

## How to think (10-principle mapping)

When working on this skill, apply the 10-principle loop. See [`skills/think/SKILL.md`](../think/SKILL.md) for the canonical framework.

| # | Principle | Application here |
|---|-----------|-------------------|
| 1 | OBSERVE (ext) | The `.base` YAML the user is composing — read it carefully before suggesting changes. |
| 2 | OBSERVE (int) | Am I documenting yesterday's spec or today's? Bases evolves fast post-GA. |
| 3 | LISTEN | The user's specific Bases use-case (dashboard, 过滤器 chain, computed property). |
| 4 | THINK | Which 过滤器 operators, formula syntax, view types apply? Validate against the current spec. |
| 5 | CONNECT (lat) | How do Bases relate to Dataview queries? Properties? Canvas overlays? Map the deltas. |
| 6 | CONNECT (sys) | Obsidian Bases is post-1.10 GA; substrate-defer to kepano/obsidian-skills when present. |
| 7 | FEEL | 示例 that actually parse and render. Pseudo-syntax wastes the user. |
| 8 | ACCEPT | Bases spec evolves; some features in this doc may have changed. Keep the version note current. |
| 9 | CREATE | 架构 docs + worked 示例 that render in the user's actual Obsidian version. |
| 10 | GROW | As Bases features ship, refresh the reference. Track upstream releases. |
