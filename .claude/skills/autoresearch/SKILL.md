---
name: autoresearch
description: 带严格评估器契约、Markdown 决策日志和最大运行时间停止行为的持久化单任务改进循环。
argument-hint: "[--mission-dir <path>] [--max-runtime <duration>] [--cron <spec>] [--resume <run-id>]"
level: 4
---

<Purpose>
Autoresearch 是一个有状态技能，用于有界、由评估器驱动的迭代式改进。它一次只负责一个任务，对未通过的结果持续迭代，把每次评估与决策都记录为持久化产物，并且只在达到显式的最大运行时间上限或另一个显式终止条件时才停止。
</Purpose>

<Use_When>
- 你已经通过 `/deep-interview --autoresearch` 得到任务和评估器
- 你希望以严格评估进行持久的单任务改进
- 你需要在 `.omc/autoresearch/` 下留存持久化的实验日志
- 你希望通过 Claude Code 原生 cron 获得受支持的周期性重跑方式
</Use_When>

<Do_Not_Use_When>
- 你需要在运行时生成评估器 —— 请先使用 `/deep-interview --autoresearch`
- 你需要把多个任务编排在一起 —— v1 禁止这样做
- 你想要已弃用的 `omc autoresearch` CLI 流程 —— 它不再是权威做法
</Do_Not_Use_When>

<Contract>
- v1 中仅支持单任务
- 任务设置与评估器生成仍留在 `deep-interview --autoresearch`
- 评估器输出必须是结构化 JSON，含必填的布尔字段 `pass` 和可选的数值字段 `score`
- 未通过的迭代**不会**停止本次运行
- 停止条件是显式且有界的，其中最大运行时间作为主要的严格停止钩子
</Contract>

<Required_Artifacts>
规范的持久化存储位于 `.omc/autoresearch/<mission-slug>/` 和/或 `.omc/logs/autoresearch/<run-id>/` 之下。

最低要求的产物：
- 任务规格说明
- 评估器脚本或命令引用
- 每轮迭代的评估 JSON
- Markdown 决策日志

推荐的规范结构：
```text
.omc/autoresearch/<mission-slug>/
  mission.md
  evaluator.json
  runs/<run-id>/
    evaluations/
      iteration-0001.json
      iteration-0002.json
    decision-log.md
```
在已有可用的运行时产物时复用它们，而不是不必要地重复生成。
</Required_Artifacts>

<Workflow>
1. 确认只存在一个任务，且评估器设置已经可用。
2. 确保 `autoresearch` 的模式/状态处于激活状态，并记录：
   - 任务标识/目录
   - 评估器引用
   - 迭代次数
   - 开始/更新时间戳
   - 显式的最大运行时间或截止时间
3. 每轮迭代都要：
   - 只运行一个实验/变更周期
   - 运行评估器
   - 持久化机器可读的评估 JSON
   - 追加一条人类可读的 Markdown 决策日志条目
   - 即使评估未通过也继续
4. 在以下情况停止：
   - 达到最大运行时间上限
   - 用户显式取消
   - 运行时记录了另一个显式终止条件
</Workflow>

<Cron_Integration>
Claude Code 原生 cron 是受支持的集成点，可用于周期性增强任务。在 v1 中，优先记录/配置 cron 输入，而不是构建大型调度器 UI。

如果使用 cron：
- 每个调度作业只保留一个任务
- 保持相同的任务/评估器契约
- 追加新的运行产物，而不是覆盖此前的实验
</Cron_Integration>

<Execution_Policy>
- 不要把执行交回 `omc autoresearch`
- 不要创建多任务编排
- 在 `src/autoresearch/*` 的运行时/schema 辅助函数已经符合更严格契约的地方，优先复用它们
- 让日志对人类有用，而不只是对机器有用
</Execution_Policy>
