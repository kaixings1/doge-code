---
description: 交互式向导 — 设计与验证混沌工程实验
---

# /chaos-experiment

使用 `chaos-engineering` 技能逐步设计混沌工程实验。生成计划、计算爆炸半径、验证中止条件，并输出可供同行评审的 Markdown 计划。

## 用法

```
/chaos-experiment
/chaos-experiment --target checkout-svc --attack latency
```

## 实现

```bash
SKILL=engineering/chaos-engineering/skills/chaos-engineering

# 步骤 1：交互式收集输入（目标、假设、攻击、规模等）
# 步骤 2：运行 experiment_designer.py 生成计划
python "$SKILL/scripts/experiment_designer.py" \
  --target "$TARGET" --hypothesis "$HYPOTHESIS" \
  --attack "$ATTACK" --magnitude "$MAGNITUDE" \
  --duration-min "$DURATION" \
  --abort-if "$ABORT" --owner "$OWNER" \
  --format json > .chaos-plan.json

# 步骤 3：根据团队的错误预算计算爆炸半径
python "$SKILL/scripts/blast_radius_calculator.py" \
  --traffic-share "$TRAFFIC_SHARE" \
  --user-pop "$USER_POP" \
  --duration-min "$DURATION" \
  --baseline-availability "$BASELINE_AVAIL" \
  --expected-impact-availability "$IMPACT_AVAIL"

# 步骤 4：渲染 Markdown 计划供同行评审
python "$SKILL/scripts/experiment_designer.py" \
  --target "$TARGET" --hypothesis "$HYPOTHESIS" \
  --attack "$ATTACK" --abort-if "$ABORT" --owner "$OWNER"
```

## 输出

包含以下内容的 Markdown 计划：

- 假设、稳态指标、攻击、规模、持续时间
- 爆炸半径（已计算）及风险评分（绿/黄/红）
- 从 `--abort-if` 解析的中止条件
- 回滚流程
- 监控仪表盘链接
- 学习问题

## 前置条件

- 已安装 `chaos-engineering` 技能
- 目标已确定
- 稳态指标和仪表盘可用
- 值班团队可用
- 错误预算已知（或使用默认值）

## 后置条件

- 写入 `.chaos-plan.json` 供后续与 `experiment_postmortem.py` 配合使用
- Markdown 计划已输出供审查
- 打印建议：继续 / 缩减 / 中止
