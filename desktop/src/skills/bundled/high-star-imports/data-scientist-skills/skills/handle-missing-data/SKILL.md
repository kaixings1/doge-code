---
name: handle-missing-data
description: "Advanced missing data imputation strategies: MICE, KNN imputation, regression imputation, domain-aware methods, and missingness mechanism analysis. Use when simple fill strategies aren't sufficient or when missing data patterns need careful treatment for modeling."
---

# Handle Missing Data

## Purpose
Apply advanced imputation techniques that preserve statistical properties and relationships in your data. Goes beyond simple mean/median fills to handle complex missing data patterns.

## How It Works

### Step 1: Diagnose the Missingness Mechanism
- **MCAR** (Missing Completely At Random): Missingness unrelated to any variable — Little's test
- **MAR** (Missing At Random): Missingness depends on observed variables — logistic regression test
- **MNAR** (Missing Not At Random): Missingness depends on the missing value itself — domain knowledge required
- Visualize missing patterns with a nullity matrix and dendrogram

### Step 2: Choose the Strategy

| Mechanism | Data Type | Recommended Strategy |
|-----------|-----------|---------------------|
| MCAR | Numeric | Mean/median, KNN, or MICE |
| MCAR | Categorical | Mode or random sampling from distribution |
| MAR | Numeric | MICE, regression imputation, or KNN |
| MAR | Categorical | MICE or logistic regression imputation |
| MNAR | Any | Domain-specific model, sensitivity analysis, or Heckman correction |

### Step 3: Implement Imputation
- **KNN Imputation**: Find k nearest neighbors using observed features, impute from their values
- **MICE** (Multiple Imputation by Chained Equations): Iteratively impute each variable using others as predictors
- **Regression Imputation**: Predict missing values using a regression model on observed features
- **Hot-Deck**: Sample from similar complete records
- **Domain-Aware**: Apply business rules (e.g., missing revenue = $0 for free-tier users)

### Step 4: Validate Imputation Quality
- Compare distributions before and after (KS test, QQ plots)
- Check that correlations are preserved
- Run the downstream analysis with and without imputation — sensitivity analysis
- For MICE: check convergence across iterations

### Step 5: Generate Code
- Produce production-ready Python code using `sklearn.impute`, `fancyimpute`, or custom logic
- Include a missingness indicator column option (useful for ML models)
- Add logging and validation checks

## Usage Examples

**Example 1: Survey data with structured missingness**
```
"This survey dataset has 15% missing responses in the income column —
respondents with higher education tend to skip it. What's the best approach?"
```

**Example 2: Time series with gaps**
```
"My sensor data has gaps of 1-3 hours. Should I interpolate,
forward-fill, or use something more sophisticated?"
```

**Example 3: ML preprocessing**
```
"I'm building a churn model. 8% of the 'last_login' feature is missing.
What imputation method will give me the best model performance?"
```

## Output Format

- **Missingness Profile**: Mechanism classification per column with evidence
- **Strategy Recommendation**: Chosen method with rationale
- **Python Code**: Implementation using scikit-learn / fancyimpute / pandas
- **Validation Report**: Distribution comparisons and correlation preservation checks
- **Sensitivity Analysis**: Impact of different strategies on downstream results
