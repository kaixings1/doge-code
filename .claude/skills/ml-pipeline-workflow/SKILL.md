---
name: ml-pipeline-工作流
description: "从数据准备到模型部署的完整端到端 MLOps 流水线编排。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# ML Pipeline 工作流

Complete end-to-end MLOps pipeline orchestration from data preparation through model 部署.

## 不要使用此技能的场景

- The task is unrelated to ml pipeline 工作流
- You need a different domain or tool outside this scope

## 使用说明

- Clarify goals, constraints, and required inputs.
- Apply relevant 最佳实践 and validate outcomes.
- Provide actionable steps and verification.
- If detailed 示例 are required, open `resources/implementation-playbook.md`.

## 概述

This skill provides comprehensive guidance for building production ML pipelines that handle the full lifecycle: data ingestion → preparation → training → validation → 部署 → monitoring.

## 使用此技能的场景

- Building new ML pipelines from scratch
- Designing 工作流 orchestration for ML systems
- Implementing data → model → 部署 automation
- Setting up reproducible training workflows
- Creating DAG-based ML orchestration
- Integrating ML components into production systems

## What This Skill Provides

### Core 能力

1. **Pipeline Architecture**
   - End-to-end 工作流 design
   - DAG orchestration patterns (Airflow, Dagster, Kubeflow)
   - Component dependencies and data flow
   - Error handling and retry strategies

2. **Data Preparation**
   - Data validation and quality checks
   - Feature engineering pipelines
   - Data versioning and lineage
   - Train/validation/test splitting strategies

3. **Model Training**
   - Training job orchestration
   - Hyperparameter management
   - Experiment tracking 集成
   - Distributed training patterns

4. **Model Validation**
   - Validation frameworks and metrics
   - A/B testing infrastructure
   - Performance regression detection
   - Model comparison workflows

5. **部署 Automation**
   - Model serving patterns
   - Canary deployments
   - Blue-green 部署 strategies
   - Rollback mechanisms

### Reference Documentation

See the `references/` directory for detailed guides:
- **data-preparation.md** - Data cleaning, validation, and feature engineering
- **model-training.md** - Training workflows and 最佳实践
- **model-validation.md** - Validation strategies and metrics
- **model-部署.md** - 部署 patterns and serving architectures

### Assets and Templates

The `assets/` directory contains:
- **pipeline-dag.yaml.template** - DAG template for 工作流 orchestration
- **training-config.yaml** - Training 配置 template
- **validation-checklist.md** - Pre-部署 validation checklist

## Usage Patterns

### Basic Pipeline 设置

```python
# 1. Define pipeline stages
stages = [
    "data_ingestion",
    "data_validation",
    "feature_engineering",
    "model_training",
    "model_validation",
    "model_deployment"
]

# 2. Configure dependencies
# See assets/pipeline-dag.yaml.template for full example
```

### Production 工作流

1. **Data Preparation Phase**
   - Ingest raw data from sources
   - Run data quality checks
   - Apply feature transformations
   - Version processed datasets

2. **Training Phase**
   - Load versioned training data
   - Execute training jobs
   - Track experiments and metrics
   - Save trained models

3. **Validation Phase**
   - Run validation test suite
   - Compare against baseline
   - Generate performance reports
   - Approve for 部署

4. **部署 Phase**
   - Package model artifacts
   - Deploy to serving infrastructure
   - Configure monitoring
   - Validate production traffic

## 最佳实践

### Pipeline Design

- **Modularity**: Each stage should be independently testable
- **Idempotency**: Re-running stages should be safe
- **Observability**: Log metrics at every stage
- **Versioning**: Track data, code, and model versions
- **Failure Handling**: Implement retry logic and alerting

### Data Management

- Use data validation libraries (Great Expectations, TFX)
- Version datasets with DVC or similar tools
- Document feature engineering transformations
- Maintain data lineage tracking

### Model Operations

- Separate training and serving infrastructure
- Use model registries (MLflow, Weights & Biases)
- Implement gradual rollouts for new models
- Monitor model performance drift
- Maintain rollback 能力

### 部署 Strategies

- Start with shadow deployments
- Use canary releases for validation
- Implement A/B testing infrastructure
- Set up automated rollback triggers
- Monitor latency and throughput

## 集成 Points

### Orchestration Tools

- **Apache Airflow**: DAG-based 工作流 orchestration
- **Dagster**: Asset-based pipeline orchestration
- **Kubeflow Pipelines**: Kubernetes-native ML workflows
- **Prefect**: Modern dataflow automation

### Experiment Tracking

- MLflow for experiment tracking and model registry
- Weights & Biases for visualization and collaboration
- TensorBoard for training metrics

### 部署 Platforms

- AWS SageMaker for managed ML infrastructure
- Google Vertex AI for GCP deployments
- Azure ML for Azure cloud
- Kubernetes + KServe for cloud-agnostic serving

## Progressive Disclosure

Start with the basics and gradually add complexity:

1. **Level 1**: Simple linear pipeline (data → train → deploy)
2. **Level 2**: Add validation and monitoring stages
3. **Level 3**: Implement hyperparameter tuning
4. **Level 4**: Add A/B testing and gradual rollouts
5. **Level 5**: Multi-model pipelines with ensemble strategies

## 常见模式

### Batch Training Pipeline

```yaml
# See assets/pipeline-dag.yaml.template
stages:
  - name: data_preparation
    dependencies: []
  - name: model_training
    dependencies: [data_preparation]
  - name: model_evaluation
    dependencies: [model_training]
  - name: model_deployment
    dependencies: [model_evaluation]
```

### Real-time Feature Pipeline

```python
# Stream processing for real-time features
# Combined with batch training
# See references/data-preparation.md
```

### Continuous Training

```python
# Automated retraining on schedule
# Triggered by data drift detection
# See references/model-training.md
```

## 故障排除

### Common Issues

- **Pipeline failures**: Check dependencies and data availability
- **Training instability**: Review hyperparameters and data quality
- **部署 issues**: Validate model artifacts and serving config
- **Performance degradation**: Monitor data drift and model metrics

### Debugging Steps

1. Check pipeline logs for each stage
2. Validate input/output data at boundaries
3. Test components in isolation
4. Review experiment tracking metrics
5. Inspect model artifacts and metadata

## 后续步骤

After setting up your pipeline:

1. Explore **hyperparameter-tuning** skill for optimization
2. Learn **experiment-tracking-设置** for MLflow/W&B
3. Review **model-部署-patterns** for serving strategies
4. Implement monitoring with observability tools

## 相关技能

- **experiment-tracking-设置**: MLflow and Weights & Biases 集成
- **hyperparameter-tuning**: Automated hyperparameter optimization
- **model-部署-patterns**: Advanced 部署 strategies

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
