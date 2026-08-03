---
name: causal-inference
description: "Estimate causal effects from observational data: difference-in-differences, propensity score matching, instrumental variables, regression discontinuity, and synthetic control. Use when you need to go beyond correlation to establish causation without a randomized experiment."
---

# Causal Inference

## Purpose
Estimate causal effects from observational data when A/B tests aren't feasible. Applies quasi-experimental methods to address confounding and selection bias.

## How It Works

### Step 1: Frame the Causal Question
- Define treatment, outcome, and potential confounders
- Draw a causal DAG (Directed Acyclic Graph)
- Identify the estimation strategy based on data structure

### Step 2: Choose Method

| Situation | Method |
|-----------|--------|
| Pre/post with control group | Difference-in-Differences (DiD) |
| Observable confounders | Propensity Score Matching (PSM) |
| Threshold-based treatment | Regression Discontinuity (RD) |
| Natural experiment available | Instrumental Variables (IV) |
| Single treated unit | Synthetic Control |
| Time series intervention | Interrupted Time Series (ITS) |

### Step 3: Implement
- Check identifying assumptions (parallel trends, overlap, exclusion restriction)
- Estimate the treatment effect (ATE, ATT, LATE)
- Sensitivity analysis for unmeasured confounding (Rosenbaum bounds)

### Step 4: Validate
- Placebo tests (fake treatment periods/groups)
- Falsification tests (outcomes that shouldn't be affected)
- Robustness checks (different specifications, bandwidths)

## Usage Examples

```
"Did our pricing change in March cause revenue to increase,
or was it a seasonal effect? We have data from similar markets."
```

```
"Estimate the causal impact of our loyalty program on retention
using propensity score matching."
```

## Output Format

- **Causal Estimate**: Treatment effect with confidence interval
- **Assumptions Check**: Validity of identifying assumptions
- **Sensitivity Analysis**: How robust is the result to violations
- **Visualization**: Effect plots, parallel trends, balance diagnostics
- **Python Code**: DoWhy / EconML / statsmodels implementation

---

### Further Reading

- Angrist & Pischke — *Mostly Harmless Econometrics*
- Cunningham — *Causal Inference: The Mixtape*
- Huntington-Klein — *The Effect*
