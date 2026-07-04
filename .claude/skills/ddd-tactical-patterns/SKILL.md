---
name: ddd-tactical-patterns
description: "使用实体、值对象、聚合、仓储和领域事件在代码中应用 DDD 战术模式，并带有显式不变式。"
risk: safe
source: self
tags: "[ddd, tactical, aggregates, value-objects, domain-events]"
date_added: "2026-02-27"
---

# DDD 战术模式

## 使用此技能的场景

- 将领域规则转化为代码结构。
- 设计聚合边界和不变条件。
- 将贫血模型重构为行为丰富的领域对象。
- 定义仓储契约和领域事件边界。

## 不要使用此技能的场景

- You are still defining strategic boundaries.
- The task is only API documentation or UI layout.
- Full DDD complexity is not justified.

## 使用说明

1. Identify invariants first and design aggregates around them.
2. Model immutable value objects for validated concepts.
3. Keep domain behavior in domain objects, not controllers.
4. Emit domain events for meaningful state transitions.
5. Keep repositories at aggregate root boundaries.

If detailed checklists are needed, open `references/tactical-checklist.md`.

## 示例

```typescript
class Order {
  private status: "draft" | "submitted" = "draft";

  submit(itemsCount: number): void {
    if (itemsCount === 0) throw new Error("Order cannot be submitted empty");
    if (this.status !== "draft") throw new Error("Order already submitted");
    this.status = "submitted";
  }
}
```

## 局限性

- This skill does not define deployment architecture.
- It does not choose databases or transport protocols.
- It should be paired with testing patterns for invariant coverage.
