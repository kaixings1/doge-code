---
name: deprecation-and-迁移
description: 弃用与迁移 — 管理弃用和迁移。在移除旧系统或升级依赖时使用。
---

# 弃用与迁移

## 概述

代码是负债而非资产。每行代码都有持续的维护成本——要修复的错误、要更新的依赖、要应用的安全补丁以及要培训的新工程师。弃用是移除不再值得保留的代码的纪律，而迁移则是将用户安全地从旧系统迁移到新系统的过程。

大多数工程组织擅长构建东西，但很少擅长移除东西。此技能解决了这一差距。

## 何时使用

- 用新系统、API 或库替换旧的
- 逐步淘汰不再需要的功能
- 合并重复实现
- 移除无人拥有但所有人都依赖的死代码
- 规划新系统的生命周期（弃用规划从设计时开始）
- Deciding whether to maintain a legacy system or invest in 迁移

## 核心原则

### Code Is a Liability

Every line of code has ongoing cost: it needs tests, documentation, security patches, dependency updates, and mental overhead for anyone working nearby. The value of code is the functionality it provides, not the code itself. When the same functionality can be provided with less code, less complexity, or better abstractions — the old code should go.

### Hyrum's Law Makes Removal Hard

With enough users, every observable behavior becomes depended on — including bugs, timing quirks, and undocumented side effects. This is why deprecation requires active 迁移, not just announcement. Users can't "just switch" when they depend on behaviors the replacement doesn't replicate.

### Deprecation Planning Starts at Design Time

When building something new, ask: "How would we remove this in 3 years?" Systems designed with clean interfaces, feature flags, and minimal surface area are easier to deprecate than systems that leak implementation details everywhere.

## 弃用决策

Before deprecating anything, answer these questions:

```
1. Does this system still provide unique value?
   → If yes, maintain it. If no, proceed.

2. How many users/consumers depend on it?
   → Quantify the 迁移 scope.

3. Does a replacement exist?
   → If no, build the replacement first. Don't deprecate without an alternative.

4. What's the 迁移 cost for each consumer?
   → If trivially automated, do it. If manual and high-effort, weigh against maintenance cost.

5. What's the ongoing maintenance cost of NOT deprecating?
   → Security risk, engineer time, opportunity cost of complexity.
```

## 强制性与建议性弃用

| Type | 使用场景 | Mechanism |
|------|-------------|-----------|
| **Advisory** | 迁移 is optional, old system is stable | Warnings, documentation, nudges. Users migrate on their own timeline. |
| **Compulsory** | Old system has security issues, blocks progress, or maintenance cost is unsustainable | Hard deadline. Old system will be removed by date X. Provide 迁移 tooling. |

**默认 to advisory.** Use compulsory only when the maintenance cost or risk justifies forcing 迁移. Compulsory deprecation requires providing 迁移 tooling, documentation, and support — you can't just announce a deadline.

## 迁移流程

### 步骤 1: Build the Replacement

Don't deprecate without a working alternative. The replacement must:

- Cover all critical use cases of the old system
- Have documentation and 迁移 guides
- Be proven in production (not just "theoretically better")

### 步骤 2: Announce and Document

```markdown
## 弃用通知：旧服务

**Status:** Deprecated as of 2025-03-01
**Replacement:** NewService (see 迁移 guide below)
**Removal date:** Advisory — no hard deadline yet
**Reason:** OldService requires manual scaling and lacks observability.
            NewService handles both automatically.

### 迁移 Guide
1. Replace `import { client } from 'old-service'` with `import { client } from 'new-service'`
2. Update 配置 (see 示例 below)
3. Run the 迁移 verification script: `npx migrate-check`
```

### 步骤 3: Migrate Incrementally

Migrate consumers one at a time, not all at once. For each consumer:

```
1. Identify all touchpoints with the deprecated system
2. Update to use the replacement
3. Verify behavior matches (tests, 集成 checks)
4. Remove references to the old system
5. Confirm no regressions
```

