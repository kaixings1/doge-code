---
name: mle-workflow
description: 机器学习工程师工作流
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Machine Learning Engineering Workflow

Use this skill to turn model work into a production ML system with clear data contracts, repeatable training, measurable quality gates, deployable artifacts, and operational monitoring.

## When to Activate

- Planning or reviewing a production ML feature, model refresh, ranking system, recommender, classifier, embedding workflow, or forecasting pipeline
- Converting notebook code into a reusable training, evaluation, batch inference, or online inference pipeline
- Designing model promotion criteria, offline/online evals, experiment tracking, or rollback paths
- Debugging failures caused by data drift, label leakage, stale features, artifact mismatch, or inconsistent training and serving logic
- Adding model monitoring, canary rollout, shadow traffic, or post-deploy quality checks

## Scope Calibration

Use only the lanes that fit the system in front of you. This skill is useful for ranking, search, recommendations, classifiers, forecasting, embeddings, LLM workflows, anomaly detection, and batch analytics, but it should not force one architecture onto all of them.

- Do not assume every model has supervised labels, online serving, a feature store, PyTorch, GPUs, human review, A/B tests, or real-time feedback.
- Do not add heavyweight MLOps machinery when a data contract, baseline, eval script, and rollback note would make the change reviewable.
- Do make assumptions explicit when the project lacks labels, delayed outcomes, slice definitions, production traffic, or monitoring ownership.
- Treat examples as interchangeable scaffolds. Replace metrics, serving mode, data stores, and rollout mechanics with the project-native equivalents.

## Related Skills

- `python-patterns` and `python-testing` for Python implementation and pytest coverage
- `pytorch-patterns` for deep learning models, data loaders, device handling, and training loops
- `eval-harness` and `ai-regression-testing` for promotion gates and agent-assisted regression checks
- `database-migrations`, `postgres-patterns`, and `clickhouse-io` for data storage and analytics surfaces
- `deployment-patterns`, `docker-patterns`, and `security-review` for serving, secrets, containers, and production hardening

## Reuse the SWE Surface

Do not treat MLE as separate from software engineering. Most ECC SWE workflows apply directly to ML systems, often with stricter failure modes:

The recommended `minimal --with capability:machine-learning` install keeps the core agent surface available alongside this skill. For skill-only or agent-limited harnesses, pair `skill:mle-workflow` with `agent:mle-reviewer` where the target supports agents.

| SWE surface | MLE use |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 33 MINUTES 21 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE