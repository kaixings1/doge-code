---
description: 特征工程引导工作流 — 从原始数据创建预测特征
argument-hint: "<describe your data and modeling goal>"
---

# /engineer-features — Feature Engineering Workflow

Create powerful features from raw data for machine learning models.

## Invocation

```
/engineer-features Build features for a churn prediction model from user activity data
/engineer-features [upload file] Engineer features for a house price regression
/engineer-features What features can I create from these timestamp and categorical columns?
```

## Workflow

### Step 1: Understand the Problem
- What is the target variable? (classification, regression, clustering)
- What model will consume these features? (tree-based, linear, neural network)
- What raw features are available?

### Step 2: Analyze Raw Data
- Profile each column's distribution and relationship to target
- Identify high-cardinality categoricals, datetime columns, text fields
- Check for existing features that may need transformation

### Step 3: Engineer Features
Apply **feature-engineering** skill:
- Create features by type (numeric, categorical, datetime, text)
- Build interaction terms and domain-specific features
- Apply appropriate encoding strategies

### Step 4: Validate & Select
- Check for target leakage
- Quick feature importance ranking
- Remove zero-variance and highly correlated features
- Generate a scikit-learn Pipeline for reproducibility

Offer follow-up:
- "Ready to **train a model** with /train-model?"
- "Want to **evaluate feature importance** more deeply?"
- "Need to **add more features** from external data?"
