# 数据契约：代理间通信 Schema

自我改进循环中各代理之间交换的全部消息的规范 JSON schema。

## 1. 计划文档

**生产者：** 规划器 | **消费者：** critic、执行器

```json
{
  "plan_id": "round_{N}_{planner_id}",
  "planner_id": "planner_a|planner_b|planner_c",
  "round": 1,
  "hypothesis": "执行 X 应当改进 Y，因为 Z",
  "approach_family": "<taxonomy value>",
  "critic_approved": false,
  "target_files": ["path/to/file1"],
  "steps": [
    { "step": 1, "file": "path/to/file", "change": "精确描述" }
  ],
  "expected_outcome": {
    "metric": "<metric from goal>",
    "estimated_impact": "<quantified estimate>",
    "rationale": "<why>",
    "sub_score_expectations": {}
  },
  "history_reference": {
    "builds_on": "<prior success or 'none'>",
    "avoids": "<prior failure or 'none'>"
  },
  "critic_review": {
    "h001_hypothesis_count": "pass|fail",
    "h002_family_streak": "pass|fail",
    "h003_intra_round_diversity": "pass|fail",
    "schema_valid": "pass|fail",
    "history_aware": "pass|fail",
    "verdict": "approved|rejected",
    "rejection_reason": null
  },
  "architect_review": {
    "verdict": "approve|reject",
    "feedback": "",
    "structural_concerns": []
  }
}
```

## 2. 基准结果

**生产者：** 执行器 | **消费者：** 锦标赛（SKILL.md）

```json
{
  "executor_id": "executor_{id}",
  "plan_id": "round_{n}_planner_{x}",
  "benchmark_score": 85.2,
  "benchmark_raw": "完整 stdout 原文",
  "status": "success|regression|error|timeout",
  "sub_scores": { "dim_a": 85.2, "dim_b": 42.3 },
  "failure_analysis": null,
  "timestamp": "ISO 8601 UTC"
}
```

**状态定义：**
- `success` —— 分数提升或持平
- `regression` —— 分数跌破基线
- `error` —— 基准无法运行
- `timeout` —— 超出时间限制

## 3. 研究简报

**生产者：** 研究者 | **消费者：** 规划器

```json
{
  "iteration": 1,
  "researcher_id": "researcher",
  "repo_analysis_summary": "...",
  "ideas": [
    {
      "title": "简短的动作名",
      "source": "具体来源",
      "evidence": "确凿证据",
      "approach_family": "<taxonomy value>",
      "confidence": "high|medium|low",
      "estimated_impact": "3-5%"
    }
  ]
}
```

## 4. 迭代历史记录

**生产者：** 编排器 | **消费者：** 规划器、研究者

```json
{
  "iteration": 1,
  "baseline_score": 80.0,
  "winner": {
    "plan_id": "round_1_planner_a",
    "score": 85.2,
    "approach_family": "training_config",
    "hypothesis": "...",
    "sub_scores": {}
  },
  "losers": [
    {
      "plan_id": "round_1_planner_b",
      "score": 78.5,
      "approach_family": "architecture",
      "hypothesis": "...",
      "sub_scores": {},
      "failure_analysis": {
        "what": "分数下降",
        "why": "根本原因",
        "category": "regression",
        "lesson": "可执行的教训"
      }
    }
  ],
  "research_brief_id": "round_1"
}
```

## 5. 可视化数据

**文件：** `<self-improve-root>/tracking/raw_data.json` —— 顶层 JSON 数组，只追加。

```json
[
  {
    "iteration": 1,
    "plan_id": "round_1_planner_a",
    "benchmark_score": 85.2,
    "is_winner": true,
    "approach_family": "training_config",
    "sub_scores": {}
  }
]
```

## 6. 方法族分类

