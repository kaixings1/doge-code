---
name: regression-analysis
description: "Build and diagnose regression models: linear, logistic, polynomial, ridge, LASSO, elastic net. Includes assumption diagnostics, multicollinearity detection, residual analysis, and model comparison. Use when predicting outcomes, understanding variable relationships, or quantifying effects."
---

# Regression Analysis

## Purpose
Build, diagnose, and interpret regression models. Covers the full workflow from model specification through diagnostics to interpretation.

## How It Works

### Step 1: Model Selection

| Outcome Type | Method |
|-------------|--------|
| Continuous | Linear regression, Ridge, LASSO |
| Binary | Logistic regression |
| Count | Poisson, Negative Binomial |
| Ordinal | Ordinal logistic regression |
| Multi-class | Multinomial logistic regression |

### Step 2: Build Model
- Feature selection (forward, backward, stepwise)
- Regularization if needed (Ridge/LASSO/Elastic Net)
- Interaction terms and polynomial features
- Handle categorical variables (dummy coding, effect coding)

### Step 3: Diagnostics
- **Linearity**: Residual vs. fitted plot
- **Normality of residuals**: QQ plot, Shapiro-Wilk
- **Homoscedasticity**: Breusch-Pagan, White test
- **Independence**: Durbin-Watson (time series)
- **Multicollinearity**: VIF scores
- **Influential observations**: Cook's distance, leverage plots
- **Outliers**: Studentized residuals

### Step 4: Interpret
- Coefficient table with CIs and p-values
- R², adjusted R², AIC, BIC
- Feature importance ranking
- Marginal effects for logistic regression
- Prediction intervals for new data

## Usage Examples

```
"Build a linear regression to predict house prices from square footage,
bedrooms, and neighborhood — check all assumptions"
```

```
"Run a logistic regression to identify factors predicting churn"
```

## Output Format

- **Model Summary**: Coefficients, standard errors, p-values, CIs
- **Fit Metrics**: R², adjusted R², AIC, BIC, RMSE
- **Diagnostic Plots**: Residuals, QQ, leverage, VIF
- **Interpretation**: Plain-language effect descriptions
- **Python Code**: statsmodels / sklearn implementation

---

### Further Reading

- James, Witten, Hastie, Tibshirani — *An Introduction to Statistical Learning*
