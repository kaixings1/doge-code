# 前置元数据模式

每个 Wiki 页面以扁平 YAML 前置元数据开头。无嵌套对象。Obsidian 的属性 UI 需要扁平结构。

---

## 通用字段

每个页面，无一例外：

```yaml
---
type: <source|entity|concept|domain|comparison|question|overview|meta>
title: "人类可读标题"
created: 2026-04-07
updated: 2026-04-07
tags:
  - <领域标签>
  - <类型标签>
status: <seed|developing|mature|evergreen>
related:
  - "[[其他页面]]"
sources:
  - "[[.raw/articles/source-file.md]]"
---
```

**状态值：**
- `seed`（种子）：已存在，内容极少
- `developing`（发展中）：有实质内容，尚未完成
- `mature`（成熟）：全面完善，链接良好
- `evergreen`（常青）：不太可能需要更新

---

## 类型特定附加字段

### source（来源）

在通用字段后添加以下字段：

```yaml
source_type: article    # article | video | podcast | paper | book | transcript | data
author: ""
date_published: YYYY-MM-DD
url: ""
confidence: high        # high | medium | low
key_claims:
  - "从此来源得出的第一个关键声明"
  - "第二个关键声明"
```

### entity（实体）

```yaml
entity_type: person     # person | organization | product | repository | place
role: ""
first_mentioned: "[[来源标题]]"
```

### concept（概念）

```yaml
complexity: intermediate  # basic | intermediate | advanced
domain: ""
aliases:
  - "别名"
  - "缩写"
```

### comparison（对比）

```yaml
subjects:
  - "[[事物 A]]"
  - "[[事物 B]]"
dimensions:
  - "性能"
  - "成本"
  - "易用性"
verdict: "一行结论。"
```

### question（问题）

```yaml
question: "最初提出的查询。"
answer_quality: solid   # draft | solid | definitive
```

### domain（领域）

```yaml
subdomain_of: ""        # 顶级领域留空
page_count: 0
```

---

## 规则

1. 仅使用扁平 YAML。绝不嵌套对象。
2. 日期使用 `YYYY-MM-DD` 字符串，而非 ISO 日期时间。
3. 列表始终使用 `- item` 格式，而非内联 `[a, b, c]`。
4. YAML 字段中的 Wiki 链接必须加引号：`"[[页面名称]]"`。
5. `related` 和 `sources` 保持为 Wiki 链接，而非纯 URL。
6. 每次编辑页面内容时更新 `updated` 字段。
