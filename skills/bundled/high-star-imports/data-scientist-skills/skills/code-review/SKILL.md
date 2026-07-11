---
name: code-review
description: "Review data science code for best practices: reproducibility, code quality, statistical correctness, data leakage detection, and documentation. Use when reviewing notebooks, scripts, or ML pipelines."
---
# Code Review

## Purpose
Review data science code for correctness, reproducibility, and best practices.

## Review Checklist

### Correctness
- [ ] Train/test split before any preprocessing (no data leakage)
- [ ] Cross-validation used appropriately
- [ ] Random seeds set for reproducibility
- [ ] Correct metric for the problem
- [ ] Statistical tests applied correctly

### Code Quality
- [ ] Functions are modular and reusable
- [ ] Variable names are descriptive
- [ ] Comments explain "why," not "what"
- [ ] No hardcoded values (use constants/config)
- [ ] Error handling for edge cases

### Reproducibility
- [ ] Requirements/environment specified
- [ ] Data access documented
- [ ] Results are deterministic (seeds, versions)
- [ ] README with run instructions

### Data Science Specific
- [ ] No target leakage in feature engineering
- [ ] Proper handling of categorical variables
- [ ] Missing data strategy documented
- [ ] Model evaluation on holdout set

## Usage Examples

```
"Review this Jupyter notebook for my churn prediction model"
```

## Output Format

- **Review Summary**: Pass/fail by category
- **Issues**: Prioritized list with severity
- **Suggestions**: Specific code improvements
- **Praise**: What's done well (important for morale!)
