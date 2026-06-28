---
name: generate-synthetic-data
description: "Create realistic synthetic datasets for testing, prototyping, and demonstration. Supports tabular, time series, and relational data with configurable distributions, correlations, and anomalies. Use when you need test data, want to prototype an analysis, or need to share data without privacy concerns."
---

# Generate Synthetic Data

## Purpose
Create realistic synthetic datasets that mirror real-world data characteristics. Useful for prototyping analyses, testing pipelines, building demos, and sharing data without privacy risks.

## How It Works

### Step 1: Define the Schema
- Column names, data types, and descriptions
- Relationships between columns (foreign keys, correlations)
- Business constraints (e.g., revenue > 0, age between 18-100)
- Target variable distribution (for ML datasets)

### Step 2: Configure Data Properties
- **Distributions**: Normal, log-normal, uniform, Poisson, custom
- **Correlations**: Specify relationships between features
- **Missing data**: Inject realistic missing patterns (MCAR, MAR, MNAR)
- **Outliers**: Add configurable percentage of anomalous records
- **Temporal patterns**: Trends, seasonality, cyclicality for time series
- **Categories**: Realistic category distributions (Zipf's law for names, cities)

### Step 3: Generate Data
- Use Faker for realistic names, emails, addresses, company names
- Use numpy/scipy distributions for numeric columns
- Maintain referential integrity across related tables
- Generate in requested format: CSV, JSON, SQL INSERT, Parquet, pandas DataFrame

### Step 4: Validate Synthetic Data
- Compare summary statistics to specified parameters
- Verify correlations match expectations
- Check constraint satisfaction
- Visual comparison: distribution plots, correlation heatmaps

## Usage Examples

**Example 1: E-commerce dataset**
```
"Generate 10,000 rows of e-commerce transaction data with user_id,
product_category, price, quantity, date, and a 5% return rate.
Include seasonal trends in Q4."
```

**Example 2: From schema**
```
"Here's my database schema [upload]. Generate 5,000 realistic records
with proper foreign key relationships between tables."
```

**Example 3: ML training data**
```
"Create a binary classification dataset with 20 features,
30% class imbalance, and some noisy features for benchmarking models."
```

## Output Format

- **Dataset**: Generated data in requested format (CSV, JSON, SQL, DataFrame code)
- **Schema Documentation**: Column descriptions and data generation rules
- **Statistics Summary**: Descriptive stats confirming the data meets specifications
- **Python Code**: Reproducible generation script for regenerating with different seeds/sizes
