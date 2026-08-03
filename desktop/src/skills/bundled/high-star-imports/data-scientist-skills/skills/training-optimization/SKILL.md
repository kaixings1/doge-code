---
name: training-optimization
description: "Optimize deep learning training: learning rate schedules (cosine, warm-up, one-cycle), regularization (dropout, weight decay, label smoothing), early stopping, mixed precision, gradient accumulation, and distributed training. Use when improving training speed, stability, or model performance."
---

# Training Optimization

## Purpose
Optimize neural network training for faster convergence, better generalization, and efficient resource usage.

## How It Works

### Learning Rate Strategies
- **Warm-up**: Gradually increase LR from small value (prevents early divergence)
- **Cosine annealing**: Smooth decay following cosine curve
- **One-cycle**: Warm-up → peak → cosine decay (fastest convergence)
- **Reduce on plateau**: Drop LR when validation loss stalls
- **Learning rate finder**: Sweep to find optimal range

### Regularization
- **Dropout**: 0.1-0.5 between layers (higher for larger models)
- **Weight decay**: 0.01-0.1 (L2 regularization via optimizer)
- **Label smoothing**: 0.1 (prevents overconfident predictions)
- **Data augmentation**: Task-specific augmentations
- **Batch normalization**: Stabilizes training, mild regularization
- **Stochastic depth**: Randomly drop layers during training

### Efficiency
- **Mixed precision (fp16/bf16)**: 2x speed, half memory
- **Gradient accumulation**: Simulate larger batch sizes
- **Gradient checkpointing**: Trade compute for memory
- **Compiled models**: torch.compile() for speed
- **Distributed training**: DataParallel, DistributedDataParallel

### Monitoring
- Track train/val loss, learning rate, gradient norms
- Use W&B, TensorBoard, or MLflow
- Early stopping with patience (5-10 epochs typical)
- Watch for gradient explosion/vanishing

## Usage Examples

```
"My model is overfitting after 10 epochs — what regularization should I add?"
```

```
"Optimize training speed — I'm training on a single GPU and it takes 8 hours"
```

## Output Format

- **Optimization Plan**: Recommended changes with rationale
- **Training Configuration**: Complete config (optimizer, scheduler, regularization)
- **PyTorch Code**: Training loop with all optimizations
- **Monitoring Setup**: W&B / TensorBoard configuration
