---
name: bayesian-analysis
description: "Bayesian statistical inference: prior selection, posterior computation, MCMC sampling, credible intervals, Bayesian A/B testing, and model comparison with Bayes factors. Use when you need to incorporate prior knowledge, quantify uncertainty, or make sequential decisions."
---

# Bayesian Analysis

## Purpose
Apply Bayesian inference to estimate parameters, compare models, and make decisions under uncertainty with natural probability statements.

## How It Works

### Step 1: Formulate the Model
- Define the likelihood function (data generating process)
- Choose prior distributions (informative, weakly informative, non-informative)
- Specify the parameters of interest

### Step 2: Compute the Posterior
- **Conjugate priors**: Closed-form posterior (Beta-Binomial, Normal-Normal)
- **MCMC**: PyMC, Stan, NumPyro for complex models
- **Variational inference**: Approximate posterior for large datasets
- Diagnostics: trace plots, R-hat, effective sample size, divergences

### Step 3: Summarize Results
- Posterior mean, median, mode
- Credible intervals (HDI — Highest Density Interval)
- Posterior predictive checks
- Probability of hypothesis (P(θ > 0 | data))

### Step 4: Model Comparison
- Bayes factors
- WAIC, LOO-CV for predictive performance
- Posterior predictive checks

## Usage Examples

```
"Run a Bayesian A/B test — 1000 visitors saw variant A (50 converted),
1200 saw variant B (72 converted). What's the probability B is better?"
```

```
"Estimate the churn rate with a Bayesian model — we have prior belief
it's around 5% from historical data"
```

## Output Format

- **Posterior Summary**: Mean, median, HDI for each parameter
- **Visualization**: Posterior distributions, trace plots, forest plots
- **Probability Statements**: P(hypothesis | data) in plain language
- **Python Code**: PyMC / arviz implementation
