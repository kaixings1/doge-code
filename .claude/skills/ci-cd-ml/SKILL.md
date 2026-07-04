---
name: ML CI/CD管道
description: "为 ML 项目设置 CI/CD：自动化测试（数据验证、模型质量门）、模型注册集成、分阶段部署（影子、金丝雀、蓝绿）和回滚策略。适用于建立 MLOps 实践。"
---
# ML 的 CI/CD

## 目的
使用适当的质量门自动化 ML 模型的测试、验证和部署。

## 工作原理

### ML 特定的 CI 检查
- 数据验证（schema、分布、质量）
- 训练可复现性（相同数据→相同模型±容差）
- 模型质量门（准确率>阈值、无回归）
- 性能基准（延迟、内存、吞吐量）
- 偏差和公平性检查

### 部署策略

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
