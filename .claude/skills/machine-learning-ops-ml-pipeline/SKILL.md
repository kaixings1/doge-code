---
name: machine-learning-ops-ml-pipeline
description: "设计和实现完整的 ML 流水线，用于：$ARGUMENTS"
risk: unknown
source: community
date_added: "2026-02-27"
---

# Machine Learning Pipeline - Multi-Agent MLOps Orchestration

Design and implement a complete ML pipeline for: $ARGUMENTS

## 使用此技能的场景

- Working on machine learning pipeline - multi-agent mlops orchestration tasks or workflows
- Needing guidance, 最佳实践, or checklists for machine learning pipeline - multi-agent mlops orchestration

## 不要使用此技能的场景

- The task is unrelated to machine learning pipeline - multi-agent mlops orchestration
- You need a different domain or tool outside this scope

## 使用说明

- Clarify goals, constraints, and required inputs.
- Apply relevant 最佳实践 and validate outcomes.
- Provide actionable steps and verification.
- If detailed 示例 are required, open `resources/implementation-playbook.md`.

## Thinking

This 工作流 orchestrates multiple specialized agents to build a production-ready ML pipeline following modern MLOps 最佳实践. The 方法 emphasizes:

- **Phase-based coordination**: Each phase builds upon previous outputs, with clear handoffs between agents
- **Modern tooling 集成**: MLflow/W&B for experiments, Feast/Tecton for features, KServe/Seldon for serving
- **Production-first mindset**: Every component designed for scale, monitoring, and reliability
- **Reproducibility**: Version control for data, models, and infrastructure
- **Continuous improvement**: Automated retraining, A/B testing, and drift detection

The multi-agent 方法 ensures each aspect is handled by domain experts:
- Data engineers handle ingestion and quality
- Data scientists design features and experiments
- ML engineers implement training pipelines
- MLOps engineers handle production 部署
- Observability engineers ensure monitoring

## Phase 1: Data & Requirements Analysis

<Task>
subagent_type: data-engineer
prompt: |
  Analyze and design data pipeline for ML system with requirements: $ARGUMENTS

  Deliverables:
  1. Data source audit and ingestion strategy:
     - Source systems and connection patterns
     - 架构 validation using Pydantic/Great Expectations
     - Data versioning with DVC or lakeFS
     - Incremental loading and CDC strategies

  2. Data quality framework:
     - Profiling and statistics generation
     - Anomaly detection rules
     - Data lineage tracking
     - Quality gates and SLAs

  3. Storage architecture:
     - Raw/processed/feature layers
     - Partitioning strategy
     - Retention policies
     - Cost optimization

  Provide implementation code for critical components and 集成 patterns.
</Task>

<Task>
subagent_type: data-scientist
prompt: |
  Design feature engineering and model requirements for: $ARGUMENTS
  Using data architecture from: {phase1.data-engineer.output}

  Deliverables:
  1. Feature engineering pipeline:
     - Transformation specifications
     - Feature store 架构 (Feast/Tecton)
     - Statistical validation rules
     - Handling strategies for missing data/outliers

  2. Model requirements:
     - Algorithm selection rationale
     - Performance metrics and baselines
     - Training data requirements
     - Evaluation criteria and thresholds

  3. Experiment design:
     - Hypothesis and success metrics
     - A/B testing methodology
     - Sample size calculations
     - Bias detection 方法

  Include feature transformation code and statistical validation logic.
</Task>

## Phase 2: Model Development & Training

<Task>
subagent_type: ml-engineer
prompt: |
  Implement training pipeline based on requirements: {phase1.data-scientist.output}
  Using data pipeline: {phase1.data-engineer.output}

  Build comprehensive training system:
  1. Training pipeline implementation:
     - Modular training code with clear interfaces
     - Hyperparameter optimization (Optuna/Ray Tune)
     - Distributed training support (Horovod/PyTorch DDP)
     - Cross-validation and ensemble strategies

  2. Experiment tracking 设置:
     - MLflow/Weights & Biases 集成
     - Metric logging and visualization
     - Artifact management (models, plots, data samples)
     - Experiment comparison and analysis tools

  3. Model registry 集成:
     - Version control and tagging strategy
     - Model metadata and lineage
     - Promotion workflows (dev -> staging -> prod)
     - Rollback procedures

  Provide complete training code with 配置 management.
</Task>

<Task>
subagent_type: python-pro
prompt: |
  Optimize and productionize ML code from: {phase2.ml-engineer.output}

  Focus areas:
  1. Code quality and structure:
     - Refactor for production standards
     - Add comprehensive error handling
     - Implement proper logging with structured formats
     - Create reusable components and utilities

  2. Performance optimization:
     - Profile and optimize bottlenecks
     - Implement caching strategies
     - Optimize data loading and preprocessing
     - Memory management for large-scale training

  3. Testing framework:
     - Unit tests for data transformations
     - 集成 tests for pipeline components
     - Model quality tests (invariance, directional)
     - Performance regression tests

  Deliver production-ready, maintainable code with full test coverage.
