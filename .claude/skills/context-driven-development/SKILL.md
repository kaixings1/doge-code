---
name: 上下文驱动开发 (CDD)
description: "将上下文作为托管工件与代码一起实施和维护的指南，通过结构化项目文档实现一致的 AI 交互和团队协作。"
risk: unknown
source: community
date_added: '2026-02-27'
---

# 上下文驱动开发

Guide for implementing and maintaining context as a managed artifact alongside code, enabling consistent AI interactions and team alignment through structured project documentation.

## 不要使用此技能的场景

- The task is unrelated to context-driven development
- You need a different domain or tool outside this scope

## 使用说明

- Clarify goals, constraints, and required inputs.
- Apply relevant best practices and validate outcomes.
- Provide actionable steps and verification.
- If detailed examples are required, open `resources/implementation-playbook.md`.

## 使用此技能的场景

- Setting up new projects with Conductor
- Understanding the relationship between context artifacts
- Maintaining consistency across AI-assisted development sessions
- Onboarding team members to an existing Conductor project
- Deciding when to update context documents
- Managing greenfield vs brownfield project contexts

## Core Philosophy

Context-Driven Development treats project context as a first-class artifact managed alongside code. Instead of relying on ad-hoc prompts or scattered documentation, establish a persistent, structured foundation that informs all AI interactions.

Key principles:

1. **Context precedes code**: Define what you're building and how before implementation
2. **Living documentation**: Context artifacts evolve with the project
3. **Single source of truth**: One canonical location for each type of information
4. **AI alignment**: Consistent context produces consistent AI behavior

## The 工作流

Follow the **Context → Spec & Plan → Implement** 工作流:

1. **Context Phase**: Establish or verify project context artifacts exist and are current
2. **Specification Phase**: Define requirements and acceptance criteria for work units
3. **Planning Phase**: Break specifications into phased, actionable tasks
4. **Implementation Phase**: Execute tasks following established 工作流 patterns

## Artifact Relationships

### product.md - Defines WHAT and WHY

Purpose: Captures product vision, goals, target users, and business context.

Contents:

- Product name and one-line description
- Problem statement and solution 方法
- Target user personas
- Core features and capabilities
- Success metrics and KPIs
- Product roadmap (high-level)

Update when:

- Product vision or goals change
- New major features are planned
- Target audience shifts
- Business priorities evolve

### product-guidelines.md - Defines HOW to Communicate

Purpose: Establishes brand voice, messaging standards, and communication patterns.

Contents:

- Brand voice and tone guidelines
- Terminology and glossary
- Error message conventions
- User-facing copy standards
- Documentation style

Update when:

- Brand guidelines change
- New terminology is introduced
- Communication patterns need refinement

### tech-stack.md - Defines WITH WHAT

Purpose: Documents technology choices, dependencies, and architectural decisions.

Contents:

- Primary languages and frameworks
- Key dependencies with versions
- Infrastructure and 部署 targets
- Development tools and environment
- Testing frameworks
- Code quality tools

Update when:

- Adding new dependencies
- Upgrading major versions
- Changing infrastructure
- Adopting new tools or patterns

### 工作流.md - Defines HOW to Work

Purpose: Establishes development practices, quality gates, and team workflows.

Contents:

- Development methodology (TDD, etc.)
- Git 工作流 and commit conventions
- Code review requirements
- Testing requirements and coverage targets
- Quality assurance gates
- 部署 procedures

Update when:

- Team practices evolve
- Quality standards change
- New 工作流 patterns are adopted

### tracks.md - Tracks WHAT'S HAPPENING

Purpose: Registry of all work units with status and metadata.

Contents:

- Active tracks with current status
- Completed tracks with completion dates
- Track metadata (type, priority, assignee)
- Links to individual track directories

Update when:

- New tracks are created
- Track status changes
- Tracks are completed or archived

## Context Maintenance Principles

### Keep Artifacts Synchronized

Ensure changes in one artifact reflect in related documents:

- New feature in product.md → Update tech-stack.md if new dependencies needed
- Completed track → Update product.md to reflect new capabilities
- 工作流 change → Update all affected track plans

### Update tech-stack.md When Adding Dependencies

Before adding any new dependency:

1. Check if existing dependencies solve the need
2. Document the rationale for new dependencies
3. Add version constraints
4. Note any 配置 requirements

### Update product.md When Features Complete

After completing a feature track:

1. Move feature from "planned" to "implemented" in product.md
2. Update any affected success metrics
3. Document any scope changes from original plan

### Verify Context Before Implementation

Before starting any track:

1. Read all context artifacts
2. Flag any outdated information
3. Propose updates before proceeding
4. Confirm context accuracy with stakeholders

## Greenfield vs Brownfield Handling

### Greenfield Projects (New)

For new projects:

1. Run `/conductor:设置` to create all artifacts interactively
2. Answer questions about product vision, tech preferences, and 工作流
3. Generate initial style guides for chosen languages
4. Create empty tracks registry

Characteristics:

- Full control over context structure
- Define standards before code exists
- Establish patterns early

