---
name: ddd-context-mapping
description: "使用 DDD 上下文映射模式映射限界上下文之间的关系并定义集成契约。"
risk: safe
source: self
tags: "[ddd, context-map, anti-corruption-layer, integration]"
date_added: "2026-02-27"
---

# DDD 上下文映射

## 使用此技能的场景

- 定义限界上下文之间的集成模式。
- 防止跨服务边界的领域泄漏。
- 在迁移期间规划防腐层。
- 明确契约的上游和下游所有权。

## 不要使用此技能的场景

- You have a single-context system with no integrations.
- You only need internal class design.
- You are selecting cloud infrastructure tooling.

## 使用说明

1. List all context pairs and dependency direction.
2. Choose relationship patterns per pair.
3. Define translation rules and ownership boundaries.
4. Add failure modes, fallback behavior, and versioning policy.

If detailed mapping structures are needed, open `references/context-map-patterns.md`.

## Output requirements

- Relationship map for all context pairs
- Contract ownership matrix
- Translation and anti-corruption decisions
- Known coupling risks and mitigation plan

## 示例

```text
Use @ddd-context-mapping to define how Checkout integrates with Billing,
Inventory, and Fraud contexts, including ACL and contract ownership.
```

## 局限性

- This skill does not replace API-level schema design.
- It does not guarantee organizational alignment by itself.
- It should be revisited when team ownership changes.
