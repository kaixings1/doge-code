---
name: ci-cd-ml
description: "Set up CI/CD for ML projects: automated testing (data validation, model quality gates), model registry integration, staged deployment (shadow, canary, blue-green), and rollback strategies. Use when establishing MLOps practices."
---
# CI/CD for ML

## Purpose
Automate testing, validation, and deployment of ML models with proper quality gates.

## How It Works

### ML-Specific CI Checks
- Data validation (schema, distribution, quality)
- Training reproducibility (same data → same model ± tolerance)
- Model quality gates (accuracy > threshold, no regression)
- Performance benchmarks (latency, memory, throughput)
- Bias and fairness checks

### Deployment Strategies

| Strategy | Risk | Complexity |
|----------|------|-----------|
| Shadow mode | Zero | Medium |
| Canary (1% → 10% → 100%) | Low | Medium |
| Blue-green | Low | High |
| A/B test | Low | High |

### Pipeline Structure
1. Code change → trigger CI
2. Run linting, unit tests, integration tests
3. Train model on test data subset
4. Evaluate against quality gates
5. Deploy to staging → run integration tests
6. Progressive rollout to production

## Usage Examples

```
"Set up GitHub Actions CI for our ML project with model quality gates"
```

## Output Format

- **CI/CD Pipeline**: GitHub Actions / GitLab CI configuration
- **Quality Gates**: Test definitions and thresholds
- **Deployment Strategy**: Rollout plan with rollback
- **Python Code**: Test scripts and validation checks