**The Churn Rule:** If you own the infrastructure being deprecated, you are responsible for migrating your users — or providing backward-compatible updates that require no 迁移. Don't announce deprecation and leave users to figure it out.

### 步骤 4: Remove the Old System

Only after all consumers have migrated:

```
1. Verify zero active usage (metrics, logs, dependency analysis)
2. Remove the code
3. Remove associated tests, documentation, and 配置
4. Remove the deprecation notices
5. Celebrate — removing code is an achievement
```

## 迁移模式

### Strangler Pattern

Run old and new systems in parallel. Route traffic incrementally from old to new. When the old system handles 0% of traffic, remove it.

```
Phase 1: New system handles 0%, old handles 100%
Phase 2: New system handles 10% (canary)
Phase 3: New system handles 50%
Phase 4: New system handles 100%, old system idle
Phase 5: Remove old system
```

### Adapter Pattern

Create an adapter that translates calls from the old interface to the new implementation. Consumers keep using the old interface while you migrate the backend.

```typescript
// Adapter: old interface, new implementation
class LegacyTaskService implements OldTaskAPI {
  constructor(private newService: NewTaskService) {}

  // Old method signature, delegates to new implementation
  getTask(id: number): OldTask {
    const task = this.newService.findById(String(id));
    return this.toOldFormat(task);
  }
}
```

### Feature Flag 迁移

Use feature flags to switch consumers from old to new system one at a time:

```typescript
function getTaskService(userId: string): TaskService {
  if (featureFlags.isEnabled('new-task-service', { userId })) {
    return new NewTaskService();
  }
  return new LegacyTaskService();
}
```

## Zombie Code

Zombie code is code that nobody owns but everybody depends on. It's not actively maintained, has no clear owner, and accumulates security vulnerabilities and compatibility issues. Signs:

- No commits in 6+ months but active consumers exist
- No assigned maintainer or team
- Failing tests that nobody fixes
- 依赖项 with known vulnerabilities that nobody updates
- Documentation that references systems that no longer exist

**响应:** Either assign an owner and maintain it properly, or deprecate it with a concrete 迁移 plan. Zombie code cannot stay in limbo — it either gets investment or removal.

## 常见理由

| Rationalization | Reality |
|---|---|
| "It still works, why remove it?" | Working code that nobody maintains accumulates security debt and complexity. Maintenance cost grows silently. |
| "Someone might need it later" | If it's needed later, it can be rebuilt. Keeping unused code "just in case" costs more than rebuilding. |
| "The 迁移 is too expensive" | Compare 迁移 cost to ongoing maintenance cost over 2-3 years. 迁移 is usually cheaper long-term. |
| "We'll deprecate it after we finish the new system" | Deprecation planning starts at design time. By the time the new system is done, you'll have new priorities. Plan now. |
| "Users will migrate on their own" | They won't. Provide tooling, documentation, and incentives — or do the 迁移 yourself (the Churn Rule). |
| "We can maintain both systems indefinitely" | Two systems doing the same thing is double the maintenance, testing, documentation, and onboarding cost. |

## 危险信号

- Deprecated systems with no replacement available
- Deprecation announcements with no 迁移 tooling or documentation
- "Soft" deprecation that's been advisory for years with no progress
- Zombie code with no owner and active consumers
- New features added to a deprecated system (invest in the replacement instead)
- Deprecation without measuring current usage
- Removing code without verifying zero active consumers

## 验证

After completing a deprecation:

- [ ] Replacement is production-proven and covers all critical use cases
- [ ] 迁移 guide exists with concrete steps and 示例
- [ ] All active consumers have been migrated (verified by metrics/logs)
- [ ] Old code, tests, documentation, and 配置 are fully removed
- [ ] No references to the deprecated system remain in the codebase
- [ ] Deprecation notices are removed (they served their 目的)
