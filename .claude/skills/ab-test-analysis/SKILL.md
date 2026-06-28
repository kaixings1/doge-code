---
name: A/B测试分析
description: "通过统计显著性、样本量验证、置信区间以及发布/扩展/停止建议来分析 A/B 测试结果。适用于评估实验结果或决定是否发布变体。"
---
# A/B Test Analysis

## Purpose
Evaluate A/B test results with statistical rigor and translate findings into clear product decisions.

## How It Works

### Step 1: Validate Test Setup
- Sample size adequacy (power analysis)
- Duration (≥1-2 full business cycles)
- Randomization check (sample ratio mismatch)
- Novelty/primacy effect assessment

### Step 2: Calculate Results
- Conversion rates for control and variant
- Relative lift: (variant - control) / control × 100
- p-value (two-tailed z-test or chi-squared)
- 95% confidence interval for the difference
- Statistical and practical significance

### Step 3: Interpret

| Outcome | Recommendation |
|---------|---------------|
| Significant positive lift, no guardrail issues | **Ship it** |
| Significant positive, guardrail concerns | **Investigate** |
| Not significant, positive trend | **Extend the test** |
| Not significant, flat | **Stop** — no effect |
| Significant negative | **Don't ship** — revert |

### Step 4: Report
```
## A/B Test: [Name]
**Hypothesis**: [Expected outcome]
**Duration**: [X days] | **Sample**: [N control / M variant]

| Metric | Control | Variant | Lift | p-value | Significant? |
|--------|---------|---------|------|---------|-------------|
| [Primary] | X% | Y% | +Z% | 0.0X | Yes/No |
| [Guardrail] | ... | ... | ... | ... | ... |

**Recommendation**: [Ship / Extend / Stop]
```

## Usage Examples

```
"Analyze our checkout A/B test: control 3.2% conversion (n=5000), variant 3.8% (n=5000)"
```

## Output Format

- **Results Table**: Metrics with significance indicators
- **Recommendation**: Ship/extend/stop with reasoning
- **Python Code**: Statistical calculations
