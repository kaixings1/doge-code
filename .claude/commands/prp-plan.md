---
description: 通过代码库分析和模式提取创建全面的功能实现计划
argument-hint: <feature description | path/to/prd.md>
---

> 改编自 Wirasm 的 PRPs-agentic-eng。属于 PRP 工作流系列。

# PRP 计划

创建详细、自包含的实现计划，捕获一次性实现某项功能所需的所有代码库模式、约定和上下文。

**核心理念**：一份好的计划包含无需进一步提问即可实现所需的一切。每个模式、每个约定、每个坑 —— 捕获一次，全程引用。

**黄金法则**：如果你在实现期间需要搜索代码库，现在就把握这项知识写进计划。

---

## 阶段 0 —— 检测（DETECT）

从 `$ARGUMENTS` 判断输入类型：

| 输入模式 | 检测结果 | 动作 |
|---|---|---|
| 以 `.prd.md` 结尾的路径 | PRD 的文件路径 | 解析 PRD，找到下一个待办阶段 |
| 带有 "Implementation Phases" 的 `.md` 路径 | PRD 类文档 | 解析阶段，找到下一个待办 |
| 任何其他文件路径 | 参考文件 | 读取文件作为上下文，视为自由形式 |
| 自由文本 | 功能描述 | 直接进入阶段 1 |
| 空 / 空白 | 无输入 | 询问用户要规划什么功能 |

### PRD 解析（当输入是 PRD 时）

1. 用 `cat "$PRD_PATH"` 读取 PRD 文件
2. 解析 **Implementation Phases** 章节
3. 按状态查找阶段：
   - 查找 `pending` 阶段
   - 检查依赖链（某阶段可能依赖先前阶段为 `complete`）
   - 选出**下一个符合条件的待办阶段**
4. 从所选阶段提取：
   - 阶段名称与描述
   - 验收标准
   - 对先前阶段的依赖
   - 任何范围说明或约束
5. 把阶段描述作为要规划的功能

如果没有剩余的待办阶段，报告所有阶段均已完成。

---

## 阶段 1 —— 解析（PARSE）

提取并澄清功能需求。

### 功能理解

从输入（PRD 阶段或自由形式描述）中识别：

- **什么**正在被构建（具体交付物）
- **为什么**它重要（用户价值）
- **谁**使用它（目标用户/系统）
- **哪里**它契合（代码库的哪个部分）

### 用户故事

格式为：
```
As a [type of user],
I want [capability],
So that [benefit].
```

### 复杂度评估

| 级别 | 指标 | 典型范围 |
|---|---|---|
| **Small** | 单文件、孤立变更、无新依赖 | 1-3 个文件，<100 行 |
| **Medium** | 多文件、遵循既有模式、少量新概念 | 3-10 个文件，100-500 行 |
| **Large** | 横切关注点、新模式、外部集成 | 10+ 个文件，500+ 行 |
| **XL** | 架构性变更、新子系统、需要迁移 | 20+ 个文件，考虑拆分 |

### 歧义关卡

如果以下任何一项不清晰，在继续之前**停下来询问用户**：

- 核心交付物含糊不清
- 成功标准未定义
- 存在多种有效解释
- 技术方案有重大未知

不要猜测。要问。建立在假设之上的计划会在实现时失败。

---

## 阶段 2 —— 探索（EXPLORE）

收集深入的代码库情报。直接为下面每个类别搜索代码库。

### 代码库搜索（8 个类别）

对每个类别，使用 grep、find 和文件读取进行搜索：

1. **相似实现** —— 找到与计划中的功能相似的既有功能。查找类似模式、端点、组件或模块。

2. **命名约定** —— 识别相关代码库区域中文件、函数、变量、类和导出是如何命名的。

3. **错误处理** —— 在相似代码路径中，错误如何被捕获、传播、记录并返回给用户。

4. **日志模式** —— 识别记录什么、在什么级别、以什么格式。

5. **类型定义** —— 找到相关的类型、接口、schema 及其组织方式。

6. **测试模式** —— 找到相似功能如何被测试。记录测试文件位置、命名、setup/teardown 模式和断言风格。

7. **配置** —— 找到相关的配置文件、环境变量和功能开关。

8. **依赖** —— 识别相似功能所使用的包、导入和内部模块。

### 代码库分析（5 条追踪线）

读取相关文件以追踪：

1. **入口点** —— 请求/动作如何进入系统并到达你要修改的区域？
2. **数据流** —— 数据如何流经相关代码路径？
3. **状态变更** —— 什么状态被修改，在哪里？
4. **契约** —— 必须遵守哪些接口、API 或协议？
5. **模式** —— 使用了什么架构模式（repository、service、controller 等）？

