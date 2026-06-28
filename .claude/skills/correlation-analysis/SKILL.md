---
name: 相关性分析
description: "相关分析：Pearson、Spearman、Kendall Tau、点双列和偏相关。包含相关矩阵、热力图和假设检验。"
---

# Correlation Analysis

## Purpose
Identify and interpret relationships between variables. Detects multicollinearity, ranks feature importance by association, and visualizes the correlation structure.

## How It Works

### Step 1: Choose Correlation Method
- **Pearson**: Linear relationships between continuous variables
- **Spearman**: Monotonic relationships (robust to outliers and non-linearity)
- **Kendall**: Ordinal data or small sample sizes
- **Cramér's V**: Association between categorical variables
- **Point-biserial**: Continuous vs. binary variable

### Step 2: Compute Correlation Matrix
- Full pairwise correlation with p-values
- Highlight significant correlations (p < 0.05)
- Flag strong correlations (|r| > 0.7) and multicollinearity (|r| > 0.8)

### Step 3: Advanced Analysis
- **Partial correlations**: Control for confounding variables
- **VIF** (Variance Inflation Factor): Quantify multicollinearity severity
- **Correlation clusters**: Group variables that move together (hierarchical clustering on correlations)

### Step 4: Visualization
- Annotated heatmap with hierarchical clustering
- Pair plots for top correlated pairs
- Network graph for complex correlation structures

### Step 5: Recommendations
- Which correlated features to drop or combine before modeling
- Features most associated with the target variable
- Unexpected correlations worth investigating

## Usage Examples

```
"Which features are most correlated with customer churn?
Flag any multicollinearity issues."
```

```
"Create a correlation matrix for all numeric features, and
tell me which pairs I should investigate further"
```

## Output Format

- **Correlation Matrix**: Annotated heatmap with significance markers
- **Top Pairs**: Ranked list of strongest correlations with interpretation
- **Multicollinearity Report**: VIF scores with drop recommendations
- **Target Correlations**: Features ranked by association with target
- **Python Code**: Reproducible analysis script