| 标签 | 描述 |
|-----|-------------|
| `architecture` | 模型/组件结构变更 |
| `training_config` | 优化器、学习率、调度器、批大小、训练轮数 |
| `data` | 数据加载、增强、预处理 |
| `infrastructure` | 混合精度、分布式训练、检查点保存 |
| `optimization` | 算法/数值优化 |
| `testing` | 评估方法论变更 |
| `documentation` | 纯文档变更 |
| `other` | 不符合以上各项 —— 需在证据中说明 |

来自 harness.md 的自定义方法族同样有效。

## 7. 失败分析对象

```json
{
  "what": "带分数/错误的事实性描述",
  "why": "根本原因机制",
  "category": "oom|timeout|regression|logic_error|scope_error|infrastructure|benchmark_parse_error|sealed_file_violation",
  "lesson": "给未来规划器的可执行教训"
}
```

## 8. 迭代状态

**文件：** `<self-improve-root>/state/iteration_state.json` —— 跟踪迭代内的进度。

```json
{
  "iteration": 1,
  "status": "in_progress|completed|failed|interrupted",
  "current_step": "research|planning|critic_review|execution|tournament|recording|stop_check",
  "started_at": "ISO 8601",
  "updated_at": "ISO 8601",
  "research": { "status": "pending|in_progress|completed|failed", "output_path": null, "completed_at": null },
  "planning": {
    "status": "pending|in_progress|completed",
    "plans": {
      "planner_a": { "status": "completed", "output_path": "...", "critic_approved": true }
    },
    "approved_count": 2,
    "completed_at": null
  },
  "execution": {
    "status": "pending|in_progress|completed",
    "executors": {
      "executor_1": { "status": "running", "plan_id": "...", "output_path": null, "benchmark_score": null }
    },
    "completed_at": null
  },
  "tournament": { "status": "pending", "winner": null, "winner_score": null, "completed_at": null },
  "recording": { "status": "pending", "history_path": null, "visualization_updated": false, "cleanup_done": false },
  "user_ideas_consumed": []
}
```

## 9. 合并报告

**生产者：** 锦标赛（SKILL.md）| **消费者：** 编排器

```json
{
  "iteration": 3,
  "goal_slug": "reduce_latency",
  "winner": {
    "executor_id": "executor_2",
    "branch": "experiment/round_3_executor_2",
    "hypothesis": "缓存中间结果",
    "score_before": 142.3,
    "score_after": 118.7,
    "sub_scores": {}
  },
  "archived": ["archive/round_3_executor_1"],
  "regressions_detected": false,
  "re_benchmark_score": 118.7,
  "status": "merged|no_improvement|no_winner|all_rejected",
  "reason": null
}
```

**状态定义：**
- `merged` —— 有候选被合并，且重跑基准确认了改进
- `no_improvement` —— 存在候选且已测试，但重跑基准全部失败（未发生合并）
- `no_winner` —— 所有执行器都失败或产出了非成功状态（没有可评估的候选）
- `all_rejected` —— 所有计划都被 critic 拒绝（执行被跳过）

当状态不是 `merged` 时，`reason` 为必填（字符串）；为 `merged` 时为 null。
```

## 10. 计划归档

**位置：** `<self-improve-root>/state/plan_archive/round_{n}/`

所有计划 JSON 文件的精确副本，包含 critic 与 architect 评审。永久保留。

## 11. 事件日志

**文件：** `<self-improve-root>/tracking/events.json` —— 只追加的数组。

```json
[
  {
    "timestamp": "ISO 8601",
    "event_type": "config_change|phase_transition",
    "iteration": 5,
    "details": {
      "field": "number_of_agents",
      "old_value": 2,
      "new_value": 3,
      "source": "user"
    }
  }
]
```

## 12. 目标阶段

定义在 goal.md 的 `## Phases` 下。在 agent-settings.json 中以 `current_phase` 跟踪。

```markdown
## Phases
| 阶段 | 重点 | 子分数目标 | 状态 |
|-------|-------|-------------------|--------|
| phase_1 | 主要维度 | dim_a >= 90.0 | active |
| phase_2 | 次要维度 | dim_b <= 50.0 | pending |
```

阶段转换会被记录为事件，但不影响锦标赛选择。
