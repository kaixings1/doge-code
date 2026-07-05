---
name: 模型部署
description: "以 REST API 部署 ML 模型：FastAPI、Flask、Docker 容器化、云部署（AWS SageMaker、GCP Vertex AI、Azure ML）及无服务器方案。适用于将模型从 notebook 迁移到生产环境。"
---
# Model Deployment

## 目的
Deploy trained ML models as production services with proper API design, containerization, and scaling.

## 工作原理

### 步骤 1: Package Model
- Serialize model (joblib, pickle, ONNX, TorchScript)
- Define input/output schema (Pydantic models)
- Create prediction function with preprocessing

### 步骤 2: Build API

| Framework | Best For |
