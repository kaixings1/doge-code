---
name: experiment-tracking
description: "Track ML experiments with MLflow, Weights & Biases, or DVC: log parameters, metrics, artifacts, and model versions. Compare runs, reproduce results, and collaborate with your team. Use when running experiments and needing to track what works."
---
# Experiment Tracking

## Purpose
Set up experiment tracking to log, compare, and reproduce ML experiments systematically.

## How It Works

### Step 1: Choose Platform

| Platform | Best For | Self-Hosted? |
|----------|----------|-------------|
| MLflow | Open-source, flexible | Yes |
| W&B | Rich UI, collaboration | Cloud/Yes |
| DVC | Git-based, data versioning | Yes |
| Neptune | Team collaboration | Cloud |
| CometML | Production monitoring | Cloud |

### Step 2: Configure Tracking
- Log hyperparameters, metrics, and artifacts per run
- Version datasets and model files
- Tag experiments with metadata
- Set up automatic logging (autolog)

### Step 3: Compare & Analyze
- Side-by-side run comparison
- Parameter importance analysis
- Metric visualization over time
- Best run selection

### Step 4: Reproduce
- Log environment (requirements.txt, Docker)
- Log git commit hash
- Store config files alongside runs

## Usage Examples

```
"Set up MLflow tracking for our XGBoost experiments"
```

```
"Compare the last 10 training runs and find the best configuration"
```

## Output Format

- **Setup Code**: Platform initialization and logging configuration
- **Logging Template**: What to track per experiment
- **Comparison Dashboard**: How to analyze runs
- **Python Code**: Complete MLflow/W&B integration