### 统一发现表

把发现汇总为单一参考：

| 类别 | 文件:行号 | 模式 | 关键片段 |
|---|---|---|---|
| 命名 | `src/services/userService.ts:1-5` | camelCase services, PascalCase types | `export class UserService` |
| 错误 | `src/middleware/errorHandler.ts:10-25` | 自定义 AppError 类 | `throw new AppError(...)` |
| ... | ... | ... | ... |

---

## 阶段 3 —— 研究（RESEARCH）

如果功能涉及外部库、API 或不熟悉的技术：

1. 在网上搜索官方文档
2. 查找用法示例和最佳实践
3. 识别特定版本的坑

把每项发现格式化为：

```
KEY_INSIGHT: [what you learned]
APPLIES_TO: [which part of the plan this affects]
GOTCHA: [any warnings or version-specific issues]
```

如果功能只使用已被充分理解的内部模式，跳过此阶段并注明："No external research needed — feature uses established internal patterns."

---

## 阶段 4 —— 设计（DESIGN）

### UX 转变（如适用）

记录改变前后的用户体验：

**Before：**
```
┌─────────────────────────────┐
│  [Current user experience]  │
│  Show the current flow,     │
│  what the user sees/does    │
└─────────────────────────────┘
```

**After：**
```
┌─────────────────────────────┐
│  [New user experience]      │
│  Show the improved flow,    │
│  what changes for the user  │
└─────────────────────────────┘
```

### 交互变更

| 触点 | Before | After | 备注 |
|---|---|---|---|
| ... | ... | ... | ... |

如果功能纯属后端/内部、没有 UX 变更，注明："Internal change — no user-facing UX transformation."

---

## 阶段 5 —— 架构（ARCHITECT）

### 战略设计

定义实现方案：

- **Approach**：高层策略（例如 "Add new service layer following existing repository pattern"）
- **Alternatives Considered**：评估过哪些其他方案，以及为什么被否决
- **Scope**：将**要**构建的内容的具体边界
- **NOT Building**：明确列出**范围之外**的内容（防止实现期间的范围蔓延）

---

## 阶段 6 —— 生成（GENERATE）

使用下面的模板写出完整计划文档。保存到 `.claude/PRPs/plans/{kebab-case-feature-name}.plan.md`。

如果目录不存在则创建：
```bash
mkdir -p .claude/PRPs/plans
```

### 计划模板

````markdown
# Plan: [Feature Name]

## Summary
[2-3 sentence overview]

## User Story
As a [user], I want [capability], so that [benefit].

## Problem → Solution
[Current state] → [Desired state]

## Metadata
- **Complexity**: [Small | Medium | Large | XL]
- **Source PRD**: [path or "N/A"]
- **PRD Phase**: [phase name or "N/A"]
- **Estimated Files**: [count]

---

## UX Design

### Before
[ASCII diagram or "N/A — internal change"]

### After
[ASCII diagram or "N/A — internal change"]

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|

---

## Mandatory Reading

Files that MUST be read before implementing:

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 (critical) | `path/to/file` | 1-50 | Core pattern to follow |
| P1 (important) | `path/to/file` | 10-30 | Related types |
| P2 (reference) | `path/to/file` | all | Similar implementation |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| ... | ... | ... |

---

## Patterns to Mirror

Code patterns discovered in the codebase. Follow these exactly.

### NAMING_CONVENTION
// SOURCE: [file:lines]
[actual code snippet showing the naming pattern]

### ERROR_HANDLING
// SOURCE: [file:lines]
[actual code snippet showing error handling]

### LOGGING_PATTERN
// SOURCE: [file:lines]
[actual code snippet showing logging]

### REPOSITORY_PATTERN
// SOURCE: [file:lines]
[actual code snippet showing data access]

### SERVICE_PATTERN
// SOURCE: [file:lines]
[actual code snippet showing service layer]

### TEST_STRUCTURE
// SOURCE: [file:lines]
[actual code snippet showing test setup]

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `path/to/file.ts` | CREATE | New service for feature |
| `path/to/existing.ts` | UPDATE | Add new method |

## NOT Building

- [Explicit item 1 that is out of scope]
- [Explicit item 2 that is out of scope]

---

## Step-by-Step Tasks

### Task 1: [Name]
- **ACTION**: [What to do]
- **IMPLEMENT**: [Specific code/logic to write]
- **MIRROR**: [Pattern from Patterns to Mirror section to follow]
- **IMPORTS**: [Required imports]
- **GOTCHA**: [Known pitfall to avoid]
- **VALIDATE**: [How to verify this task is correct]

