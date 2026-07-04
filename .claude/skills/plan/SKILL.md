---
name: omc-plan
description: "Plan — Plan 相关功能和最佳实践"
argument-hint: "[--direct|--consensus|--review] [--interactive] [--deliberate] <task description>"
pipeline: [deep-interview]
handoff-policy: approval-required
handoff: .omc/plans/ralplan-*.md
level: 4
---

<Purpose>
Plan 通过智能交互创建全面、可执行的工作计划。它自动检测是否需要面试用户（宽泛请求）或直接规划（详细请求），并支持共识模式（Planner/Architect/Critic 迭代循环与 RALPLAN-DR 结构化审议）和审查模式（Critic 评估现有计划）。
</Purpose>

<Use_When>

- 用户希望在实现之前进行规划 -- "plan this", "plan the", "let's plan"
- 用户希望对模糊的想法进行结构化需求收集
- 用户希望审查现有计划 -- "review this plan", `--review`
- 用户希望计划获得多视角共识 -- `--consensus`, "ralplan"
- 任务宽泛或模糊，在编写代码前需要确定范围
  </Use_When>

<Do_Not_Use_When>

- 用户希望自主端到端执行 -- 改用 `autopilot`
- 用户希望立即开始编码，任务明确 -- 改用 `ralph` 或委托给执行者
- 用户提出可以直接回答的简单问题 -- 直接回答即可
- 任务是范围明确的单一修复 -- 改用执行技能，而非从本规划模块运行
  </Do_Not_Use_When>

<Why_This_Exists>
在不了解需求的情况下直接编码会导致返工、范围蔓延和遗漏边界情况。Plan 提供结构化的需求收集、专家分析和质量把关计划，使执行从坚实的基础开始。共识模式为高风险项目增加了多视角验证。
</Why_This_Exists>

<Execution_Policy>

- 根据请求的具体程度自动检测面试模式 vs 直接模式
- 面试时一次只问一个问题——绝不批量询问多个问题
- 在询问用户之前，通过 `explore` 代理收集代码库事实
- 计划必须满足质量标准：80%+ 的声明引用文件/行号，90%+ 的标准是可测试的
- 共识模式默认完全自动化运行；添加 `--interactive` 可在草稿审查和最终批准步骤启用用户提示
- 共识模式默认使用 RALPLAN-DR 简短模式；当请求明确标记高风险（认证/安全、数据迁移、破坏性/不可逆变更、生产事故、合规/PII、公共 API 破坏）时，使用 `--deliberate` 切换到深思模式
- **规划/执行边界：** 规划模式仅检查上下文并生成计划/规格/提案。除非用户在当前轮次或通过结构化批准 UI 明确选择执行，否则它们必须将产物标记为 `pending approval`。在获得明确执行批准前，规划模式不得运行变更性的 shell 命令、编辑源文件、提交、推送、打开 PR、调用执行技能或委派实现任务。
- **Goal 工作流边界：** 当计划比较 Claude Code `/goal`、Ralph、Team、UltraQA 或仅产物的 Ultragoal 时，必须确定一个主循环权威，并使用确定性冲突策略 `refuse`、`adopt_existing` 和 `artifact_only`，而非非确定性警告处理。`/goal` 事实必须仅引用 Claude Code/Anthropic 来源（Claude Code `/goal` 文档：https://code.claude.com/docs/en/goal；Anthropic Claude Code 更新日志：https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md），且计划不得声称 `/goal` 评估器独立运行命令或读取文件；在声明完成前需要展示已呈现的证明证据。
- **Goal 工作流文档目标：** 面向用户的比较，保持示例与 `docs/shared/mode-selection-guide.md#goal-oriented-workflow-selection` 和 `docs/REFERENCE.md#goal-workflow-ux-goal-ralph-team-ultraqa-ultragoal` 一致。
  </Execution_Policy>

<Steps>

### 模式选择

| 模式 | 触发器 | 行为 |