### Brownfield Projects (Existing)

For existing codebases:

1. Run `/conductor:设置` with existing codebase detection
2. System analyzes existing code, configs, and documentation
3. Pre-populate artifacts based on discovered patterns
4. Review and refine generated context

Characteristics:

- Extract implicit context from existing code
- Reconcile existing patterns with desired patterns
- Document technical debt and modernization plans
- Preserve working patterns while establishing standards

## Benefits

### Team Alignment

- New team members onboard faster with explicit context
- Consistent terminology and conventions across the team
- Shared understanding of product goals and technical decisions

### AI Consistency

- AI assistants produce aligned outputs across sessions
- Reduced need to re-explain context in each interaction
- Predictable behavior based on documented standards

### Institutional Memory

- Decisions and rationale are preserved
- Context survives team changes
- Historical context informs future decisions

### Quality Assurance

- Standards are explicit and verifiable
- Deviations from context are detectable
- Quality gates are documented and enforceable

## Directory Structure

```
conductor/
├── index.md              # Navigation hub linking all artifacts
├── product.md            # Product vision and goals
├── product-guidelines.md # Communication standards
├── tech-stack.md         # Technology preferences
├── 工作流.md           # Development practices
├── tracks.md             # Work unit registry
├── setup_state.json      # Resumable 设置 state
├── code_styleguides/     # Language-specific conventions
│   ├── python.md
│   ├── typescript.md
│   └── ...
└── tracks/
    └── <track-id>/
        ├── spec.md
        ├── plan.md
        ├── metadata.json
        └── index.md
```

## Context Lifecycle

1. **Creation**: Initial 设置 via `/conductor:设置`
2. **Validation**: Verify before each track
3. **Evolution**: Update as project grows
4. **Synchronization**: Keep artifacts aligned
5. **Archival**: Document historical decisions

## Context Validation Checklist

Before starting implementation on any track, validate context:

### Product Context

- [ ] product.md reflects current product vision
- [ ] Target users are accurately described
- [ ] Feature list is up to date
- [ ] Success metrics are defined

### Technical Context

- [ ] tech-stack.md lists all current dependencies
- [ ] Version numbers are accurate
- [ ] Infrastructure targets are correct
- [ ] Development tools are documented

### 工作流 Context

- [ ] 工作流.md describes current practices
- [ ] Quality gates are defined
- [ ] Coverage targets are specified
- [ ] Commit conventions are documented

### Track Context

- [ ] tracks.md shows all active work
- [ ] No stale or abandoned tracks
- [ ] Dependencies between tracks are noted

## Common Anti-Patterns

Avoid these context management mistakes:

### Stale Context

Problem: Context documents become outdated and misleading.
Solution: Update context as part of each track's completion process.

### Context Sprawl

Problem: Information scattered across multiple locations.
Solution: Use the defined artifact structure; resist creating new document types.

### Implicit Context

Problem: Relying on knowledge not captured in artifacts.
Solution: If you reference something repeatedly, add it to the appropriate artifact.

### Context Hoarding

Problem: One person maintains context without team input.
Solution: Review context artifacts in pull requests; make updates collaborative.

### Over-Specification

Problem: Context becomes so detailed it's impossible to maintain.
Solution: Keep artifacts focused on decisions that affect AI behavior and team alignment.

## 集成 with Development Tools

### IDE 集成

Configure your IDE to display context files prominently:

- Pin conductor/product.md for 快速参考
- Add tech-stack.md to project notes
- Create snippets for common patterns from style guides

### Git Hooks

Consider pre-commit hooks that:

- Warn when dependencies change without tech-stack.md update
- Remind to update product.md when feature branches merge
- Validate context artifact syntax

### CI/CD 集成

Include context validation in pipelines:

- Check tech-stack.md matches actual dependencies
- Verify links in context documents resolve
- Ensure tracks.md status matches git branch state

## 会话 Continuity

Conductor supports multi-会话 development through context persistence:

### Starting a New 会话

1. Read index.md to orient yourself
2. Check tracks.md for active work
3. Review relevant track's plan.md for current task
4. Verify context artifacts are current

### Ending a 会话

1. Update plan.md with current progress
2. Note any blockers or decisions made
3. Commit in-progress work with clear status
4. Update tracks.md if status changed

### Handling Interruptions

If interrupted mid-task:

1. Mark task as `[~]` with note about stopping point
2. Commit work-in-progress to feature branch
3. Document any uncommitted decisions in plan.md

## 最佳实践

1. **Read context first**: Always read relevant artifacts before starting work
2. **Small updates**: Make incremental context changes, not massive rewrites
3. **Link decisions**: Reference context when making implementation choices
4. **Version context**: Commit context changes alongside code changes
5. **Review context**: Include context artifact reviews in code reviews
6. **Validate regularly**: Run context validation checklist before major work
7. **Communicate changes**: Notify team when context artifacts change significantly
8. **Preserve history**: Use git to track context evolution over time
9. **Question staleness**: If context feels wrong, investigate and update
10. **Keep it actionable**: Every context item should inform a decision or behavior

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
