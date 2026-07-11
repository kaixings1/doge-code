---
description: 交互式向导 — 设计 SLO（SLI、目标、错误预算、burn-rate 告警）
---

# /slo-design

使用 `slo-architect` 技能逐步设计 SLO。生成 SLO 定义，计算错误预算 + 多窗口燃烧率告警，并运行审查器以捕获常见错误。

## Usage

```
/slo-design
/slo-design --service checkout-svc --sli-type request-success-rate --target 99.9
```

## Implementation

```bash
SKILL=engineering/slo-architect/skills/slo-architect

# Step 1: gather inputs (service, sli-type, target, window, owner)
# Step 2: render SLO definition
python "$SKILL/scripts/slo_designer.py" \
  --service "$SERVICE" \
  --sli-type "$SLI_TYPE" \
  --target "$TARGET" \
  --window-days "$WINDOW_DAYS" \
  --owner "$OWNER" \
  --policy-doc "$POLICY_DOC" \
  --format json > .slo.json

# Step 3: compute error budget + burn-rate alerts
python "$SKILL/scripts/error_budget_calculator.py" \
  --target "$TARGET" \
  --window-days "$WINDOW_DAYS"

# Step 4: render the markdown SLO for peer review
python "$SKILL/scripts/slo_designer.py" \
  --service "$SERVICE" \
  --sli-type "$SLI_TYPE" \
  --target "$TARGET" \
  --window-days "$WINDOW_DAYS" \
  --owner "$OWNER" \
  --policy-doc "$POLICY_DOC"

# Step 5: validate against the reviewer
echo "=== After saving the SLO, run slo_review.py against the doc ==="
```

## Output

A markdown SLO definition with:

- Service, owner, user journey
- SLI type with numerator/denominator expressions
- Target, window, error budget
- Multi-window burn-rate alert thresholds (PromQL-shaped)
- Review cadence

## Pre-conditions

- `slo-architect` skill installed
- Service identified
- 30 days of historical SLI data available (to pick a sustainable target)
- Error budget policy doc exists or will be created

## Post-conditions

- `.slo.json` written for use with downstream tools (chaos-engineering blast radius, etc.)
- Markdown SLO streamed for review
- Recommendation printed: PASS / WARN / FAIL on `slo_review.py` checks
