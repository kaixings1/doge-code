---
name: feature-engineering
description: "Create predictive features from raw data: encoding categorical variables, binning, polynomial features, interaction terms, date/time features, text features, and target encoding. Use when preparing data for machine learning models or enriching datasets for analysis."
---

# Feature Engineering

## Purpose
Transform raw data into informative features that improve model performance and analytical insight. Covers encoding, creation, selection, and validation of engineered features.

## How It Works

### Step 1: Analyze Raw Features
- Identify feature types: numeric, categorical, datetime, text, geospatial
- Check cardinality of categorical features
- Assess distributions and relationships with target variable
- Identify potential feature interactions

### Step 2: Engineer Features by Type

**Numeric Features:**
- Log/sqrt/Box-Cox transformations for skewed distributions
- Polynomial features and interaction terms
- Binning (equal-width, equal-frequency, domain-based)
- Ratios between related features (e.g., revenue per user)
- Rolling statistics (mean, std, min, max over windows)

**Categorical Features:**
- One-hot encoding (low cardinality, <15 categories)
- Label/ordinal encoding (ordered categories)
- Target encoding (high cardinality — mean target per category)
- Frequency encoding (category count as feature)
- Binary encoding / hashing (very high cardinality)
- Leave-one-out encoding (reduces target leakage)

**DateTime Features:**
- Extract: year, month, day, hour, day_of_week, quarter
- Cyclical encoding (sin/cos for hour, month)
- Time since events (days since signup, recency)
- Is_weekend, is_holiday, is_business_hours flags
- Seasonal decomposition components

**Text Features:**
- Bag of words / TF-IDF
- Text length, word count, special character ratio
- Sentiment scores
- Embedding vectors (sentence-transformers)

### Step 3: Validate Features
- Check for target leakage — feature must be available at prediction time
- Assess feature importance on a holdout set
- Monitor for multicollinearity (VIF > 10 is a concern)
- Verify that encoding is fit on training data, applied to test data

### Step 4: Generate Code
- scikit-learn Pipeline / ColumnTransformer for reproducibility
- Feature engineering as reusable transformers
- Documentation of each feature's business meaning

## Usage Examples

**Example 1: E-commerce churn model**
```
"Engineer features from this user activity data for a churn prediction model.
I have signup_date, last_login, purchase history, and support tickets."
```

**Example 2: Encoding strategy**
```
"My 'city' column has 500 unique values. What's the best encoding strategy
for a gradient boosting model?"
```

## Output Format

- **Feature Plan**: Description and rationale for each new feature
- **Python Code**: scikit-learn Pipeline implementation
- **Feature Importance Preview**: Quick validation of feature relevance
- **Leakage Check**: Confirmation that no target leakage exists