### Task 2: [Name]
- **ACTION**: ...
- **IMPLEMENT**: ...
- **MIRROR**: ...
- **IMPORTS**: ...
- **GOTCHA**: ...
- **VALIDATE**: ...

[Continue for all tasks...]

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| ... | ... | ... | ... |

### Edge Cases Checklist
- [ ] 空输入
- [ ] 最大尺寸输入
- [ ] 无效类型
- [ ] 并发访问
- [ ] 网络故障（如适用）
- [ ] 权限被拒

---

## Validation Commands

### Static Analysis
```bash
# Run type checker
[project-specific type check command]
```
EXPECT: Zero type errors

### Unit Tests
```bash
# Run tests for affected area
[project-specific test command]
```
EXPECT: All tests pass

### Full Test Suite
```bash
# Run complete test suite
[project-specific full test command]
```
EXPECT: No regressions

### Database Validation (if applicable)
```bash
# Verify schema/migrations
[project-specific db command]
```
EXPECT: Schema up to date

### Browser Validation (if applicable)
```bash
# Start dev server and verify
[project-specific dev server command]
```
EXPECT: Feature works as designed

### Manual Validation
- [ ] [Step-by-step manual verification checklist]

---

## Acceptance Criteria
- [ ] All tasks completed
- [ ] All validation commands pass
- [ ] Tests written and passing
- [ ] No type errors
- [ ] No lint errors
- [ ] Matches UX design (if applicable)

## Completion Checklist
- [ ] Code follows discovered patterns
- [ ] Error handling matches codebase style
- [ ] Logging follows codebase conventions
- [ ] Tests follow test patterns
- [ ] No hardcoded values
- [ ] Documentation updated (if needed)
- [ ] No unnecessary scope additions
- [ ] Self-contained — no questions needed during implementation

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ... | ... | ... | ... |

## Notes
[Any additional context, decisions, or observations]
```

---

## 输出

### 保存计划

把生成的计划写入：
```
.claude/PRPs/plans/{kebab-case-feature-name}.plan.md
```

### 更新 PRD（如果输入是 PRD）

如果此计划是由某个 PRD 阶段生成的：
1. 把阶段状态从 `pending` 更新为 `in-progress`
2. 在该阶段中添加计划文件路径作为引用

### 向用户报告

```
## Plan Created

- **File**: .claude/PRPs/plans/{kebab-case-feature-name}.plan.md
- **Source PRD**: [path or "N/A"]
- **Phase**: [phase name or "standalone"]
- **Complexity**: [level]
- **Scope**: [N files, M tasks]
- **Key Patterns**: [top 3 discovered patterns]
- **External Research**: [topics researched or "none needed"]
- **Risks**: [top risk or "none identified"]
- **Confidence Score**: [1-10] — likelihood of single-pass implementation

> Next step: Run `/prp-implement .claude/PRPs/plans/{name}.plan.md` to execute this plan.
```

---

## 验证

在最终确定之前，对照这些清单验证计划：

### 上下文完整性
- [ ] 所有相关文件都已发现并记录
- [ ] 命名约定已连示例一起捕获
- [ ] 错误处理模式已记录
- [ ] 测试模式已识别
- [ ] 依赖已列出

### 实现就绪性
- [ ] 每个任务都有 ACTION、IMPLEMENT、MIRROR 和 VALIDATE
- [ ] 没有任务需要额外搜索代码库
- [ ] 导入路径已指定
- [ ] GOTCHA 在适用处已记录

### 模式忠实度
- [ ] 代码片段是真实的代码库示例（非杜撰）
- [ ] SOURCE 引用指向真实文件和行号
- [ ] 模式覆盖命名、错误、日志、数据访问和测试
- [ ] 新代码将与现有代码无法区分

### 验证覆盖
- [ ] 已指定静态分析命令
- [ ] 已指定测试命令
- [ ] 已包含构建验证

### UX 清晰度
- [ ] 改变前后的状态已记录（或标记为 N/A）
- [ ] 交互变更已列出
- [ ] UX 的边界情况已识别

### 无先验知识测试
一位不熟悉此代码库的开发者应该能够**仅**用这份计划实现该功能，无需搜索代码库或提问。如果不能，补充缺失的上下文。

---

## 下一步

- 运行 `/prp-implement <plan-path>` 执行此计划
- 运行 `/plan` 进行无工件的快速对话式规划
- 如果范围不清晰，先运行 `/prp-prd` 创建 PRD
````
