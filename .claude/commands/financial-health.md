---
name: 财务健康
description: "运行财务比率分析、DCF 估值、预算差异分析和滚动预测。用法: /financial-health <ratios|dcf|budget|forecast> <data.json>"
argument-hint: "<ratios|dcf|budget|forecast> <data.json>"
---

# /financial-health

分析财务报表、建立估值模型、评估预算差异并构建预测。

## Usage

```
/financial-health ratios <financial_data.json> [--format json|text]
/financial-health dcf <valuation_data.json> [--format json|text]
/financial-health budget <budget_data.json> [--format json|text]
/financial-health forecast <forecast_data.json> [--format json|text]
```

## Examples

```
/financial-health ratios quarterly_financials.json --format json
/financial-health dcf acme_valuation.json
/financial-health budget q1_budget.json --format json
/financial-health forecast revenue_history.json
```

## Scripts
- `finance/skills/financial-analyst/scripts/ratio_calculator.py` — Profitability, liquidity, leverage, efficiency, valuation ratios
- `finance/skills/financial-analyst/scripts/dcf_valuation.py` — DCF enterprise and equity valuation with sensitivity analysis
- `finance/skills/financial-analyst/scripts/budget_variance_analyzer.py` — Actual vs budget vs prior year variance analysis
- `finance/skills/financial-analyst/scripts/forecast_builder.py` — Driver-based revenue forecasting with scenario modeling

## Skill Reference
→ `finance/skills/financial-analyst/SKILL.md`

## Related Commands
- `/saas-health` — SaaS-specific metrics (ARR, MRR, churn, CAC, LTV, Quick Ratio)
