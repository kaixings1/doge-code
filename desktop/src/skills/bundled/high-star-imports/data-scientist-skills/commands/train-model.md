---
description: End-to-end ML pipeline — select model, train, evaluate, interpret
argument-hint: "<describe prediction target and available data>"
---

# /train-model — ML Training Pipeline

Build a machine learning model from scratch to production-ready.

## Invocation

```
/train-model Predict customer churn from usage and demographic data
/train-model [upload file] Build the best model for predicting house prices
/train-model Classify support tickets into categories
```

## Workflow

### Step 1: Explore & Prepare
Quick EDA, handle missing values, engineer features.

### Step 2: Select Model
Apply **choose-model** skill — recommend algorithms based on problem type and data.

### Step 3: Train & Tune
Apply **classification** or **regression-ml** skill, then **hyperparameter-tuning**.

### Step 4: Evaluate
Apply **model-evaluation** skill — metrics, diagnostics, cross-validation.

### Step 5: Interpret
Apply **model-interpretation** skill — SHAP values, feature importance.

Offer follow-up:
- "Want to **tune hyperparameters further** with /tune?"
- "Should I **explain specific predictions** with /explain-model?"
- "Ready to **deploy** this model with /deploy?"
