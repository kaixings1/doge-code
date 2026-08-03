---
name: data-versioning
description: "Version datasets and models: DVC, LakeFS, Delta Lake for tracking data changes, reproducing experiments, and maintaining data lineage. Use when you need reproducibility or data governance."
---
# Data Versioning

## Purpose
Track dataset and model versions to ensure reproducibility and maintain data lineage.

## How It Works

### Tool Selection

| Tool | Best For | Storage |
|------|----------|---------|
| DVC | Git-based, ML projects | S3, GCS, local |
| LakeFS | Data lake versioning | S3-compatible |
| Delta Lake | Spark/Databricks | Cloud storage |
| Git LFS | Small binary files | Git remote |

### DVC Workflow
1. Initialize DVC in your git repo
2. Track data files with `dvc add`
3. Push data to remote storage
4. Version with git commits
5. Reproduce with `dvc repro`

### Best Practices
- Never commit large data to git
- Tag important data versions (training sets, releases)
- Document data changes in commit messages
- Automate data validation on version changes

## Usage Examples

```
"Set up DVC to version our training datasets stored on S3"
```

## Output Format

- **Setup Guide**: Tool installation and configuration
- **Workflow**: How to version, retrieve, and compare data
- **Python Code**: Programmatic versioning integration
