---
name: feature-selection
description: "Select the most important features: filter methods (mutual information, chi-squared), wrapper methods (recursive feature elimination), embedded methods (LASSO, tree importance), and SHAP-based selection. Use when reducing dimensionality, improving model performance, or identifying key drivers."
---

# Feature Selection

## Purpose
Select the most informative features to improve model performance, reduce overfitting, and increase interpretability.

## How It Works

### Method Categories

| Category | Methods | Speed | Considers Interactions? |
|----------|---------|-------|------------------------|
| **Filter** | Mutual info, chi², variance threshold | Fast | No |
| **Wrapper** | RFE, forward/backward selection | Slow | Yes |
| **Embedded** | LASSO, tree importance, elastic net | Medium | Partially |
| **SHAP-based** | SHAP importance, Boruta-SHAP | Slow | Yes |

### Step-by-Step
1. Remove zero-variance and near-zero-variance features
2. Remove highly correlated pairs (keep the one with higher target correlation)
3. Apply filter methods for initial ranking
4. Use embedded methods (LASSO, tree importance) for refined selection
5. Validate with RFE or SHAP for final feature set
6. Compare model performance: all features vs. selected features

## Usage Examples

```
"I have 200 features. Select the 20 most important for predicting churn."
```

```
"Which features can I drop without hurting model accuracy?"
```

## Output Format

- **Feature Ranking**: Importance scores per feature
- **Selected Features**: Final set with rationale
- **Comparison**: Model performance with all vs. selected features
- **Python Code**: sklearn / SHAP implementation