</Task>

## Phase 3: Production 部署 & Serving

<Task>
subagent_type: mlops-engineer
prompt: |
  Design production 部署 for models from: {phase2.ml-engineer.output}
  With optimized code from: {phase2.python-pro.output}

  Implementation requirements:
  1. Model serving infrastructure:
     - REST/gRPC APIs with FastAPI/TorchServe
     - Batch prediction pipelines (Airflow/Kubeflow)
     - Stream processing (Kafka/Kinesis 集成)
     - Model serving platforms (KServe/Seldon Core)

  2. 部署 strategies:
     - Blue-green deployments for zero downtime
     - Canary releases with traffic splitting
     - Shadow deployments for validation
     - A/B testing infrastructure

  3. CI/CD pipeline:
     - GitHub Actions/GitLab CI workflows
     - Automated testing gates
     - Model validation before 部署
     - ArgoCD for GitOps 部署

  4. Infrastructure as Code:
     - Terraform modules for cloud resources
     - Helm charts for Kubernetes deployments
     - Docker multi-stage builds for optimization
     - Secret management with Vault/Secrets Manager

  Provide complete 部署 配置 and automation scripts.
</Task>

<Task>
subagent_type: kubernetes-architect
prompt: |
  Design Kubernetes infrastructure for ML workloads from: {phase3.mlops-engineer.output}

  Kubernetes-specific requirements:
  1. Workload orchestration:
     - Training job scheduling with Kubeflow
     - GPU resource allocation and sharing
     - Spot/preemptible instance 集成
     - Priority classes and resource quotas

  2. Serving infrastructure:
     - HPA/VPA for autoscaling
     - KEDA for event-driven scaling
     - Istio service mesh for traffic management
     - Model caching and warm-up strategies

  3. Storage and data access:
     - PVC strategies for training data
     - Model artifact storage with CSI drivers
     - Distributed storage for feature stores
     - Cache layers for inference optimization

  Provide Kubernetes manifests and Helm charts for entire ML platform.
</Task>

## Phase 4: Monitoring & Continuous Improvement

<Task>
subagent_type: observability-engineer
prompt: |
  Implement comprehensive monitoring for ML system deployed in: {phase3.mlops-engineer.output}
  Using Kubernetes infrastructure: {phase3.kubernetes-architect.output}

  Monitoring framework:
  1. Model performance monitoring:
     - Prediction accuracy tracking
     - Latency and throughput metrics
     - Feature importance shifts
     - Business KPI correlation

  2. Data and model drift detection:
     - Statistical drift detection (KS test, PSI)
     - Concept drift monitoring
     - Feature distribution tracking
     - Automated drift alerts and reports

  3. System observability:
     - Prometheus metrics for all components
     - Grafana dashboards for visualization
     - Distributed tracing with Jaeger/Zipkin
     - Log aggregation with ELK/Loki

  4. Alerting and automation:
     - PagerDuty/Opsgenie 集成
     - Automated retraining triggers
     - Performance degradation workflows
     - Incident 响应 runbooks

  5. Cost tracking:
     - Resource utilization metrics
     - Cost allocation by model/experiment
     - Optimization recommendations
     - Budget alerts and controls

  Deliver monitoring 配置, dashboards, and alert rules.
</Task>

## 配置 Options

- **experiment_tracking**: mlflow | wandb | neptune | clearml
- **feature_store**: feast | tecton | databricks | custom
- **serving_platform**: kserve | seldon | torchserve | triton
- **orchestration**: kubeflow | airflow | prefect | dagster
- **cloud_provider**: aws | azure | gcp | multi-cloud
- **deployment_mode**: realtime | batch | streaming | hybrid
- **monitoring_stack**: prometheus | datadog | newrelic | custom

## Success Criteria

1. **Data Pipeline Success**:
   - < 0.1% data quality issues in production
   - Automated data validation passing 99.9% of time
   - Complete data lineage tracking
   - Sub-second feature serving latency

2. **Model Performance**:
   - Meeting or exceeding baseline metrics
   - < 5% performance degradation before retraining
   - Successful A/B tests with statistical significance
   - No undetected model drift > 24 hours

3. **Operational Excellence**:
   - 99.9% uptime for model serving
   - < 200ms p99 inference latency
   - Automated rollback within 5 minutes
   - Complete observability with < 1 minute alert time

4. **Development Velocity**:
   - < 1 hour from commit to production
   - Parallel experiment execution
   - Reproducible training runs
   - Self-service model 部署

5. **Cost Efficiency**:
   - < 20% infrastructure waste
   - Optimized resource allocation
   - Automatic scaling based on load
   - Spot instance utilization > 60%

## Final Deliverables

Upon completion, the orchestrated pipeline will provide:
- End-to-end ML pipeline with full automation
- Comprehensive documentation and runbooks
- Production-ready infrastructure as code
- Complete monitoring and alerting system
- CI/CD pipelines for continuous improvement
- Cost optimization and scaling strategies
- Disaster recovery and rollback procedures

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
