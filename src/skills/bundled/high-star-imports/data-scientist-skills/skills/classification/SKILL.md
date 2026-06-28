---
name: classification
description: "Build classification models: logistic regression, decision trees, random forest, XGBoost, LightGBM, SVM, and KNN. Includes class imbalance handling, threshold tuning, and multi-class strategies. Use when predicting categories from features."
---

# Classification

## Purpose
Build, train, and evaluate classification models with proper handling of imbalanced classes, threshold optimization, and multi-class strategies.

## How It Works

### Step 1: Problem Setup
- Binary vs. multi-class vs. multi-label
- Class distribution analysis (imbalance detection)
- Train/validation/test split strategy (stratified)

### Step 2: Handle Class Imbalance
- **Resampling**: SMOTE, ADASYN (oversample minority), random undersampling
- **Class weights**: Adjust loss function (class_weight='balanced')
- **Threshold tuning**: Optimize decision threshold for business metric
- **Ensemble**: BalancedRandomForest, EasyEnsemble

### Step 3: Train Models
- Start with logistic regression (baseline)
- Try tree-based: Random Forest, XGBoost, LightGBM
- Consider SVM for high-dimensional data
- Use cross-validation for reliable estimates

### Step 4: Evaluate
- **Metrics**: Accuracy, precision, recall, F1, AUC-ROC, AUC-PR
- **Confusion matrix**: TP, FP, TN, FN breakdown
- **Classification report**: Per-class metrics
- **Calibration curve**: Probability reliability
- **Learning curves**: Bias-variance diagnosis

### Step 5: Optimize Threshold
- Plot precision-recall curve
- Find optimal threshold for business objective (minimize false negatives vs. false positives)
- Report metrics at chosen threshold

## Usage Examples

```
"Build a churn prediction model — only 5% of users churn,
so the data is highly imbalanced"
```

```
"Classify customer support tickets into 8 categories"
```

## Output Format

- **Model Comparison**: Metrics table across models
- **Best Model**: Configuration, hyperparameters, performance
- **Confusion Matrix**: Visual with per-class analysis
- **Feature Importance**: Top predictive features
- **Python Code**: Complete sklearn / XGBoost pipeline
