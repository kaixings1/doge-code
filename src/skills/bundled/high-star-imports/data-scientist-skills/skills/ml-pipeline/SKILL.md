---
name: ml-pipeline
description: "Build reproducible ML pipelines: data ingestion, feature engineering, training, evaluation, and deployment as automated workflows using Airflow, Prefect, Dagster, or Kubeflow. Use when automating the ML lifecycle."
---
# ML Pipeline

## Purpose
Build automated, reproducible ML pipelines that handle the full lifecycle from data to deployment.

## How It Works

### Step 1: Design Pipeline Stages
1. Data ingestion and validation
2. Feature engineering and transformation
3. Model training and hyperparameter tuning
4. Model evaluation and comparison
5. Model registration and deployment
6. Monitoring and feedback loop

### Step 2: Choose Orchestrator

| Tool | Best For | Complexity |
|------|----------|-----------|
| Prefect | Python-native, modern | Low |
| Airflow | Industry standard, DAGs | Medium |
| Dagster | Data-aware, testing | Medium |
| Kubeflow | Kubernetes-native, scale | High |
| ZenML | ML-specific, portable | Low |

### Step 3: Implement
- Define tasks/steps as modular functions
- Handle dependencies and data passing
- Add retry logic and error handling
- Parameterize for different environments (dev/staging/prod)

### Step 4: Operationalize
- Schedule recurring runs
- Set up alerts for failures
- Version pipeline definitions
- Monitor pipeline performance

## Usage Examples

```
"Design an ML pipeline that retrains our model weekly with new data"
```

```
"Build a Prefect pipeline for our feature engineering + training workflow"
```

## Output Format

- **Pipeline Architecture**: DAG diagram with stages
- **Implementation Code**: Orchestrator-specific pipeline definition
- **Configuration**: Scheduling, retry, and alert setup
- **Testing Strategy**: How to test pipeline components
