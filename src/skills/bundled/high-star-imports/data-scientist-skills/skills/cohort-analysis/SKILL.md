---
name: cohort-analysis
description: "Perform cohort analysis on user engagement data: retention curves, feature adoption by cohort, engagement trends, and lifecycle analysis. Use when analyzing user retention, onboarding effectiveness, or product stickiness."
---
# Cohort Analysis

## Purpose
Track how groups of users (cohorts) behave over time to understand retention, engagement, and lifecycle patterns.

## How It Works

### Step 1: Define Cohorts
- **Time-based**: Users grouped by signup week/month
- **Behavioral**: Users grouped by first action or acquisition channel
- **Custom**: Any meaningful grouping

### Step 2: Build Retention Table
- Row: cohort (e.g., signup month)
- Column: period (e.g., month 0, 1, 2, ...)
- Cell: % of cohort still active

### Step 3: Analyze Patterns
- Retention curves by cohort (improving or degrading?)
- Drop-off points (where do most users leave?)
- Feature adoption by cohort (are new users adopting faster?)
- Power user identification (who stays past month 3?)

### Step 4: Insights
- Compare cohorts to identify what changed
- Calculate average LTV by cohort
- Identify the "aha moment" retention inflection

## Usage Examples

```
"Build monthly retention cohorts for users who signed up in the last 12 months"
```

## Output Format

- **Retention Table**: Heatmap with percentages
- **Retention Curves**: Line chart by cohort
- **Key Metrics**: Average retention at 1/3/6/12 months
- **Python Code**: pandas implementation
