---
name: hyperparameter-tuning
description: "Optimize model hyperparameters: grid search, random search, Bayesian optimization (Optuna), Hyperband, and early stopping strategies. Includes search space design and overfitting prevention. Use when improving model performance beyond default settings."
---

# Hyperparameter Tuning

## Purpose
Find optimal hyperparameters efficiently while avoiding overfitting through proper cross-validation and search strategies.

## How It Works

### Step 1: Define Search Space
- Identify tunable hyperparameters for your model
- Set reasonable ranges based on rules of thumb
- Use log-uniform distributions for learning rates and regularization

### Step 2: Choose Search Strategy

| Method | Speed | Quality | When to Use |
|--------|-------|---------|-------------|
| Grid Search | Slow | Exhaustive | <4 hyperparams, small space |
| Random Search | Fast | Good | First pass, large spaces |
| Bayesian (Optuna) | Smart | Best | Production tuning, expensive models |
| Hyperband | Fast | Good | Neural networks (early stopping) |
| Successive Halving | Fast | Good | Large candidate sets |

### Step 3: Cross-Validation Strategy
- K-fold (standard)
- Stratified K-fold (imbalanced classes)
- TimeSeriesSplit (temporal data)
- Group K-fold (prevent data leakage between groups)
- Nested CV (unbiased performance estimate during tuning)

### Step 4: Tune & Evaluate
- Run optimization with chosen strategy
- Monitor for overfitting (train vs. validation gap)
- Check if best params are at search boundary (expand range?)
- Report: best params, CV score, improvement over baseline

## Usage Examples

```
"Tune my XGBoost classifier for AUC-ROC using Optuna with 100 trials"
```

```
"What hyperparameters should I tune for a Random Forest,
and what ranges should I search?"
```

## Output Format

- **Best Hyperparameters**: Optimal values with CV score
- **Search Summary**: Trials run, improvement over default
- **Visualization**: Optimization history, parameter importance
- **Python Code**: Optuna / sklearn GridSearch implementation
