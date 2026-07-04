---
name: ddd-strategic-design
description: "为复杂业务领域设计 DDD 战略工件，包括子域、限界上下文和通用语言。"
risk: safe
source: self
tags: "[ddd, strategic-design, bounded-context, ubiquitous-language]"
date_added: "2026-02-27"
---

# DDD 战略设计

## 使用此技能的场景

- 定义核心、支撑和通用子域。
- 按领域边界拆分单体或服务架构。
- 将团队和所有权与限界上下文对齐。
- 与领域专家构建共享的通用语言。

## 不要使用此技能的场景

- The domain model is stable and already well bounded.
- You need tactical code patterns only.
- The task is purely infrastructure or UI oriented.

## 使用说明

1. Extract domain capabilities and classify subdomains.
2. Define bounded contexts around consistency and ownership.
3. Establish a ubiquitous language glossary and anti-terms.
4. Capture context boundaries in ADRs before implementation.

If detailed templates are needed, open `references/strategic-design-template.md`.

## Required artifacts

- Subdomain classification table
- Bounded context catalog
- Glossary with canonical terms
- Boundary decisions with rationale

## 示例

```text
Use @ddd-strategic-design to map our commerce domain into bounded contexts,
classify subdomains, and propose team ownership.
```

## 局限性

- This skill does not produce executable code.
- It cannot infer business truth without stakeholder input.
- It should be followed by tactical design before implementation.
