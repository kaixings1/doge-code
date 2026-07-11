---
description: Choose and run the right statistical test for your data
argument-hint: "<describe what you want to test>"
---

# /test-hypothesis — Hypothesis Testing

Select the correct statistical test and run it with assumption checking.

## Invocation

```
/test-hypothesis Is there a significant difference in conversion rate between mobile and desktop?
/test-hypothesis [upload file] Compare average order value across 4 customer segments
/test-hypothesis Test whether the new feature increased engagement
```

## Workflow

### Step 1: Identify Question
Parse the research question — what's being compared, how many groups, data types.

### Step 2: Select & Check
Apply **hypothesis-test** skill — select test, check assumptions, recommend alternatives.

### Step 3: Run & Interpret
Execute the test, calculate effect size, generate plain-language interpretation.

Offer follow-up:
- "Want to **calculate sample size** for future tests with /calculate-sample?"
- "Need a **more detailed regression** with /regress?"
- "Want to **test more hypotheses** with multiple testing correction?"
