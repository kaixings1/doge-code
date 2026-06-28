---
name: 模型部署
description: "以 REST API 部署 ML 模型：FastAPI、Flask、Docker 容器化、云部署（AWS SageMaker、GCP Vertex AI、Azure ML）及无服务器方案。适用于将模型从 notebook 迁移到生产环境。"
---
# Model Deployment

## Purpose
Deploy trained ML models as production services with proper API design, containerization, and scaling.

## How It Works

### Step 1: Package Model
- Serialize model (joblib, pickle, ONNX, TorchScript)
- Define input/output schema (Pydantic models)
- Create prediction function with preprocessing

### Step 2: Build API

| Framework | Best For |
|-----------|----------|
| FastAPI | Modern, async, auto-docs |
| Flask | Simple, widely known |
| BentoML | ML-specific, batching |
| Ray Serve | Scalable, composable |

### Step 3: Containerize
- Dockerfile with minimal base image
- Multi-stage build for smaller images
- Health check endpoint
- Environment variable configuration

### Step 4: Deploy

| Target | Complexity | Scaling |
|--------|-----------|---------|
| Docker Compose | Low | Manual |
| AWS SageMaker | Medium | Auto |
| GCP Vertex AI | Medium | Auto |
| Kubernetes | High | Full control |
| Serverless (Lambda) | Low | Auto |

### Step 5: Test & Monitor
- Load testing (locust, k6)
- Latency and throughput benchmarks
- Error handling and fallbacks

## Usage Examples

```
"Deploy my scikit-learn model as a FastAPI endpoint in Docker"
```

```
"Set up a SageMaker endpoint for real-time inference"
```

## Output Format

- **API Code**: FastAPI/Flask application
- **Dockerfile**: Production-ready container
- **Deployment Config**: Cloud/K8s configuration
- **Test Script**: API testing and load testing code
