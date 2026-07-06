---
name: 数据版本管理
description: "数据集和模型版本管理：DVC、LakeFS、Delta Lake 用于跟踪数据变更、复现实验和维护数据血缘。适用于需要可复现性或数据治理的场景。"
---
# 数据版本管理

## 目的
跟踪数据集和模型版本以确保可复现性和维护数据血缘。

## 工作原理

### 工具选择

| 工具 | 最适合 | 存储 |
|------|----------|---------|
| DVC | 基于 Git 的 ML 项目 | S3、GCS、本地 |
| LakeFS | 数据湖版本管理 | S3 兼容 |
| Delta Lake | Spark/Databricks | 云存储 |
| Git LFS | 小二进制文件 | Git 远程 |

### DVC 工作流
1. Initialize DVC in your git repo
2. Track data files with `dvc add`
3. Push data to remote storage
4. Version with git commits
5. Reproduce with `dvc repro`

### 最佳实践
- Never commit large data to git
- Tag important data versions (training sets, releases)
- Document data changes in commit messages
- Automate data validation on version changes

## 使用示例

```
"Set up DVC to version our training datasets stored on S3"
```

## 输出格式

- **设置 Guide**: Tool installation and 配置
- **工作流**: How to version, retrieve, and compare data
- **Python Code**: Programmatic versioning 集成
