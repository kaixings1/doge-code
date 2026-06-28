---
name: 基础设施设计
description: "设计 ML 基础设施：特征存储、模型注册、实验平台和计算管理。涵盖从小团队到企业规模的架构模式。适用于规划 ML 平台架构。"
---
# Infrastructure Design

## Purpose
Design ML infrastructure that scales with your team — from single-person setups to enterprise platforms.

## How It Works

### Core Components

| Component | Purpose | Tools |
|-----------|---------|-------|
| Feature Store | Reusable features, online/offline | Feast, Tecton |
| Model Registry | Version, stage, deploy models | MLflow, Vertex AI |
| Experiment Platform | Track and compare experiments | MLflow, W&B |
| Compute | Training infrastructure | Spot instances, K8s |
| Data Platform | Storage, processing, governance | Databricks, Snowflake |

### Architecture by Team Size

**Solo/Small team (1-5):**
- MLflow (local) + DVC + FastAPI + Docker

**Medium team (5-20):**
- MLflow (server) + Prefect + Feature Store + K8s

**Enterprise (20+):**
- Full platform: Vertex AI / SageMaker / Databricks

## Usage Examples

```
"Design an ML platform for a team of 8 data scientists"
```

## Output Format

- **Architecture Diagram**: Component layout and data flow
- **Tool Recommendations**: Specific tools per component
- **Implementation Roadmap**: Phased rollout plan
- **Cost Estimate**: Infrastructure costs by tier
