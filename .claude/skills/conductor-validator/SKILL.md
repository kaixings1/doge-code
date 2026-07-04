---
name: conductor-validator
description: "Conductor Validator — Conductor Validator 相关功能和最佳实践"

  consistency, and correctness. Use after setup, when diagnosing issues, or

  before implementation to verify project context.

  '
risk: safe
source: community
date_added: '2026-02-27'
---

# Check if conductor directory exists
ls -la conductor/

# Find all track directories
ls -la conductor/tracks/

# Check for required files
ls conductor/index.md conductor/product.md conductor/tech-stack.md conductor/workflow.md conductor/tracks.md
```

## 使用此技能的场景

- 处理检查 Conductor 目录是否存在的任务或工作流时
- 需要检查 Conductor 目录是否存在的指导、最佳实践或检查清单时

## 不要使用此技能的场景

- 任务与检查 Conductor 目录是否存在无关时
- 需要此范围之外的领域或工具时

## 使用说明

- Clarify goals, constraints, and required inputs.
- Apply relevant best practices and validate outcomes.
- Provide actionable steps and verification.
- If detailed examples are required, open `resources/implementation-playbook.md`.

## Pattern Matching

**Status markers in tracks.md:**

```
- [ ] Track Name  # Not started
- [~] Track Name  # In progress
- [x] Track Name  # Complete
```

**Task markers in plan.md:**

```
- [ ] Task description  # Pending
- [~] Task description  # In progress
- [x] Task description  # Complete
```

**Track ID pattern:**

```
<type>_<name>_<YYYYMMDD>
Example: feature_user_auth_20250115
```

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
